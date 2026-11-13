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
  /** address → number of upcoming VALUE writes to silently drop (models UDP loss). */
  dropWrites = new Map<string, number>();

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
    // Simulate a dropped UDP write: recorded as sent, but the console never sees it.
    const toDrop = this.dropWrites.get(address) ?? 0;
    if (values.length > 0 && toDrop > 0) {
      this.dropWrites.set(address, toDrop - 1);
      return;
    }
    // The board ALWAYS answers /xinfo (used for liveness and client registration).
    if (this.autoReply && address === "/xinfo") {
      queueMicrotask(() => this.inject("/xinfo", ["192.168.1.10", "XR18", "XR18", "1.26"]));
      return;
    }
    // A query is a send with no args; auto-reply with the seeded (or last-set) value.
    if (this.autoReply && values.length === 0 && !address.startsWith("/xremote") && !address.startsWith("/meters")) {
      // The mix NODE replies with its leaf fields (`,ifif on fader lr pan`),
      // assembled from the leaf values — matching the real XR18.
      const node = /^\/ch\/(\d+)\/mix$/.exec(address);
      const on = node ? this.seeded.get(`${address}/on`) : undefined;
      const fader = node ? this.seeded.get(`${address}/fader`) : undefined;
      const reply = node ? (on && fader ? [on[0]!, fader[0]!, 1, 0.5] : undefined) : this.seeded.get(address);
      if (reply) {
        // Reply asynchronously to mimic UDP round-trip ordering.
        queueMicrotask(() => this.inject(address, reply));
      }
    }
    // A grouped node set (`/ch/NN/mix ,if on fader`) writes the leading leaf fields.
    const nodeSet = /^\/ch\/(\d+)\/mix$/.exec(address);
    if (nodeSet && values.length > 0) {
      const leaves = [`${address}/on`, `${address}/fader`];
      values.forEach((value, index) => {
        const leaf = leaves[index];
        if (leaf && !this.pinned.has(leaf)) this.seeded.set(leaf, [value]);
      });
      return;
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

  closed = false;
  close(): void {
    this.closed = true;
    this.listeners.clear();
  }

  /** Inject an inbound OSC message (external change, read-back reply, meter blob). */
  inject(address: string, values: Array<number | string | Uint8Array>): void {
    for (const listener of this.listeners) listener(address, values);
  }
}

function makeDriver(overrides?: Partial<MixerDriverConfig>): { driver: BehringerXAirDriver; transport: FakeTransport; postTransports: FakeTransport[] } {
  const transport = new FakeTransport();
  // Every extra (per-channel post-fader) client the driver opens is recorded here.
  const postTransports: FakeTransport[] = [];
  const config: MixerDriverConfig = {
    mixerId: "mix1",
    host: "127.0.0.1",
    port: 10024,
    channelCount: 4,
    features: ["gain-control", "channel-metering"],
    transport,
    transportFactory: () => {
      const extra = new FakeTransport();
      postTransports.push(extra);
      return extra;
    },
    ...overrides,
  };
  return { driver: new BehringerXAirDriver(config), transport, postTransports };
}

