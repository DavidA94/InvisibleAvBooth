import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useHeldControl } from "./useHeldControl";

describe("useHeldControl", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("initializes with the given value", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    expect(result.current.value).toBe(0.5);
  });

  it("drops a backend value that arrives within the suppression window", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.8)); // starts the 300ms window
    act(() => {
      vi.advanceTimersByTime(100); // still inside window
      result.current.onBackendValue(0.2);
    });
    expect(result.current.value).toBe(0.8); // backend value dropped
  });

  it("applies a backend value that arrives after the suppression window", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.8));
    act(() => {
      vi.advanceTimersByTime(350); // past the 300ms window
      result.current.onBackendValue(0.2);
    });
    expect(result.current.value).toBe(0.2);
  });

  it("emits immediately on the first local change", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.6));
    expect(emit).toHaveBeenCalledWith(0.6);
  });

  it("throttles rapid local changes to ~CONTROL_THROTTLE_MS spacing", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.6)); // immediate emit
    act(() => {
      vi.advanceTimersByTime(10);
      result.current.onLocalChange(0.61); // within throttle → scheduled
      vi.advanceTimersByTime(10);
      result.current.onLocalChange(0.62); // still within throttle → replaces pending
    });
    // Only one emit so far (the immediate one).
    expect(emit).toHaveBeenCalledTimes(1);
    act(() => vi.advanceTimersByTime(50)); // let the trailing emit fire
    // Trailing emit carries the LATEST value.
    expect(emit).toHaveBeenLastCalledWith(0.62);
  });

  it("guarantees a final emit on release with the exact released value", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.6));
    act(() => {
      vi.advanceTimersByTime(10);
      result.current.onRelease(0.9);
    });
    expect(emit).toHaveBeenLastCalledWith(0.9);
    expect(result.current.value).toBe(0.9);
  });

  it("suppresses backend values briefly after release too", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onRelease(0.9));
    act(() => {
      vi.advanceTimersByTime(100);
      result.current.onBackendValue(0.3);
    });
    expect(result.current.value).toBe(0.9); // still suppressed
  });
});
