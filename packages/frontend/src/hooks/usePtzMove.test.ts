import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePtzMove } from "./usePtzMove";
import { CTS_CAMERA_PTZ_MOVE_START, CTS_CAMERA_PTZ_MOVE_KEEPALIVE, CTS_CAMERA_PTZ_MOVE_STOP } from "@invisible-av-booth/shared";

const mockEmit = vi.fn();
vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

describe("usePtzMove", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockEmit.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("startMove emits move:start event", () => {
    const { result } = renderHook(() => usePtzMove());
    act(() => {
      result.current.startMove("cam1", 0.5, -0.3);
    });
    expect(mockEmit).toHaveBeenCalledWith(CTS_CAMERA_PTZ_MOVE_START, { cameraId: "cam1", pan: 0.5, tilt: -0.3 });
  });

  it("emits keepalive every 200ms", () => {
    const { result } = renderHook(() => usePtzMove());
    act(() => {
      result.current.startMove("cam1", 0.5, -0.3);
    });
    mockEmit.mockClear();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mockEmit).toHaveBeenCalledWith(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, { cameraId: "cam1", pan: 0.5, tilt: -0.3 });

    mockEmit.mockClear();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mockEmit).toHaveBeenCalledWith(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, { cameraId: "cam1", pan: 0.5, tilt: -0.3 });
  });

  it("updateMove changes keepalive values", () => {
    const { result } = renderHook(() => usePtzMove());
    act(() => {
      result.current.startMove("cam1", 0.5, -0.3);
    });
    act(() => {
      result.current.updateMove(0.8, 0.1);
    });
    mockEmit.mockClear();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(mockEmit).toHaveBeenCalledWith(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, { cameraId: "cam1", pan: 0.8, tilt: 0.1 });
  });

  it("stopMove emits move:stop and stops keepalives", () => {
    const { result } = renderHook(() => usePtzMove());
    act(() => {
      result.current.startMove("cam1", 0.5, -0.3);
    });
    mockEmit.mockClear();
    act(() => {
      result.current.stopMove();
    });
    expect(mockEmit).toHaveBeenCalledWith(CTS_CAMERA_PTZ_MOVE_STOP, { cameraId: "cam1" });

    mockEmit.mockClear();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // No more keepalives after stop
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("cleanup on unmount stops interval", () => {
    const { result, unmount } = renderHook(() => usePtzMove());
    act(() => {
      result.current.startMove("cam1", 0.5, -0.3);
    });
    mockEmit.mockClear();
    unmount();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // No keepalives after unmount
    expect(mockEmit).not.toHaveBeenCalledWith(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, expect.anything());
  });
});