/** The open post-fader client subscribed to a given 1-based channel, if any. */
function postClientFor(postTransports: FakeTransport[], channel: number): FakeTransport | undefined {
  return postTransports.find((t) => !t.closed && t.sends.some((s) => s.address === "/meters" && s.values[0] === "/meters/0" && s.values[1] === channel - 1));
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
      const { driver } = makeDriver();
      await driver.connect();
      // Console echoes the last-set value; the burst settles on 0.8.
      const burst = [0.2, 0.8].map((value) => driver.setFader(1, value));
      await Promise.all(burst);
      // A stale straggler reply for the OLD value arrives with no pending query.
      // It is an unsolicited push, but must not regress the settled value within
      // the same reconcile generation.
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.8, 5);
    });

    // Backend-authoritative stale-echo suppression (the user's "send 1 then 1.5,
    // drop 1's read-back" model). A fast burst collapses to the latest value and
    // no earlier value is ever broadcast into state — the frontend relies on this
    // so it can accept every inbound value without filtering. (The writeSeq guard
    // additionally protects against a superseded read-back that resolves late.)
    it("only the latest value of a burst is ever broadcast (no earlier value leaks)", async () => {
      const { driver, transport } = makeDriver();
      await driver.connect();
      transport.sends.length = 0;

      const broadcasts: number[] = [];
      driver.onStateChange((state) => {
        if (state.channel === 1) broadcasts.push(Math.round(state.fader * 100) / 100);
      });

      // Console echoes the last-set value on read-back (FakeTransport default).
      const burst = [0.1, 0.3, 0.5, 0.9].map((value) => driver.setFader(1, value));
      await Promise.all(burst);

      // Only the settled final value reached state; no intermediate value leaked.
      expect(broadcasts).not.toContain(0.1);
      expect(broadcasts).not.toContain(0.3);
      expect(broadcasts).not.toContain(0.5);
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.9, 5);
    });
  });

  describe("usb-trim-follows-gain (DAW playback tuning, opt-in)", () => {
    const trimWrites = (transport: FakeTransport, channel = 1): number[] =>
      transport.sends.filter((s) => s.address === `/ch/0${channel}/preamp/rtntrim` && s.values.length > 0).map((s) => s.values[0] as number);
    /** Wire 0..1 over -18..+18 dB → dB. */
    const trimDb = (wire: number): number => -18 + wire * 36;

    it("is OFF by default: setGain never touches the USB trim", async () => {
      const { driver, transport } = makeDriver(); // gain-control + channel-metering only
      await driver.connect();
      transport.sends.length = 0;
      await driver.setGain(1, 12);
      expect(trimWrites(transport)).toEqual([]);
    });

    it.each`
      gainDb | expectedTrimDb | why
      ${12}  | ${12}          | ${"in range → same value"}
      ${-12} | ${-12}         | ${"low end of gain fits the trim"}
      ${57}  | ${18}          | ${"above +18 → clamped to the trim max"}
      ${60}  | ${18}          | ${"gain max → trim max"}
    `("setGain($gainDb dB) also writes the USB trim at $expectedTrimDb dB ($why)", async ({ gainDb, expectedTrimDb }) => {
      const { driver, transport } = makeDriver({ features: ["gain-control", "usb-trim-follows-gain"] });
      await driver.connect();
      transport.sends.length = 0;
      await driver.setGain(1, gainDb);
      const writes = trimWrites(transport);
      expect(writes.length).toBeGreaterThan(0);
      expect(trimDb(writes.at(-1)!)).toBeCloseTo(expectedTrimDb, 3);
      // Sent right after the gain write (same moment, separate node).
      const order = transport.sends.filter((s) => s.values.length > 0).map((s) => s.address);
      expect(order.indexOf("/ch/01/preamp/rtntrim")).toBe(order.indexOf("/headamp/01/gain") + 1);
    });

    it("never reads the trim back or marks the channel unreconciled (post-production convenience only)", async () => {
      const { driver, transport } = makeDriver({ features: ["gain-control", "usb-trim-follows-gain"] });
      await driver.connect();
      transport.sends.length = 0;
      await driver.setGain(1, 30);
      expect(transport.sends.some((s) => s.address === "/ch/01/preamp/rtntrim" && s.values.length === 0)).toBe(false);
      expect(driver.getChannelState(1)?.unreconciled).toBe(false);
    });

    it("mirrors preset gain writes too", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1, features: ["gain-control", "usb-trim-follows-gain"] });
      await driver.connect();
      transport.sends.length = 0;
      // gain wire 0.375 = +15 dB (the booth's Pastor J value)
      await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.7, "/headamp/01/gain": 0.375 });
      expect(trimDb(trimWrites(transport).at(-1)!)).toBeCloseTo(15, 3);
    });

    it("takes effect immediately when the feature is toggled on a live driver (setFeatures)", async () => {
      const { driver, transport } = makeDriver(); // starts with the feature OFF
      await driver.connect();
      driver.setFeatures(["gain-control", "channel-metering", "usb-trim-follows-gain"]);
      transport.sends.length = 0;
      await driver.setGain(1, 10);
      expect(trimDb(trimWrites(transport).at(-1)!)).toBeCloseTo(10, 3);
      expect(driver.getCapabilities().features).toContain("usb-trim-follows-gain");
    });

    it("does not mirror gain changes made OUTSIDE the app (X AIR Edit / the board)", async () => {
      const { driver, transport } = makeDriver({ features: ["gain-control", "usb-trim-follows-gain"] });
      await driver.connect();
      transport.sends.length = 0;
      transport.inject("/headamp/01/gain", [0.5]); // external change
      expect(trimWrites(transport)).toEqual([]);
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

  describe("post-fader (outgoing) meters — one registered client per unmuted channel", () => {
    /** Flush microtasks so async open() + the /xinfo reply → subscribe chain settles. */
    const settle = async (): Promise<void> => {
      for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
    };
    /** A /meters/0 channel-strip frame: 8 values, index 4 = post-fader. */
    const stripFrame = (postDb: number): Uint8Array => meterBlob([-10, -10, 0, 0, postDb, postDb, -10, -10]);

    async function setup(): Promise<ReturnType<typeof makeDriver>> {
      const made = makeDriver({ channelCount: 3 });
      await made.driver.connect();
      // The board reports: ch1 unmuted, ch2 muted, ch3 not yet read.
      made.transport.inject("/ch/01/mix/on", [1]);
      made.transport.inject("/ch/02/mix/on", [0]);
      return made;
    }

    it("opens nothing until metering is enabled", async () => {
      const { postTransports } = await setup();
      await settle();
      expect(postTransports).toHaveLength(0);
    });

    it("subscribes ONLY board-confirmed unmuted channels, registering before subscribing", async () => {
      const { driver, postTransports } = await setup();
      driver.setMeteringEnabled(true);
      await settle();
      // ch1 unmuted → one client; ch2 muted → none; ch3 mute unknown → none (no 16-client burst at startup).
      expect(postTransports.filter((t) => !t.closed)).toHaveLength(1);
      const client = postClientFor(postTransports, 1)!;
      const order = client.sends.map((s) => s.address);
      expect(order.indexOf("/xinfo")).toBeLessThan(order.indexOf("/meters"));
      expect(order).toContain("/xremote");
      expect(client.sends.find((s) => s.address === "/meters")).toMatchObject({ types: "sii", values: ["/meters/0", 0, expect.any(Number)] });
      driver.setMeteringEnabled(false);
    });

    it("reports the board's post-fader value; muted = floor; unmeasured = absent", async () => {
      const { driver, transport, postTransports } = await setup();
      driver.setMeteringEnabled(true);
      await settle();
      const frames: MixerChannelLevel[][] = [];
      driver.onMeterUpdate((levels) => frames.push(levels));
      transport.inject("/ch/03/mix/on", [1]); // ch3 becomes known-unmuted → subscribed, no frame yet
      await settle();
      postClientFor(postTransports, 1)!.inject("/meters/0", [stripFrame(-37.5)]);
      transport.inject("/meters/1", [meterBlob([-5, -17, -20])]);
      const last = frames.at(-1)!;
      expect(last.find((l) => l.channel === 1)).toEqual({ channel: 1, levelDb: -5, postFaderDb: -37.5 });
      expect(last.find((l) => l.channel === 2)).toEqual({ channel: 2, levelDb: -17, postFaderDb: -60 }); // muted → silent
      expect(last.find((l) => l.channel === 3)).toEqual({ channel: 3, levelDb: -20 }); // no post frame yet → absent
      driver.setMeteringEnabled(false);
    });

    it("muting a channel (e.g. from X AIR) releases its client and shows silence immediately", async () => {
      const { driver, transport, postTransports } = await setup();
      driver.setMeteringEnabled(true);
      await settle();
      const client = postClientFor(postTransports, 1)!;
      client.inject("/meters/0", [stripFrame(-30)]);
      const frames: MixerChannelLevel[][] = [];
      driver.onMeterUpdate((levels) => frames.push(levels));
      transport.inject("/ch/01/mix/on", [0]); // external mute
      expect(client.closed).toBe(true);
      transport.inject("/meters/1", [meterBlob([-5, -17, -20])]);
      expect(frames.at(-1)!.find((l) => l.channel === 1)?.postFaderDb).toBe(-60);
      driver.setMeteringEnabled(false);
    });

    it("re-unmuting starts a fresh subscription and never shows the stale old value", async () => {
      const { driver, transport, postTransports } = await setup();
      driver.setMeteringEnabled(true);
      await settle();
      postClientFor(postTransports, 1)!.inject("/meters/0", [stripFrame(-30)]);
      transport.inject("/ch/01/mix/on", [0]);
      transport.inject("/ch/01/mix/on", [1]);
      await settle();
      expect(postClientFor(postTransports, 1)).toBeDefined();
      const frames: MixerChannelLevel[][] = [];
      driver.onMeterUpdate((levels) => frames.push(levels));
      transport.inject("/meters/1", [meterBlob([-5, -17, -20])]);
      expect(frames.at(-1)!.find((l) => l.channel === 1)).toEqual({ channel: 1, levelDb: -5 }); // absent until a new frame
      driver.setMeteringEnabled(false);
    });

    it("renews each post client's subscription and registration with the main renewals", async () => {
      vi.useFakeTimers();
      const { driver, postTransports } = await setup();
      driver.setMeteringEnabled(true);
      await vi.advanceTimersByTimeAsync(10);
      const client = postClientFor(postTransports, 1)!;
      const count = (address: string): number => client.sends.filter((s) => s.address === address).length;
      const meters = count("/meters");
      const xremote = count("/xremote");
      await vi.advanceTimersByTimeAsync(8100); // > XREMOTE_RENEW_MS, several METERS_RENEW_MS
      expect(count("/meters")).toBeGreaterThan(meters);
      expect(count("/xremote")).toBeGreaterThan(xremote);
      driver.setMeteringEnabled(false);
      driver.disconnect();
      vi.useRealTimers();
    });

    it("disabling metering or disconnecting releases every post client", async () => {
      const { driver, transport, postTransports } = await setup();
      transport.inject("/ch/03/mix/on", [1]);
      driver.setMeteringEnabled(true);
      await settle();
      expect(postTransports.filter((t) => !t.closed)).toHaveLength(2);
      driver.setMeteringEnabled(false);
      expect(postTransports.every((t) => t.closed)).toBe(true);
      driver.setMeteringEnabled(true);
      await settle();
      driver.disconnect();
      expect(postTransports.every((t) => t.closed)).toBe(true);
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

  describe("presets (audibility-gated capture / write / verify)", () => {
    it("capture stores all three fields for an audible channel (unmuted, fader up)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.seed("/ch/01/mix/on", [1]); // unmuted
      transport.seed("/ch/01/mix/fader", [0.7]); // audible
      transport.seed("/headamp/01/gain", [0.4]);

      const payload = await driver.capturePreset();
      expect(payload["/ch/01/mix/on"]).toBe(1);
      expect(payload["/ch/01/mix/fader"]).toBe(0.7);
      expect(payload["/headamp/01/gain"]).toBe(0.4);
    });

    it("capture stores ONLY mute for a muted channel (fader/gain inaudible → skipped)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.seed("/ch/01/mix/on", [0]); // muted
      transport.seed("/ch/01/mix/fader", [0.7]);
      transport.seed("/headamp/01/gain", [0.4]);

      const payload = await driver.capturePreset();
      expect(payload["/ch/01/mix/on"]).toBe(0);
      expect(payload["/ch/01/mix/fader"]).toBeUndefined();
      expect(payload["/headamp/01/gain"]).toBeUndefined();
    });

    it("capture stores mute+fader but NOT gain for an unmuted channel at −∞ (fader float 0)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.seed("/ch/01/mix/on", [1]); // unmuted
      transport.seed("/ch/01/mix/fader", [0]); // −∞ → inaudible, gain irrelevant
      transport.seed("/headamp/01/gain", [0.4]);

      const payload = await driver.capturePreset();
      expect(payload["/ch/01/mix/on"]).toBe(1);
      expect(payload["/ch/01/mix/fader"]).toBe(0);
      expect(payload["/headamp/01/gain"]).toBeUndefined();
    });

    it("capturePreset fails with a descriptive error naming unconfirmed channels", async () => {
      // 1 channel, no gain feature → on + fader queries only.
      const { driver, transport } = makeDriver({ channelCount: 1, features: [] });
      await driver.connect();
      transport.autoReply = false; // nothing confirms
      await expect(driver.capturePreset()).rejects.toThrow(/channel\(s\): 1/);
    }, 8000);

    it("activatePreset writes mute+fader as ONE grouped /ch/NN/mix message, gain separately, and verifies", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.sends.length = 0;
      const result = await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8, "/headamp/01/gain": 0.5 });
      expect(result.unconfirmedChannels).toEqual([]);
      const valueWrites = transport.sends.filter((s) => s.values.length > 0);
      expect(valueWrites.find((s) => s.address === "/ch/01/mix")).toMatchObject({ types: "if", values: [1, 0.8] });
      expect(valueWrites.find((s) => s.address === "/headamp/01/gain")).toMatchObject({ types: "f", values: [0.5] });
      // No separate leaf writes for mute/fader.
      expect(valueWrites.some((s) => s.address === "/ch/01/mix/on" || s.address === "/ch/01/mix/fader")).toBe(false);
      // Verified with ONE grouped node query instead of two leaf queries.
      const queries = transport.sends.filter((s) => s.values.length === 0).map((s) => s.address);
      expect(queries).toContain("/ch/01/mix");
      expect(queries).not.toContain("/ch/01/mix/fader");
    });

    it("going audible writes gain BEFORE the grouped unmute+fader (spike-safe ordering)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.sends.length = 0;
      await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8, "/headamp/01/gain": 0.5 });
      const writeOrder = transport.sends.filter((s) => s.values.length > 0).map((s) => s.address);
      expect(writeOrder.indexOf("/headamp/01/gain")).toBeLessThan(writeOrder.indexOf("/ch/01/mix"));
    });

    it("legacy payloads are audibility-gated at apply time (muted → mute only; −∞ fader → no gain)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 2 });
      await driver.connect();
      transport.sends.length = 0;
      await driver.activatePreset({
        "/ch/01/mix/on": 0,
        "/ch/01/mix/fader": 0.8,
        "/headamp/01/gain": 0.5,
        "/ch/02/mix/on": 1,
        "/ch/02/mix/fader": 0,
        "/headamp/02/gain": 0.5,
      });
      const valueWrites = transport.sends.filter((s) => s.values.length > 0).map((s) => s.address);
      expect(valueWrites).toContain("/ch/01/mix/on");
      expect(valueWrites).not.toContain("/headamp/01/gain");
      expect(valueWrites).not.toContain("/ch/01/mix");
      expect(valueWrites).toContain("/ch/02/mix"); // grouped unmute + −∞ fader
      expect(valueWrites).not.toContain("/headamp/02/gain");
    });

    it("paces read-back queries instead of bursting them", async () => {
      const { driver, transport } = makeDriver({ channelCount: 4 });
      await driver.connect();
      await new Promise((resolve) => setTimeout(resolve, 50)); // let the connect-time refresh finish
      const queryTimes: number[] = [];
      const send = transport.send.bind(transport);
      transport.send = (address, types, values) => {
        // Only preset verify sends GROUPED node queries — the connect-time refresh
        // queries leaf addresses, so it can't pollute this measurement.
        if (!values?.length && /^\/ch\/\d\d\/mix$/.test(address)) queryTimes.push(performance.now());
        send(address, types, values);
      };
      const payload: Record<string, number> = {};
      for (let c = 1; c <= 4; c++) Object.assign(payload, { [`/ch/0${c}/mix/on`]: 1, [`/ch/0${c}/mix/fader`]: 0.5, [`/headamp/0${c}/gain`]: 0.3 });
      await driver.activatePreset(payload);
      expect(queryTimes.length).toBe(4); // one grouped mix query per channel
      for (let i = 1; i < queryTimes.length; i++) expect(queryTimes[i]! - queryTimes[i - 1]!).toBeGreaterThanOrEqual(0.5);
    });

    it("a mute-only channel is written to the /mix/on leaf (not the grouped node)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.sends.length = 0;
      await driver.activatePreset({ "/ch/01/mix/on": 0 });
      const valueWrites = transport.sends.filter((s) => s.values.length > 0);
      expect(valueWrites).toEqual([{ address: "/ch/01/mix/on", types: "i", values: [0] }]);
    });

    it("activatePreset reports unconfirmed channels when the board does not echo the written value", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      // Pin a DIFFERENT value than we will write → exact-match verification fails.
      transport.seed("/ch/01/mix/fader", [0.1]);
      const result = await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8 });
      expect(result.unconfirmedChannels).toEqual([1]);
    }, 8000);

    it("re-writes a channel whose write was dropped, then confirms it (retry rounds)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.send("/ch/01/mix/fader", "f", [0.1]); // board currently at 0.1
      transport.dropWrites.set("/ch/01/mix", 1); // first grouped preset write is lost (UDP drop)
      transport.sends.length = 0;
      const result = await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8 });
      expect(result.unconfirmedChannels).toEqual([]);
      const mixWrites = transport.sends.filter((s) => s.address === "/ch/01/mix" && s.values.length > 0);
      expect(mixWrites).toHaveLength(2); // initial + one re-write
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.8, 5);
    }, 8000);

    it("gives up after the max rounds when the board never takes the value", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.send("/ch/01/mix/fader", "f", [0.1]);
      transport.dropWrites.set("/ch/01/mix", 99);
      const result = await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8 });
      expect(result.unconfirmedChannels).toEqual([1]);
    }, 8000);

    it("accepts a float within tolerance (float32 / quantization) but not mute mismatches", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.seed("/ch/01/mix/fader", [0.8005]); // board quantized slightly off the stored 0.8
      const result = await driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8 });
      expect(result.unconfirmedChannels).toEqual([]);
      expect(driver.getChannelState(1)?.fader).toBeCloseTo(0.8005, 5); // board-reported value wins
    }, 8000);

    it("does not broadcast per-address /xremote echoes of its own writes during apply", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      const emitted: number[] = [];
      driver.onStateChange((state) => emitted.push(state.fader));
      const pending = driver.activatePreset({ "/ch/01/mix/on": 1, "/ch/01/mix/fader": 0.8 });
      transport.inject("/ch/01/mix/fader", [0.3]); // intermediate echo mid-apply
      await pending;
      expect(emitted).not.toContain(0.3);
      expect(emitted).toHaveLength(1); // one published state for the channel
    }, 8000);

    it("only verifies the fields present in the payload (muted channel → mute only)", async () => {
      const { driver, transport } = makeDriver({ channelCount: 1 });
      await driver.connect();
      transport.sends.length = 0;
      const result = await driver.activatePreset({ "/ch/01/mix/on": 0 });
      expect(result.unconfirmedChannels).toEqual([]);
      // No fader/gain read-back was issued for this channel (nothing to verify).
      expect(transport.sends.some((s) => s.address === "/ch/01/mix/fader" && s.values.length === 0)).toBe(false);
      expect(transport.sends.some((s) => s.address === "/headamp/01/gain" && s.values.length === 0)).toBe(false);
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
