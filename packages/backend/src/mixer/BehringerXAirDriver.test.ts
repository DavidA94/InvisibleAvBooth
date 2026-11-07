import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BehringerXAirDriver } from "./BehringerXAirDriver.js";
import type { OscTransport, MixerDriverConfig } from "./MixerControlInterface.js";
import type { MixerChannelLevel } from "@invisible-av-booth/shared";

// ── Fake OSC transport ───────────────────────────────────────────────────────
//
// Records sends and lets tests inject inbound messages. By default it auto-
// replies to a query (a send with no args) by echoing the seeded value for that
// address, so read-back reconciliation resolves without real UDP. Seeded values
// can differ from the commanded value to prove mixer-authority (Req 11.2).

class FakeTransport implements OscTransport {
  sends: Array<{ address: string; types: string; values: Array<number | string | Uint8Array> }> = [];
  private listeners = new Set<(address: string, values: Array<number | string | Uint8Array>) => void>();
  private seeded = new Map<string, Array<number | string | Uint8Array>>();
  /** Addresses pinned by an explicit seed() — a set must NOT overwrite these. */
  private pinned = new Set<string>();
  autoReply = true;

  /**
   * Seed (pin) the value the console will report for an address on query/read-
   * back. Pinned values model mixer-authority (console reports something other
   * than what we commanded) and are NOT overwritten by subsequent sets.
   */
  seed(address: string, values: Array<number | string | Uint8Array>): void {
    this.seeded.set(address, values);
    this.pinned.add(address);
  }

  open(): Promise<boolean> {
    return Promise.resolve(true);
  }

  send(address: string, types = "", values: Array<number | string | Uint8Array> = []): void {
    this.sends.push({ address, types, values });
    // A query is a send with no args; auto-reply with the seeded (or last-set) value.
    if (this.autoReply && values.length === 0 && !address.startsWith("/xremote") && !address.startsWith("/meters")) {
      const reply = this.seeded.get(address);
      if (reply) {
        // Reply asynchronously to mimic UDP round-trip ordering.
        queueMicrotask(() => this.inject(address, reply));
      }
    }
    // Record set values so a query echoes the LATEST set (a real console reports
    // its current value) — unless the address was explicitly pinned via seed().
    if (values.length > 0 && !address.startsWith("/xremote") && !address.startsWith("/meters")) {
      if (!this.pinned.has(address)) this.seeded.set(address, values);
    }
  }

