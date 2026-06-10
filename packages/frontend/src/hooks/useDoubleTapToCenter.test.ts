import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDoubleTapToCenter } from "./useDoubleTapToCenter";
import { CTS_CAMERA_PTZ_TAP_TO_CENTER } from "@invisible-av-booth/shared";
import type { CameraState } from "@invisible-av-booth/shared";

const mockEmit = vi.fn();
vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

const baseCameraState: CameraState = {
  cameraId: "cam1",
  connected: true,
  position: { pan: 0, tilt: 0, zoom: 0, focus: 0.5, autoFocus: true },
  autoFocus: true,
  aiTracking: false,
  aiTilt: false,
  aiZoom: false,
  activePresetId: null,
  features: ["pan", "tilt", "zoom"],
  capabilities: { tapToCenter: true },
  presets: [],
};

function createEvent(x: number, y: number) {
  return {
    clientX: x,
    clientY: y,
    currentTarget: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }) } as unknown as Element,
  };
}

describe("useDoubleTapToCenter", () => {
  const onToast = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    mockEmit.mockClear();
    onToast.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("single tap does not emit", () => {
    const { result } = renderHook(() => useDoubleTapToCenter({ cameraId: "cam1", cameraState: baseCameraState, onToast }));
    act(() => {
      result.current(createEvent(50, 50));
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("double tap within 400ms fires tap-to-center", () => {
    const { result } = renderHook(() => useDoubleTapToCenter({ cameraId: "cam1", cameraState: baseCameraState, onToast }));
    act(() => {
      result.current(createEvent(50, 50));
    });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    act(() => {
      result.current(createEvent(75, 25));
    });
    expect(mockEmit).toHaveBeenCalledWith(CTS_CAMERA_PTZ_TAP_TO_CENTER, expect.objectContaining({ cameraId: "cam1" }));
  });

  it("second tap coordinates used for offset calculation", () => {
    const { result } = renderHook(() => useDoubleTapToCenter({ cameraId: "cam1", cameraState: baseCameraState, onToast }));
    act(() => {
      result.current(createEvent(10, 10));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current(createEvent(75, 25)); // x=75/100*2-1=0.5, y=25/100*2-1=-0.5
    });
    const call = mockEmit.mock.calls[0]!;
    expect(call[1].offsetX).toBeCloseTo(0.5);
    expect(call[1].offsetY).toBeCloseTo(-0.5);
  });

  it("shows toast when VISCA not configured", () => {
    const noViscaState = { ...baseCameraState, capabilities: { tapToCenter: false } };
    const { result } = renderHook(() => useDoubleTapToCenter({ cameraId: "cam1", cameraState: noViscaState, onToast }));
    act(() => {
      result.current(createEvent(50, 50));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current(createEvent(50, 50));
    });
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("VISCA"));
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("shows toast when AI tracking is active", () => {
    const aiActiveState = { ...baseCameraState, aiTracking: true };
    const { result } = renderHook(() => useDoubleTapToCenter({ cameraId: "cam1", cameraState: aiActiveState, onToast }));
    act(() => {
      result.current(createEvent(50, 50));
    });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    act(() => {
      result.current(createEvent(50, 50));
    });
    expect(onToast).toHaveBeenCalledWith(expect.stringContaining("AI tracking"));
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("resets after timeout (>400ms gap = new first tap)", () => {
    const { result } = renderHook(() => useDoubleTapToCenter({ cameraId: "cam1", cameraState: baseCameraState, onToast }));
    act(() => {
      result.current(createEvent(50, 50));
    });
    act(() => {
      vi.advanceTimersByTime(500); // > 400ms
    });
    act(() => {
      result.current(createEvent(50, 50)); // This is a new first tap
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
