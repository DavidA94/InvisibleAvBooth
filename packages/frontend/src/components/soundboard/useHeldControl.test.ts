import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { CONTROL_DEBOUNCE_MS, CONTROL_MAX_WAIT_MS } from "@invisible-av-booth/shared";
import { useHeldControl } from "./useHeldControl";

describe("useHeldControl", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("initializes with the given value", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    expect(result.current.value).toBe(0.5);
  });

  it("shows the live local value immediately while interacting", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.8));
    expect(result.current.value).toBe(0.8);
  });

  it("debounces outbound: a single send fires only after the user goes quiet", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => {
      result.current.onLocalChange(0.6);
      vi.advanceTimersByTime(CONTROL_DEBOUNCE_MS - 20);
      result.current.onLocalChange(0.61); // resets the debounce
      vi.advanceTimersByTime(CONTROL_DEBOUNCE_MS - 20);
      result.current.onLocalChange(0.62); // resets again
    });
    // Nothing sent yet — the user never paused long enough and max-wait not hit.
    expect(emit).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(CONTROL_DEBOUNCE_MS));
    // One send, carrying the LATEST value.
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith(0.62);
  });

  it("max-wait forces a send during a continuous hold even without a pause", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => {
      // Nudge continuously faster than the debounce so it never fires on its own.
      let value = 0.6;
      const step = CONTROL_DEBOUNCE_MS - 40;
      let elapsed = 0;
      while (elapsed < CONTROL_MAX_WAIT_MS + step) {
        result.current.onLocalChange(value);
        vi.advanceTimersByTime(step);
        elapsed += step;
        value += 0.01;
      }
    });
    // Despite never pausing, max-wait guarantees at least one send mid-hold.
    expect(emit).toHaveBeenCalled();
  });

  it("accepts a backend value unconditionally, even mid-interaction (the 2.5→2.0 correction)", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    // User is holding at a commanded value...
    act(() => result.current.onLocalChange(0.8));
    expect(result.current.value).toBe(0.8);
    // ...the backend (authoritative, latest-only) reports the board rounded to 0.78.
    act(() => result.current.onBackendValue(0.78));
    expect(result.current.value).toBe(0.78);
  });

  it("accepts later external changes (physical console moves)", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onRelease(0.9));
    act(() => result.current.onBackendValue(0.9)); // mixer confirms
    expect(result.current.value).toBe(0.9);
    act(() => result.current.onBackendValue(0.3)); // later physical-console move
    expect(result.current.value).toBe(0.3);
  });

  it("guarantees an immediate final send on release with the exact released value", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.6));
    act(() => result.current.onRelease(0.9));
    expect(emit).toHaveBeenLastCalledWith(0.9);
    expect(result.current.value).toBe(0.9);
  });

  it("does not leave a pending debounce timer after release", () => {
    const emit = vi.fn();
    const { result } = renderHook(() => useHeldControl(0.5, emit));
    act(() => result.current.onLocalChange(0.6));
    act(() => result.current.onRelease(0.9));
    emit.mockClear();
    act(() => vi.advanceTimersByTime(CONTROL_MAX_WAIT_MS * 2));
    // Release flushed and cleared the timer — no stray trailing send.
    expect(emit).not.toHaveBeenCalled();
  });
});
