import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_SUPPRESS_MS, CONTROL_THROTTLE_MS } from "@invisible-av-booth/shared";

export interface HeldControl {
  /** The value to display (local while adjusting, backend otherwise). */
  value: number;
  /** Feed a value that arrived from the backend. Dropped during the suppression window. */
  onBackendValue: (value: number) => void;
  /** Report a local change (drag). Updates value immediately, emits throttled. */
  onLocalChange: (value: number) => void;
  /** Report release (pointer/touch up). Guarantees a final emit of the exact value. */
  onRelease: (value: number) => void;
}

/**
 * Local-authority hold for a continuous control (Req 8).
 *
 * - While interacting AND for CONTROL_SUPPRESS_MS (300ms) after the last local
 *   change, incoming backend values are IGNORED (dropped, not queued) so the
 *   control never jumps back mid-adjustment.
 * - Outbound emits are throttled to CONTROL_THROTTLE_MS (~50ms) while dragging,
 *   with a GUARANTEED final emit on release (the exact released value).
 *
 * NOT used for discrete controls (mute, preset) — those reflect backend state
 * immediately.
 */
export function useHeldControl(initial: number, emit: (value: number) => void): HeldControl {
  const [value, setValue] = useState(initial);

  // Timestamp of the last local change; incoming backend values are dropped
  // until now() - lastLocalChange >= CONTROL_SUPPRESS_MS.
  const lastLocalChangeRef = useRef<number>(0);
  // Last time we emitted, for outbound throttling.
  const lastEmitRef = useRef<number>(0);
  // Pending trailing emit (so the last dragged value is not lost between ticks).
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingValueRef = useRef<number | null>(null);

  // Keep the latest emit fn without retriggering effects.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  const clearTrailing = useCallback(() => {
    if (trailingTimerRef.current) {
      clearTimeout(trailingTimerRef.current);
      trailingTimerRef.current = null;
    }
  }, []);

  const onBackendValue = useCallback((incoming: number) => {
    const sinceLocal = Date.now() - lastLocalChangeRef.current;
    if (sinceLocal < CONTROL_SUPPRESS_MS) return; // drop during the suppression window
    setValue(incoming);
  }, []);

  const onLocalChange = useCallback((next: number) => {
    lastLocalChangeRef.current = Date.now();
    setValue(next);
    pendingValueRef.current = next;

    const sinceEmit = Date.now() - lastEmitRef.current;
    if (sinceEmit >= CONTROL_THROTTLE_MS) {
      lastEmitRef.current = Date.now();
      emitRef.current(next);
      pendingValueRef.current = null;
    } else if (!trailingTimerRef.current) {
      // Schedule a trailing emit so the most recent value lands after the window.
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null;
        if (pendingValueRef.current !== null) {
          lastEmitRef.current = Date.now();
          emitRef.current(pendingValueRef.current);
          pendingValueRef.current = null;
        }
      }, CONTROL_THROTTLE_MS - sinceEmit);
    }
  }, []);

  const onRelease = useCallback(
    (finalValue: number) => {
      lastLocalChangeRef.current = Date.now();
      clearTrailing();
      pendingValueRef.current = null;
      setValue(finalValue);
      lastEmitRef.current = Date.now();
      emitRef.current(finalValue); // guaranteed final emit
    },
    [clearTrailing],
  );

  useEffect(() => clearTrailing, [clearTrailing]);

  return { value, onBackendValue, onLocalChange, onRelease };
}
