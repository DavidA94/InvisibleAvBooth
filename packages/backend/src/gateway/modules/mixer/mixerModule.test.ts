import { describe, it, expect, vi, beforeEach } from "vitest";
import { MixerSocketModule, MIXER_CAPTURE_PATH_LOST_CODE } from "./mixerModule.js";
import type { MixerService } from "../../../mixer/MixerService.js";
import type { AuthenticatedSocket } from "../socketModule.js";
import type { JwtPayload } from "../../../services/authService.js";
import { eventBus } from "../../../eventBus/eventBus.js";
import { BUS_MIXER_CAPTURE_PATH_LOST, BUS_MIXER_CAPTURE_PATH_RESTORED, BUS_MIXER_STATE_CHANGED, BUS_MIXER_LEVELS } from "../../../eventBus/types.js";
import { CTS_MIXER_SET, CTS_MIXER_WIDGET_PRESENT, STC_MIXER_ERROR, STC_MIXER_ERROR_RESOLVED, STC_MIXER_STATE } from "@invisible-av-booth/shared";

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

  describe("register (bus → stc)", () => {
    it("raises STC_MIXER_ERROR (modal) on capture-path lost and clears on restored", () => {
      const io = makeIo();
      module.register(io as never);
      eventBus.emit(BUS_MIXER_CAPTURE_PATH_LOST, { mixerId: "m1", reason: "lost" });
      eventBus.emit(BUS_MIXER_CAPTURE_PATH_RESTORED, { mixerId: "m1" });
      const error = io.emitted.find((e) => e.event === STC_MIXER_ERROR)!;
      expect((error.payload as { errorCode: string; level: string }).errorCode).toBe(MIXER_CAPTURE_PATH_LOST_CODE);
      expect((error.payload as { level: string }).level).toBe("modal");
      const resolved = io.emitted.find((e) => e.event === STC_MIXER_ERROR_RESOLVED)!;
      expect((resolved.payload as { errorCode: string }).errorCode).toBe(MIXER_CAPTURE_PATH_LOST_CODE);
    });

    it("forwards state and levels bus events", () => {
      const io = makeIo();
      module.register(io as never);
      eventBus.emit(BUS_MIXER_STATE_CHANGED, { mixerId: "m1", state: { mixerId: "m1" } as never });
      eventBus.emit(BUS_MIXER_LEVELS, { mixerId: "m1", levels: [] });
      expect(io.emit).toHaveBeenCalled();
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
