import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MixerSocketModule } from "./mixerModule.js";
import type { MixerService } from "../../../mixer/MixerService.js";
import type { AuthenticatedSocket } from "../socketModule.js";
import type { JwtPayload } from "../../../services/authService.js";
import { eventBus } from "../../../eventBus/eventBus.js";
import { BUS_MIXER_STATE_CHANGED, BUS_MIXER_LEVELS } from "../../../eventBus/types.js";
import {
  CTS_MIXER_SET,
  CTS_MIXER_PRESET_ACTIVATE,
  CTS_MIXER_WIDGET_PRESENT,
  STC_MIXER_STATE,
  STC_MIXER_STATE_UPDATE,
  STC_MIXER_LEVELS,
  STC_MIXER_PRESET_RESULT,
  METERS_BROADCAST_INTERVAL_MS,
} from "@invisible-av-booth/shared";

vi.mock("../../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeService(): MixerService & {
  setChannel: ReturnType<typeof vi.fn>;
  setWidgetPresence: ReturnType<typeof vi.fn>;
  getAllMixerStates: ReturnType<typeof vi.fn>;
} {
  return {
    setChannel: vi.fn(async () => {}),
    activatePreset: vi.fn(async () => ({ ok: true })),
    startChannelMonitor: vi.fn(),
    stopChannelMonitor: vi.fn(),
    setWidgetPresence: vi.fn(),
    getAllMixerStates: vi.fn(() => [{ mixerId: "m1" }]),
  } as unknown as MixerService & {
    setChannel: ReturnType<typeof vi.fn>;
    setWidgetPresence: ReturnType<typeof vi.fn>;
    getAllMixerStates: ReturnType<typeof vi.fn>;
  };
}

/** A fake per-socket that records handlers so we can invoke them. */
function makeSocket(role: JwtPayload["role"]): {
  auth: AuthenticatedSocket;
  fire: (event: string, payload?: unknown) => void;
  emitted: Array<{ event: string; payload: unknown }>;
} {
  const handlers: Record<string, ((payload: unknown) => void)[]> = {};
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const socket = {
    on: (event: string, handler: (payload: unknown) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    },
    emit: (event: string, payload: unknown) => emitted.push({ event, payload }),
  };
  const jwtPayload: JwtPayload = { sub: "u1", username: "u", role, iat: 0, exp: 0 };
  return {
    auth: { socket, jwtPayload } as unknown as AuthenticatedSocket,
    fire: (event, payload) => handlers[event]?.forEach((h) => h(payload)),
    emitted,
  };
}

function makeIo(): { emit: ReturnType<typeof vi.fn>; emitted: Array<{ event: string; payload: unknown }> } {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  return { emit: vi.fn((event: string, payload: unknown) => emitted.push({ event, payload })), emitted };
}