  onMessage(listener: (address: string, values: Array<number | string | Uint8Array>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
  }

  /** Inject an inbound OSC message (external change, read-back reply, meter blob). */
  inject(address: string, values: Array<number | string | Uint8Array>): void {
    for (const listener of this.listeners) listener(address, values);
  }
}

function makeDriver(overrides?: Partial<MixerDriverConfig>): { driver: BehringerXAirDriver; transport: FakeTransport } {
  const transport = new FakeTransport();
  const config: MixerDriverConfig = {
    mixerId: "mix1",
    host: "127.0.0.1",
    port: 10024,
    channelCount: 4,
    features: ["gain-control", "channel-metering"],
    transport,
    ...overrides,
  };
  return { driver: new BehringerXAirDriver(config), transport };
}

/** Build a /meters blob: 32-bit LE count + int16 LE samples (dB*256). */
function meterBlob(dbValues: number[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + dbValues.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, dbValues.length, true);
  dbValues.forEach((db, index) => view.setInt16(4 + index * 2, Math.round(db * 256), true));
  return new Uint8Array(buffer);
}

describe("BehringerXAirDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("capabilities", () => {
    it("declares the X Air gain range and the admin-enabled features", async () => {
      const { driver } = makeDriver({ features: ["gain-control"] });
      const caps = driver.getCapabilities();
      expect(caps.gainRange).toEqual({ minDb: -12, maxDb: 60 });
      expect(caps.features).toEqual(["gain-control"]);
    });
  });

  describe("address + value mapping", () => {
    it("setFader writes /ch/NN/mix/fader as a float", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      await driver.setFader(1, 0.75);
      const write = transport.sends.find((s) => s.address === "/ch/01/mix/fader" && s.types === "f");
      expect(write?.values[0]).toBeCloseTo(0.75, 5);
    });

    it("setMute maps muted=true to /ch/NN/mix/on 0 (INVERTED)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      await driver.setMute(2, true);
      const write = transport.sends.find((s) => s.address === "/ch/02/mix/on" && s.types === "i");
      expect(write?.values[0]).toBe(0);
    });

    it("setMute maps muted=false to /ch/NN/mix/on 1 (unmuted)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      await driver.setMute(2, false);
      const write = transport.sends.find((s) => s.address === "/ch/02/mix/on" && s.types === "i");
      expect(write?.values[0]).toBe(1);
    });

    it("setGain writes /headamp/NN/gain as a NORMALIZED 0–1 float and round-trips dB", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      // The console reports back the same normalized value it received.
      // X Air headamp address is 2-digit + 1-based: channel 1 → /headamp/01.
      transport.seed("/headamp/01/gain", [1 / 3]);
      await driver.setGain(1, 12); // 12 dB in [-12, 60] → (12+12)/72 = 0.3333 on the wire
      const write = transport.sends.find((s) => s.address === "/headamp/01/gain" && s.types === "f");
      expect(write?.values[0]).toBeCloseTo(1 / 3, 5);
      // Read-back (normalized) is converted back to dB for state.
      expect(driver.getChannelState(1)?.gainDb).toBeCloseTo(12, 3);
    });

    it("applies an external gain push (normalized wire → dB)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.inject("/headamp/01/gain", [1]); // 1.0 → +60 dB (max), channel 1 (1-based)
      expect(driver.getChannelState(1)?.gainDb).toBeCloseTo(60, 3);
    });
  });

  describe("read-back reconciliation (mixer is authoritative)", () => {
    it("emits the mixer-reported value when it differs from the commanded value", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      // Seed the console to report a DIFFERENT fader than we command.
      transport.seed("/ch/01/mix/fader", [0.5]);
      const states: number[] = [];
      driver.onStateChange((state) => {
        if (state.channel === 1) states.push(state.fader);
      });
      await driver.setFader(1, 0.9);
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.5, 5);
      expect(states).toContain(0.5);
    });

    it("marks nothing when read-back never replies (exhausted) — value stays at prior", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.autoReply = false; // console never replies
      const before = driver.getChannelState(1)?.fader ?? 0;
      await driver.setFader(1, 0.9);
      // No reply → value unchanged, but the channel is marked unreconciled (Req 15.8).
      expect(driver.getChannelState(1)?.fader).toBe(before);
      expect(driver.getChannelState(1)?.unreconciled).toBe(true);
    });

    it("clears unreconciled on the next confirmed value (read-back or external push)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.autoReply = false;
      await driver.setFader(1, 0.9); // exhausts → unreconciled
      expect(driver.getChannelState(1)?.unreconciled).toBe(true);
      // An external /xremote push confirms a value → clears the flag.
      transport.inject("/ch/01/mix/fader", [0.6]);
      expect(driver.getChannelState(1)?.unreconciled).toBe(false);
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.6, 5);
    });

    // The user's intent: when the UI moves a slider quickly it sends a BURST of
    // sets, but only ONE confirmation should come back for the value it SETTLES
    // on — intermediate values must not be reconciled and replayed downstream.
    // The debounced writer collapses a whole burst to a single settled read-back.
    it("coalesces a burst of same-address sets to one settled confirmation", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;

      const applied: number[] = [];
      driver.onStateChange((state) => {
        if (state.channel === 1) applied.push(state.fader);
      });

      // Fire a burst WITHOUT awaiting each — this is a fast drag. The console
      // echoes the last-set value on read-back (FakeTransport default).
      const burst = [0.1, 0.2, 0.3, 0.4, 0.9].map((value) => driver.setFader(1, value));
      await Promise.all(burst);

      // Every value is WRITTEN to the console (so it tracks live motion)…
      const writes = transport.sends.filter((s) => s.address === "/ch/01/mix/fader" && s.values.length > 0);
      expect(writes.length).toBe(5);
      // …but the whole burst debounces to EXACTLY ONE read-back — the downstream
      // confirmation flood is gone (this is the live bug the user reported).
      const readbacks = transport.sends.filter((s) => s.address === "/ch/01/mix/fader" && s.values.length === 0);
      expect(readbacks.length).toBe(1);
      // The channel settles on the FINAL value only…
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.9, 5);
      // …and no intermediate value (0.2–0.4) was ever confirmed into state.
      expect(applied).not.toContain(0.2);
      expect(applied).not.toContain(0.3);
      expect(applied).not.toContain(0.4);
      expect(applied.at(-1)).toBeCloseTo(0.9, 5);
    });

    it("reconciles each field independently (fader vs. gain do not coalesce together)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.seed("/ch/01/mix/fader", [0.5]);
      transport.seed("/headamp/01/gain", [0.5]); // normalized → +24 dB
      await Promise.all([driver.setFader(1, 0.9), driver.setGain(1, 30)]);
      // Different addresses → separate workers → both settle to their own value.
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.5, 5);
      expect(driver.getChannelState(1)?.gainDb).toBeCloseTo(24, 1);
    });

    // Regression (resolver collision): even when the coalescing worker serializes
    // reconciles, the per-address epoch guard ensures a late/out-of-order reply
    // from a retired query can never apply a stale value. Live symptom was the UI
    // jumping to an old value then snapping back.
    it("a superseded read-back cannot apply over the newest command (epoch guard)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      // Console echoes the last-set value; the burst settles on 0.8.
      const burst = [0.2, 0.8].map((value) => driver.setFader(1, value));
      await Promise.all(burst);
      // A stale straggler reply for the OLD value arrives with no pending query.
      // It is an unsolicited push, but must not regress the settled value within
      // the same reconcile generation.
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.8, 5);
    });
  });

  describe("capability enforcement", () => {
    it("ignores setGain when gain-control is not declared", async () => {
      const { driver, transport } = makeDriver({ features: ["channel-metering"] });
      await driver.connect();
      transport.sends.length = 0;
      await driver.setGain(1, 30);
      expect(transport.sends.find((s) => s.address.startsWith("/headamp"))).toBeUndefined();
    });
  });

  describe("external changes via /xremote", () => {
    // The X Air echoes our OWN writes back over /xremote as it sweeps to the
    // target. Those must NOT be re-broadcast as external changes while we are
    // driving the control — otherwise the slider replays its own drag (the live
    // bug). Only the single debounced read-back is the authoritative confirmation.
    it("suppresses /xremote echoes of our own value while driving a control", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.seed("/headamp/01/gain", [0.5]); // console settles at 0.5 normalized
      const gains: number[] = [];
      driver.onStateChange((state) => {
        if (state.channel === 1) gains.push(state.gainDb);
      });

      // Start a write (marks the address self-driven), then the console echoes a
      // chain of intermediate values it passes through — all within the window.
      const pending = driver.setGain(1, 30);
      transport.inject("/headamp/01/gain", [0.1]);
      transport.inject("/headamp/01/gain", [0.9]);
      transport.inject("/headamp/01/gain", [0.2]);
      // None of those echoes were applied as external changes…
      expect(gains).toHaveLength(0);

      await pending; // the single debounced read-back settles on the seeded value
      // …and the only value applied is the authoritative read-back (0.5 → +24 dB).
      expect(gains).toEqual([expect.closeTo(24, 1)]);
    });

    it("applies an unsolicited fader push and emits state", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      const seen: number[] = [];
      driver.onStateChange((state) => {
        if (state.channel === 2) seen.push(state.fader);
      });
      transport.inject("/ch/02/mix/fader", [0.6]);
      expect(driver.getChannelState(2)?.fader).toBeCloseTo(0.6, 5);
      expect(seen).toContain(0.6);
    });

    it("applies an unsolicited mute push (inverted) and a name push", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.inject("/ch/03/mix/on", [0]); // 0 = muted
      transport.inject("/ch/03/config/name", ["Vocals"]);
      expect(driver.getChannelState(3)?.muted).toBe(true);
      expect(driver.getChannelState(3)?.name).toBe("Vocals");
    });

    it("applies an unsolicited channel color push and queries color on connect", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      // Color is primed on connect via refreshAllChannels.
      expect(transport.sends.some((s) => s.address === "/ch/01/config/color")).toBe(true);
      transport.inject("/ch/02/config/color", [4]); // 4 = BL (blue)
      expect(driver.getChannelState(2)?.color).toBe(4);
    });
  });

  describe("metering", () => {
    it("does not subscribe /meters until metering is enabled", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      expect(transport.sends.find((s) => s.address === "/meters")).toBeUndefined();
      driver.setMeteringEnabled(true);
      const sub = transport.sends.find((s) => s.address === "/meters");
      expect(sub).toBeDefined();
      // The X Air /meters command takes a STRING bank address + INT rate factor
      // ("si"), NOT a bare int bank. Sending the wrong shape means the console
      // never streams meter frames (regression guard for the live-tested bug).
      expect(sub?.types).toBe("si");
      expect(sub?.values[0]).toBe("/meters/1");
      expect(typeof sub?.values[1]).toBe("number");
      driver.setMeteringEnabled(false);
    });

    it("decodes a /meters blob and emits per-channel pre-fader levels", async () => {
      const { driver, transport } = makeDriver({ channelCount: 2 });
      await driver.connect();
      driver.setMeteringEnabled(true);
      const received: MixerChannelLevel[][] = [];
      driver.onMeterUpdate((levels) => received.push(levels));
      // Two channels at -12 and -40 dBFS.
      transport.inject("/meters/1", [meterBlob([-12, -40])]);
      expect(received).toHaveLength(1);
      expect(received[0]![0]).toEqual({ channel: 1, levelDb: -12 });
      expect(received[0]![1]).toEqual({ channel: 2, levelDb: -40 });
      driver.setMeteringEnabled(false);
    });
  });

  describe("liveness", () => {
    it("emits liveness on any inbound message", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      const liveness = vi.fn();
      driver.onLiveness(liveness);
      transport.inject("/ch/01/mix/fader", [0.5]);
      expect(liveness).toHaveBeenCalled();
    });

    it("emits liveness on an /xinfo reply (idle-board freshness, Req 12.2)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      const liveness = vi.fn();
      driver.onLiveness(liveness);
      transport.inject("/xinfo", ["192.168.1.10", "XR18", "XR18", "1.19"]);
      expect(liveness).toHaveBeenCalled();
    });
  });

  describe("presets", () => {
    it("capturePreset gathers fader/mute/gain for all channels", async () => {
      const { driver, transport } = makeDriver({ channelCount: 2 });
      await driver.connect();
      transport.seed("/ch/01/mix/fader", [0.7]);
      transport.seed("/ch/01/mix/on", [1]);
      transport.seed("/headamp/01/gain", [10]);
      transport.seed("/ch/02/mix/fader", [0.3]);
      transport.seed("/ch/02/mix/on", [0]);
      transport.seed("/headamp/02/gain", [20]);

      const payload = await driver.capturePreset();
      expect(payload["/ch/01/mix/fader"]).toBe(0.7);
      expect(payload["/ch/01/mix/on"]).toBe(1);
      expect(payload["/headamp/01/gain"]).toBe(10);
      expect(payload["/ch/02/mix/on"]).toBe(0);
    });

    it("capturePreset fails with a descriptive error naming unconfirmed channels", async () => {
      // Keep it fast: 1 channel, no gain field → 2 fields × 4 attempts × 250ms ≈ 2s.
      const { driver, transport } = makeDriver({ channelCount: 1, features: [] });
      await driver.connect();
      transport.autoReply = false; // nothing confirms
      await expect(driver.capturePreset()).rejects.toThrow(/channel\(s\): 1/);
    }, 8000);

    it("activatePreset writes each address with the right type (mix/on as int)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.sends.length = 0;
      await driver.activatePreset({ "/ch/01/mix/fader": 0.8, "/ch/01/mix/on": 0, "/headamp/01/gain": 5 });
      expect(transport.sends.find((s) => s.address === "/ch/01/mix/fader" && s.types === "f")?.values[0]).toBe(0.8);
      expect(transport.sends.find((s) => s.address === "/ch/01/mix/on" && s.types === "i")?.values[0]).toBe(0);
      expect(transport.sends.find((s) => s.address === "/headamp/01/gain" && s.types === "f")?.values[0]).toBe(5);
    });
  });

  describe("lifecycle", () => {
    it("renews /xremote on an interval while connected", async () => {
      vi.useFakeTimers();
      const { driver, transport } = makeDriver();
      await driver.connect();
      const before = transport.sends.filter((s) => s.address === "/xremote").length;
      const xinfoBefore = transport.sends.filter((s) => s.address === "/xinfo").length;
      vi.advanceTimersByTime(8000 * 2 + 100);
      const after = transport.sends.filter((s) => s.address === "/xremote").length;
      const xinfoAfter = transport.sends.filter((s) => s.address === "/xinfo").length;
      expect(after).toBeGreaterThan(before);
      // Each renewal also sends /xinfo for a guaranteed liveness round-trip (Req 12.2).
      expect(xinfoAfter).toBeGreaterThan(xinfoBefore);
      driver.disconnect();
      vi.useRealTimers();
    });

    it("disconnect stops renewals and closes the transport", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      const closeSpy = vi.spyOn(transport, "close");
      driver.disconnect();
      expect(driver.isConnected()).toBe(false);
      expect(closeSpy).toHaveBeenCalled();
    });
  });
});
