import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useResizeObserver } from "./useResizeObserver";
import type { RefObject } from "react";

// ── Mock ResizeObserver ───────────────────────────────────────────────────────

type ResizeCallback = (entries: ResizeObserverEntry[]) => void;

let observerCallback: ResizeCallback | null = null;
const mockDisconnect = vi.fn();

const MockResizeObserver = vi.fn().mockImplementation((callback: ResizeCallback) => {
  observerCallback = callback;
  return {
    observe: vi.fn(),
    disconnect: mockDisconnect,
    unobserve: vi.fn(),
  };
});

vi.stubGlobal("ResizeObserver", MockResizeObserver);

beforeEach(() => {
  observerCallback = null;
  vi.clearAllMocks();
});

function makeRef(element: HTMLElement | null): RefObject<HTMLElement | null> {
  return { current: element };
}

describe("useResizeObserver", () => {
  it("returns 0 initially", () => {
    const ref = makeRef(document.createElement("div"));
    const { result } = renderHook(() => useResizeObserver(ref));
    expect(result.current).toBe(0);
  });

  it("returns observed width on resize", () => {
    const ref = makeRef(document.createElement("div"));
    const { result } = renderHook(() => useResizeObserver(ref));

    act(() => {
      observerCallback?.([{ contentRect: { width: 300 } } as ResizeObserverEntry]);
    });

    expect(result.current).toBe(300);
  });

  it("updates on subsequent resizes", () => {
    const ref = makeRef(document.createElement("div"));
    const { result } = renderHook(() => useResizeObserver(ref));

    act(() => {
      observerCallback?.([{ contentRect: { width: 200 } } as ResizeObserverEntry]);
    });
    expect(result.current).toBe(200);

    act(() => {
      observerCallback?.([{ contentRect: { width: 500 } } as ResizeObserverEntry]);
    });
    expect(result.current).toBe(500);
  });

  it("disconnects observer on unmount", () => {
    const ref = makeRef(document.createElement("div"));
    const { unmount } = renderHook(() => useResizeObserver(ref));
    unmount();
    expect(mockDisconnect).toHaveBeenCalledOnce();
  });

  it("handles null ref gracefully", () => {
    const ref = makeRef(null);
    const { result } = renderHook(() => useResizeObserver(ref));
    expect(result.current).toBe(0);
  });
});
