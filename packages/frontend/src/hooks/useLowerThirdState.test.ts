import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useLowerThirdState } from "./useLowerThirdState";
import { useStore } from "../store";
import { INITIAL_LOWER_THIRD_STATE } from "../store/lowerThirdSlice";
import { CTS_LOWER_THIRD_COMMAND } from "@invisible-av-booth/shared";

const mockEmit = vi.fn();
let mockSocket: { emit: typeof mockEmit } | null = { emit: mockEmit };

vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => mockSocket,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSocket = { emit: mockEmit };
  useStore.setState({ lowerThirdState: INITIAL_LOWER_THIRD_STATE });
});

describe("useLowerThirdState", () => {
  it("returns current lowerThirdState from the store", () => {
    const { result } = renderHook(() => useLowerThirdState());
    expect(result.current.state).toEqual(INITIAL_LOWER_THIRD_STATE);
  });

  it("sendCommand resolves with error when socket is null", async () => {
    mockSocket = null;
    const { result } = renderHook(() => useLowerThirdState());
    const response = await act(() => result.current.sendCommand({ type: "dismiss-active" }));
    expect(response).toEqual({ success: false, error: "Not connected" });
  });

  it("sendCommand emits on socket and resolves with callback result", async () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    const { result } = renderHook(() => useLowerThirdState());
    const response = await act(() => result.current.sendCommand({ type: "dismiss-active" }));
    expect(mockEmit).toHaveBeenCalledWith(CTS_LOWER_THIRD_COMMAND, { type: "dismiss-active" }, expect.any(Function));
    expect(response).toEqual({ success: true });
  });
});
