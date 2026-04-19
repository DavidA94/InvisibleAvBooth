import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useObsState } from "./useObsState";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { CTS_OBS_COMMAND } from "@invisible-av-booth/shared";
import type { CommandResult } from "../types";

// ── Mock SocketProvider context ───────────────────────────────────────────────

const mockEmit = vi.fn();

vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

beforeEach(() => {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
  vi.clearAllMocks();
});

describe("useObsState", () => {
  it("returns current OBS state from store", () => {
    const { result } = renderHook(() => useObsState());
    expect(result.current.state).toEqual(INITIAL_OBS_STATE);
    expect(result.current.isPending).toBe(false);
  });

  it("sendCommand sets pending and emits socket event", async () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, ack: (result: CommandResult) => void) => {
      ack({ success: true });
    });

    const { result } = renderHook(() => useObsState());

    await act(async () => {
      const commandResult = await result.current.sendCommand({ type: "startStream" });
      expect(commandResult.success).toBe(true);
    });

    expect(mockEmit).toHaveBeenCalledWith(CTS_OBS_COMMAND, { type: "startStream" }, expect.any(Function));
  });

  it("clears pending on error response", async () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, ack: (result: CommandResult) => void) => {
      ack({ success: false, errorCode: "STREAM_START_FAILED", message: "Failed" });
    });

    const { result } = renderHook(() => useObsState());

    await act(async () => {
      await result.current.sendCommand({ type: "startStream" });
    });

    expect(useStore.getState().obsPending).toBe(false);
  });

  it("pending clears when setObsState is called (simulating stc:obs:state)", async () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, ack: (result: CommandResult) => void) => {
      ack({ success: true });
    });

    const { result } = renderHook(() => useObsState());

    await act(async () => {
      await result.current.sendCommand({ type: "startStream" });
    });

    // Simulate backend state update arriving
    act(() => {
      useStore.getState().setObsState({
        ...INITIAL_OBS_STATE,
        connected: true,
        streaming: true,
        commandedState: { streaming: true, recording: false },
      });
    });

    expect(useStore.getState().obsPending).toBe(false);
  });
});
