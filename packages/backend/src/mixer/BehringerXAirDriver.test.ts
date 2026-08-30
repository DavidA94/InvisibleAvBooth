import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BehringerXAirDriver } from "./BehringerXAirDriver.js";
import type { OscTransport, ChannelMonitorSink, MixerDriverConfig } from "./MixerControlInterface.js";
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
  autoReply = true;

  /** Seed the value the console will report for an address on query/read-back. */
  seed(address: string, values: Array<number | string | Uint8Array>): void {
    this.seeded.set(address, values);
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
    // Record set values so a subsequent query without an explicit seed echoes them.
    if (values.length > 0 && !address.startsWith("/xremote") && !address.startsWith("/meters")) {
      if (!this.seeded.has(address)) this.seeded.set(address, values);
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

const fakeCapture: ChannelMonitorSink = {
  startChannelMonitor: vi.fn(),
  stopChannelMonitor: vi.fn(),
};

function makeDriver(overrides?: Partial<MixerDriverConfig>): { driver: BehringerXAirDriver; transport: FakeTransport } {
  const transport = new FakeTransport();
  const config: MixerDriverConfig = {
    mixerId: "mix1",
    host: "127.0.0.1",
    port: 10024,
    channelCount: 4,
    features: ["gain-control", "channel-metering", "channel-audio-capture"],
    transport,
    ...overrides,
  };
  return { driver: new BehringerXAirDriver(config, fakeCapture), transport };
}

/** Build a /meters blob: 32-bit BE count + int16 LE samples (dB*256). */
function meterBlob(dbValues: number[]): Uint8Array {
  const buffer = new ArrayBuffer(4 + dbValues.length * 2);
  const view = new DataView(buffer);
  view.setUint32(0, dbValues.length, false);
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

    it("setGain writes /headamp/NNN/gain with a zero-based zero-padded index", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      await driver.setGain(1, 12);
      const write = transport.sends.find((s) => s.address === "/headamp/000/gain" && s.types === "f");
      expect(write?.values[0]).toBe(12);
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
  });

  describe("capability enforcement", () => {
    it("ignores setGain when gain-control is not declared", async () => {
      const { driver, transport } = makeDriver({ features: ["channel-metering"] });
      await driver.connect();
      transport.sends.length = 0;
      await driver.setGain(1, 30);
      expect(transport.sends.find((s) => s.address.startsWith("/headamp"))).toBeUndefined();
    });

    it("ignores startChannelMonitor when channel-audio-capture is not declared", async () => {
      const { driver } = makeDriver({ features: ["gain-control"] });
      await driver.connect();
      driver.startChannelMonitor(1);
      expect(fakeCapture.startChannelMonitor).not.toHaveBeenCalled();
    });

    it("delegates startChannelMonitor to the capture sink when capable", async () => {
      const { driver } = makeDriver();
      await driver.connect();
      driver.startChannelMonitor(3);
      expect(fakeCapture.startChannelMonitor).toHaveBeenCalledWith("mix1", 3);
    });
  });

  describe("external changes via /xremote", () => {
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
  });

  describe("metering", () => {
    it("does not subscribe /meters until metering is enabled", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;
      expect(transport.sends.find((s) => s.address === "/meters")).toBeUndefined();
      driver.setMeteringEnabled(true);
      expect(transport.sends.find((s) => s.address === "/meters")).toBeDefined();
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
  });

  describe("presets", () => {
    it("capturePreset gathers fader/mute/gain for all channels", async () => {
      const { driver, transport } = makeDriver({ channelCount: 2 });
      await driver.connect();
      transport.seed("/ch/01/mix/fader", [0.7]);
      transport.seed("/ch/01/mix/on", [1]);
      transport.seed("/headamp/000/gain", [10]);
      transport.seed("/ch/02/mix/fader", [0.3]);
      transport.seed("/ch/02/mix/on", [0]);
      transport.seed("/headamp/001/gain", [20]);

      const payload = await driver.capturePreset();
      expect(payload["/ch/01/mix/fader"]).toBe(0.7);
      expect(payload["/ch/01/mix/on"]).toBe(1);
      expect(payload["/headamp/000/gain"]).toBe(10);
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
      await driver.activatePreset({ "/ch/01/mix/fader": 0.8, "/ch/01/mix/on": 0, "/headamp/000/gain": 5 });
      expect(transport.sends.find((s) => s.address === "/ch/01/mix/fader" && s.types === "f")?.values[0]).toBe(0.8);
      expect(transport.sends.find((s) => s.address === "/ch/01/mix/on" && s.types === "i")?.values[0]).toBe(0);
      expect(transport.sends.find((s) => s.address === "/headamp/000/gain" && s.types === "f")?.values[0]).toBe(5);
    });
  });

  describe("lifecycle", () => {
    it("renews /xremote on an interval while connected", async () => {
      vi.useFakeTimers();
      const { driver, transport } = makeDriver();
      await driver.connect();
      const before = transport.sends.filter((s) => s.address === "/xremote").length;
      vi.advanceTimersByTime(8000 * 2 + 100);
      const after = transport.sends.filter((s) => s.address === "/xremote").length;
      expect(after).toBeGreaterThan(before);
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
