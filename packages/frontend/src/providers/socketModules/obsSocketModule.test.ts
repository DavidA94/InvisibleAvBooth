import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerObsSocketHandlers } from "./obsSocketModule";
import { useStore } from "../../store";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED, STC_DEVICE_CAPABILITIES, STC_OBS_AUDIO_LEVELS } from "@invisible-av-booth/shared";

vi.mock("../../logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

function makeFakeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

describe("obsSocketModule", () => {
  beforeEach(() => {
    useStore.setState({
      notifications: [],
      obsPreviewNdiConfigured: false,
    });
  });

  it("STC_OBS_STATE updates obs state in store", () => {
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_OBS_STATE, { connected: true, streaming: false, recording: false });
    expect(useStore.getState().obsState).toEqual({ connected: true, streaming: false, recording: false });
  });

  it("STC_OBS_ERROR_RESOLVED removes notification", () => {
    useStore.setState({ notifications: [{ id: "OBS_UNREACHABLE", level: "modal", severity: "error", message: "OBS disconnected" }] });
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_OBS_ERROR_RESOLVED, { errorCode: "OBS_UNREACHABLE" });
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("STC_DEVICE_CAPABILITIES updates ndiConfigured for obs-preview", () => {
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_DEVICE_CAPABILITIES, {
      deviceId: "obs-preview",
      capabilities: { deviceId: "obs-preview", deviceType: "obs", features: { ndiConfigured: true } },
    });
    expect(useStore.getState().obsPreviewNdiConfigured).toBe(true);
  });

  it("STC_DEVICE_CAPABILITIES ignores non-obs-preview devices", () => {
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_DEVICE_CAPABILITIES, {
      deviceId: "other-device",
      capabilities: { deviceId: "other-device", deviceType: "camera", features: { ndiConfigured: true } },
    });
    expect(useStore.getState().obsPreviewNdiConfigured).toBe(false);
  });

  it("STC_DEVICE_CAPABILITIES sets obsLevelPipelineAvailable from preview device", () => {
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_DEVICE_CAPABILITIES, {
      deviceId: "preview",
      capabilities: { deviceId: "preview", deviceType: "obs", features: { preview: true, audioMetering: true } },
    });
    expect(useStore.getState().obsLevelPipelineAvailable).toBe(true);
  });

  it("STC_OBS_AUDIO_LEVELS updates obsAudioLevels in store", () => {
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_OBS_AUDIO_LEVELS, { left: -20, right: -10 });
    expect(useStore.getState().obsAudioLevels).toEqual({ left: -20, right: -10 });
  });

  it("STC_OBS_AUDIO_LEVELS sets obsAudioEventsFlowing to true", () => {
    useStore.setState({ obsAudioEventsFlowing: false });
    const socket = makeFakeSocket();
    registerObsSocketHandlers(socket as never);
    socket.emit(STC_OBS_AUDIO_LEVELS, { left: -30, right: -30 });
    expect(useStore.getState().obsAudioEventsFlowing).toBe(true);
  });
});