describe("MixerSocketModule", () => {
  let service: ReturnType<typeof makeService>;
  let module: MixerSocketModule;

  beforeEach(() => {
    eventBus.removeAllListeners();
    service = makeService();
    module = new MixerSocketModule(service);
  });

  describe("register (bus → stc, throttled levels)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      module.dispose();
      vi.useRealTimers();
    });

    it("forwards state updates immediately", () => {
      const io = makeIo();
      module.register(io as never);
      eventBus.emit(BUS_MIXER_STATE_CHANGED, { mixerId: "m1", state: { mixerId: "m1" } as never });
      expect(io.emitted.filter((e) => e.event === STC_MIXER_STATE_UPDATE)).toHaveLength(1);
    });

    it("emits the first level frame immediately (leading edge)", () => {
      const io = makeIo();
      module.register(io as never);
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -10 }] });
      const levels = io.emitted.filter((e) => e.event === STC_MIXER_LEVELS);
      expect(levels).toHaveLength(1);
      expect(levels[0]!.payload).toEqual({ mixerId: "m1", levels: [{ channel: 1, levelDb: -10 }] });
    });

    it("coalesces frames within the window to the latest, flushed once", () => {
      const io = makeIo();
      module.register(io as never);
      // Leading-edge frame goes out now.
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -30 }] });
      // These three arrive within the window — only the LAST should survive.
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -20 }] });
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -15 }] });
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -5 }] });
      expect(io.emitted.filter((e) => e.event === STC_MIXER_LEVELS)).toHaveLength(1);

      vi.advanceTimersByTime(METERS_BROADCAST_INTERVAL_MS);
      const levels = io.emitted.filter((e) => e.event === STC_MIXER_LEVELS);
      expect(levels).toHaveLength(2);
      expect(levels[1]!.payload).toEqual({ mixerId: "m1", levels: [{ channel: 1, levelDb: -5 }] });
    });

    it("throttles each mixer independently", () => {
      const io = makeIo();
      module.register(io as never);
      // Both get a leading-edge emit.
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -10 }] });
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m2", levels: [{ channel: 1, levelDb: -11 }] });
      // Each then coalesces one more frame.
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -8 }] });
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m2", levels: [{ channel: 1, levelDb: -9 }] });
      expect(io.emitted.filter((e) => e.event === STC_MIXER_LEVELS)).toHaveLength(2);

      vi.advanceTimersByTime(METERS_BROADCAST_INTERVAL_MS);
      const levels = io.emitted.filter((e) => e.event === STC_MIXER_LEVELS);
      expect(levels).toHaveLength(4);
      expect(levels.map((e) => (e.payload as { mixerId: string }).mixerId).sort()).toEqual(["m1", "m1", "m2", "m2"]);
    });

    it("stops the flush timer once there is nothing pending", () => {
      const io = makeIo();
      module.register(io as never);
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -10 }] }); // leading edge
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [{ channel: 1, levelDb: -5 }] }); // pending → timer armed
      expect(vi.getTimerCount()).toBe(1);

      vi.advanceTimersByTime(METERS_BROADCAST_INTERVAL_MS); // flush pending → self-stop
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  describe("registerSocket role gating", () => {
    it("forwards a set command for an AvVolunteer", () => {
      const { auth, fire } = makeSocket("AvVolunteer");
      module.registerSocket(auth);
      fire(CTS_MIXER_SET, { mixerId: "m1", channel: 1, fader: 0.5 });
      expect(service.setChannel).toHaveBeenCalledWith("m1", { mixerId: "m1", channel: 1, fader: 0.5 });
    });

    it("ignores a set command with a malformed payload (no mixerId)", () => {
      const { auth, fire } = makeSocket("ADMIN");
      module.registerSocket(auth);
      fire(CTS_MIXER_SET, { channel: 1 });
      expect(service.setChannel).not.toHaveBeenCalled();
    });
  });

  describe("preset activation ack", () => {
    it("applies the preset and acks the requesting socket with ok:true on success", async () => {
      service.activatePreset = vi.fn(async () => ({ ok: true })) as never;
      const { auth, fire, emitted } = makeSocket("AvVolunteer");
      module.registerSocket(auth);
      fire(CTS_MIXER_PRESET_ACTIVATE, { mixerId: "m1", presetId: "p1" });
      await Promise.resolve();
      await Promise.resolve();
      const ack = emitted.find((e) => e.event === STC_MIXER_PRESET_RESULT);
      expect(ack?.payload).toEqual({ mixerId: "m1", presetId: "p1", ok: true });
    });

    it("acks ok:false with the error + unconfirmed channels on failure", async () => {
      service.activatePreset = vi.fn(async () => ({ ok: false, error: "Mixer did not confirm channel(s): 2", unconfirmedChannels: [2] })) as never;
      const { auth, fire, emitted } = makeSocket("AvVolunteer");
      module.registerSocket(auth);
      fire(CTS_MIXER_PRESET_ACTIVATE, { mixerId: "m1", presetId: "p1" });
      await Promise.resolve();
      await Promise.resolve();
      const ack = emitted.find((e) => e.event === STC_MIXER_PRESET_RESULT);
      expect(ack?.payload).toEqual({ mixerId: "m1", presetId: "p1", ok: false, error: "Mixer did not confirm channel(s): 2", unconfirmedChannels: [2] });
    });

    it("ignores a preset activate with a malformed payload", async () => {
      const { auth, fire, emitted } = makeSocket("AvVolunteer");
      module.registerSocket(auth);
      fire(CTS_MIXER_PRESET_ACTIVATE, { mixerId: "m1" }); // no presetId
      await Promise.resolve();
      expect(emitted.find((e) => e.event === STC_MIXER_PRESET_RESULT)).toBeUndefined();
    });
  });

  describe("presence ref-counting + disconnect cleanup", () => {
    it("decrements every held presence on disconnect (no leak)", () => {
      const { auth, fire } = makeSocket("ADMIN");
      module.registerSocket(auth);
      fire(CTS_MIXER_WIDGET_PRESENT, { mixerId: "m1", present: true });
      fire(CTS_MIXER_WIDGET_PRESENT, { mixerId: "m2", present: true });
      service.setWidgetPresence.mockClear();
      fire("disconnect");
      // Both mixers decremented once.
      expect(service.setWidgetPresence).toHaveBeenCalledWith("m1", false);
      expect(service.setWidgetPresence).toHaveBeenCalledWith("m2", false);
    });

    it("does not decrement below zero for a stray present:false", () => {
      const { auth, fire } = makeSocket("ADMIN");
      module.registerSocket(auth);
      fire(CTS_MIXER_WIDGET_PRESENT, { mixerId: "m1", present: false });
      expect(service.setWidgetPresence).not.toHaveBeenCalledWith("m1", false);
    });
  });

  describe("emitInitialState", () => {
    it("emits all mixer states to the requesting socket", () => {
      const { auth, emitted } = makeSocket("ADMIN");
      module.emitInitialState(auth);
      expect(emitted.find((e) => e.event === STC_MIXER_STATE)).toBeDefined();
    });
  });
});
