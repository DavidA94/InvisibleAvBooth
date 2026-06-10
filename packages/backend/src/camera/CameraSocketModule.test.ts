import { describe, it, expect, vi, beforeEach } from "vitest";
import { CameraSocketModule } from "./CameraSocketModule.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";
import type { CameraState } from "@invisible-av-booth/shared";

vi.mock("./ndiLoader.js", () => ({
  isNdiAvailable: () => true,
}));

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeMockCameraService() {
  return {
    startMove: vi.fn(),
    keepAliveMove: vi.fn(),
    stopMove: vi.fn(),
    applySet: vi.fn(),
    activatePreset: vi.fn().mockResolvedValue({ success: true }),
    tapToCenter: vi.fn().mockResolvedValue({ success: true }),
    getAllCameraStates: vi.fn().mockReturnValue([]),
  };
}

function makeMockSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: vi.fn(),
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

function makeMockIo() {
  return { emit: vi.fn() };
}

const ADMIN_AUTH = {
  socket: makeMockSocket(),
  jwtPayload: { sub: "u1", username: "admin", role: "ADMIN" as const, iat: 0, exp: 9999999999 },
};

const VOLUNTEER_AUTH = {
  socket: makeMockSocket(),
  jwtPayload: { sub: "u2", username: "vol", role: "AvVolunteer" as const, iat: 0, exp: 9999999999 },
};

describe("CameraSocketModule", () => {
  let service: ReturnType<typeof makeMockCameraService>;
  let module: CameraSocketModule;

  beforeEach(() => {
    vi.clearAllMocks();
    eventBus.removeAllListeners();
    service = makeMockCameraService();
    module = new CameraSocketModule(service as unknown as ConstructorParameters<typeof CameraSocketModule>[0]);
  });

  describe("register", () => {
    it("subscribes to BUS_CAMERA_STATE_CHANGED and emits to io", () => {
      const io = makeMockIo();
      module.register(io as unknown as Parameters<typeof module.register>[0]);

      const state = { cameraId: "cam1", connected: true } as CameraState;
      eventBus.emit(BUS_CAMERA_STATE_CHANGED, { cameraId: "cam1", state });

      expect(io.emit).toHaveBeenCalledWith("stc:camera:state:update", state);
    });
  });

  describe("emitInitialState", () => {
    it("emits initial camera state and ndi availability", () => {
      const auth = { socket: makeMockSocket(), jwtPayload: ADMIN_AUTH.jwtPayload };
      service.getAllCameraStates.mockReturnValue([{ cameraId: "cam1" }]);

      module.emitInitialState(auth as unknown as Parameters<typeof module.emitInitialState>[0]);

      expect(auth.socket.emit).toHaveBeenCalledWith("stc:camera:state", {
        cameras: [{ cameraId: "cam1" }],
        ndiAvailable: true,
      });
    });
  });

  describe("registerSocket — PTZ commands", () => {
    it("forwards move start to service", () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      ADMIN_AUTH.socket._trigger("cts:camera:ptz:move:start", { cameraId: "cam1", pan: 0.5, tilt: -0.3 });
      expect(service.startMove).toHaveBeenCalledWith("cam1", 0.5, -0.3);
    });

    it("forwards move keepalive to service", () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      ADMIN_AUTH.socket._trigger("cts:camera:ptz:move:keepalive", { cameraId: "cam1", pan: 0.2, tilt: 0.1 });
      expect(service.keepAliveMove).toHaveBeenCalledWith("cam1", 0.2, 0.1);
    });

    it("forwards move stop to service", () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      ADMIN_AUTH.socket._trigger("cts:camera:ptz:move:stop", { cameraId: "cam1" });
      expect(service.stopMove).toHaveBeenCalledWith("cam1");
    });
  });

  describe("registerSocket — camera set (role enforcement)", () => {
    it("ADMIN can set all fields", () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      ADMIN_AUTH.socket._trigger("cts:camera:set", { cameraId: "cam1", zoom: 0.5, aiTracking: true });
      expect(service.applySet).toHaveBeenCalledWith("cam1", { zoom: 0.5, aiTracking: true });
    });

    it("AvVolunteer can only set zoom", () => {
      module.registerSocket(VOLUNTEER_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      VOLUNTEER_AUTH.socket._trigger("cts:camera:set", { cameraId: "cam1", zoom: 0.8, aiTracking: true, focus: 0.3 });
      expect(service.applySet).toHaveBeenCalledWith("cam1", { zoom: 0.8 });
    });

    it("AvVolunteer set with no zoom does nothing", () => {
      module.registerSocket(VOLUNTEER_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      VOLUNTEER_AUTH.socket._trigger("cts:camera:set", { cameraId: "cam1", aiTracking: true });
      // applySet is still called but only with zoom if present
      expect(service.applySet).not.toHaveBeenCalled();
    });
  });

  describe("registerSocket — preset activate", () => {
    it("activates preset and calls ack", async () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      const ack = vi.fn();
      await ADMIN_AUTH.socket._trigger("cts:camera:preset:activate", { cameraId: "cam1", presetId: "p1" }, ack);
      // Wait for async
      await vi.waitFor(() => expect(ack).toHaveBeenCalledWith({ success: true }));
    });

    it("works without ack callback", async () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      // No ack — should not throw
      await ADMIN_AUTH.socket._trigger("cts:camera:preset:activate", { cameraId: "cam1", presetId: "p1" });
      expect(service.activatePreset).toHaveBeenCalledWith("cam1", "p1");
    });
  });

  describe("registerSocket — tap to center", () => {
    it("forwards tap-to-center to service", () => {
      module.registerSocket(ADMIN_AUTH as unknown as Parameters<typeof module.registerSocket>[0]);
      ADMIN_AUTH.socket._trigger("cts:camera:ptz:tap-to-center", { cameraId: "cam1", offsetX: 0.2, offsetY: -0.1 });
      expect(service.tapToCenter).toHaveBeenCalledWith("cam1", 0.2, -0.1, expect.objectContaining({ fovWideAngle: 60 }));
    });
  });
});
