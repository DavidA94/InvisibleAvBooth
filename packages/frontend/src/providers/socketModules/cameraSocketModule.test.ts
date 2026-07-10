import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerCameraSocketHandlers } from "./cameraSocketModule";
import { useStore } from "../../store";
import { STC_CAMERA_STATE, STC_CAMERA_STATE_UPDATE } from "@invisible-av-booth/shared";
import type { CameraState } from "@invisible-av-booth/shared";

function makeFakeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

const CAMERA: CameraState = {
  cameraId: "cam1",
  connected: true,
  position: null,
  autoFocus: true,
  aiTracking: false,
  aiTilt: false,
  aiZoom: false,
  activePresetId: null,
  features: ["pan", "tilt"],
  capabilities: { tapToCenter: false },
  presets: [],
};

describe("cameraSocketModule", () => {
  beforeEach(() => {
    useStore.setState({ cameraStates: {} });
  });

  it("registers handlers for STC_CAMERA_STATE and STC_CAMERA_STATE_UPDATE", () => {
    const socket = makeFakeSocket();
    registerCameraSocketHandlers(socket as never);
    expect(socket.on).toHaveBeenCalledWith(STC_CAMERA_STATE, expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith(STC_CAMERA_STATE_UPDATE, expect.any(Function));
  });

  it("STC_CAMERA_STATE sets all camera states", () => {
    const socket = makeFakeSocket();
    registerCameraSocketHandlers(socket as never);
    socket.emit(STC_CAMERA_STATE, { cameras: [CAMERA], ndiAvailable: true });
    expect(useStore.getState().cameraStates["cam1"]).toEqual(CAMERA);
  });

  it("STC_CAMERA_STATE_UPDATE updates a single camera", () => {
    useStore.setState({ cameraStates: { cam1: CAMERA } });
    const socket = makeFakeSocket();
    registerCameraSocketHandlers(socket as never);
    const updated = { ...CAMERA, connected: false };
    socket.emit(STC_CAMERA_STATE_UPDATE, updated);
    expect(useStore.getState().cameraStates["cam1"]?.connected).toBe(false);
  });
});
