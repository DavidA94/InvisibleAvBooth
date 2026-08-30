import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerMixerSocketHandlers } from "./mixerSocketModule";
import { useStore } from "../../store";
import { STC_MIXER_STATE, STC_MIXER_STATE_UPDATE, STC_MIXER_LEVELS, STC_MIXER_ERROR, STC_MIXER_ERROR_RESOLVED } from "@invisible-av-booth/shared";
import type { MixerState } from "@invisible-av-booth/shared";

function makeFakeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

const MIXER_STATE: MixerState = {
  mixerId: "mix1",
  connected: true,
  model: "behringer-xair",
  channelCount: 1,
  capabilities: { features: [], gainRange: { minDb: -12, maxDb: 60 } },
  channels: [{ channel: 1, name: "Ch 1", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 }],
  presets: [],
};

describe("mixerSocketModule", () => {
  beforeEach(() => {
    useStore.setState({ mixerStates: {}, mixerLevels: {}, notifications: [] });
  });

  it("STC_MIXER_STATE replaces all mixer states", () => {
    const socket = makeFakeSocket();
    registerMixerSocketHandlers(socket as never);
    socket.emit(STC_MIXER_STATE, [MIXER_STATE]);
    expect(useStore.getState().mixerStates["mix1"]).toEqual(MIXER_STATE);
  });

  it("STC_MIXER_STATE_UPDATE replaces one mixer's state", () => {
    const socket = makeFakeSocket();
    registerMixerSocketHandlers(socket as never);
    socket.emit(STC_MIXER_STATE_UPDATE, { ...MIXER_STATE, connected: false });
    expect(useStore.getState().mixerStates["mix1"]?.connected).toBe(false);
  });

  it("STC_MIXER_LEVELS stores per-channel levels", () => {
    const socket = makeFakeSocket();
    registerMixerSocketHandlers(socket as never);
    socket.emit(STC_MIXER_LEVELS, { mixerId: "mix1", levels: [{ channel: 1, levelDb: -18 }] });
    expect(useStore.getState().mixerLevels["mix1"]).toEqual({ 1: -18 });
  });

  it("STC_MIXER_ERROR raises a modal notification with id === errorCode", () => {
    const socket = makeFakeSocket();
    registerMixerSocketHandlers(socket as never);
    socket.emit(STC_MIXER_ERROR, { errorCode: "MIXER_CAPTURE_PATH_LOST", mixerId: "mix1", message: "USB lost", level: "modal" });
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toMatchObject({ id: "MIXER_CAPTURE_PATH_LOST", level: "modal", severity: "error", message: "USB lost" });
  });

  it("STC_MIXER_ERROR_RESOLVED auto-clears the modal by errorCode", () => {
    const socket = makeFakeSocket();
    registerMixerSocketHandlers(socket as never);
    socket.emit(STC_MIXER_ERROR, { errorCode: "MIXER_CAPTURE_PATH_LOST", mixerId: "mix1", message: "USB lost", level: "modal" });
    expect(useStore.getState().notifications).toHaveLength(1);
    socket.emit(STC_MIXER_ERROR_RESOLVED, { errorCode: "MIXER_CAPTURE_PATH_LOST" });
    expect(useStore.getState().notifications).toHaveLength(0);
  });
});
