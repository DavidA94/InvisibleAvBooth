import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_THROTTLE_MS, CONTROL_SETTLE_MS } from "@invisible-av-booth/shared";

export interface HeldControl {
  /** The value to display (local while adjusting, backend otherwise). */
  value: number;
  /** Feed a value that arrived from the backend. Dropped only during the settle window. */
  onBackendValue: (value: number) => void;
  /** Report a local change (drag). Updates value immediately, emits throttled. */
  onLocalChange: (value: number) => void;
  /** Report release (pointer/touch up). Guarantees a final emit of the exact value. */
  onRelease: (value: number) => void;
}

/**
 * Local-authority hold for a continuous control (Req 8).
 *
 * The problem this solves: while the volunteer moves a fader/gain, the backend is
 * also streaming that control's state back. Under congestion those inbound
 * updates can be STALE (a value that predates the latest local change), and if
 * applied they make the control visibly jump to an old value and then snap back
 * when the correct one lands — the live "jump to another value and back" bug.
 *
 * WHY a short SETTLE WINDOW rather than confirmation-matching: we cannot wait for
 * an inbound value that EQUALS what we commanded — the X Air rounds to its own
 * grid (command 2.5 dB, the console settles at 2.6 dB), so an exact match may
 * NEVER arrive. The mixer is authoritative: its rounded value is the truth and
 * must be shown. So after the last local change we drop inbound values for just
 * CONTROL_SETTLE_MS — long enough to let pre-command stragglers flush — then
 * accept the next backend value UNCONDITIONALLY, rounding and all. The backend
 * already guarantees it only broadcasts reads that post-date the latest write
 * (coalescing worker + per-address epoch), so the first value after the settle
 * window is the mixer's genuine answer to our command.
 *
 * CONTROL_SETTLE_MS is tied to the backend read-back timeout (the earliest a
 * genuine answer can arrive), so the window closes right about when the real
 * answer shows up — stragglers are filtered, the true value is not.
 *
 * NOT used for discrete controls (mute, preset) — those reflect backend state
 * immediately.
 */
export function useHeldControl(initial: number, emit: (value: number) => void): HeldControl {
  const [value, setValue] = useState(initial);

  // Timestamp of the last local change/release. Inbound values are dropped while
  // now - lastLocalChange < CONTROL_SETTLE_MS, then accepted (mixer is authority).
  const lastLocalChangeRef = useRef<number>(0);

  // Outbound throttle bookkeeping.
  const lastEmitRef = useRef<number>(0);
  const trailingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const throttleValueRef = useRef<number | null>(null);

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
    // Drop only pre-command stragglers within the settle window; after it, accept
    // the mixer's value verbatim (it is authoritative, including its rounding).
    if (Date.now() - lastLocalChangeRef.current < CONTROL_SETTLE_MS) return;
    setValue(incoming);
  }, []);

  const onLocalChange = useCallback((next: number) => {
    lastLocalChangeRef.current = Date.now();
    setValue(next);

    // Outbound throttle while dragging, with a guaranteed trailing emit.
    throttleValueRef.current = next;
    const sinceEmit = Date.now() - lastEmitRef.current;
    if (sinceEmit >= CONTROL_THROTTLE_MS) {
      lastEmitRef.current = Date.now();
      emitRef.current(next);
      throttleValueRef.current = null;
    } else if (!trailingTimerRef.current) {
      trailingTimerRef.current = setTimeout(() => {
        trailingTimerRef.current = null;
        if (throttleValueRef.current !== null) {
          lastEmitRef.current = Date.now();
          emitRef.current(throttleValueRef.current);
          // The trailing emit is a fresh local change — restart the settle window
          // so stragglers from before it are still filtered.
          lastLocalChangeRef.current = Date.now();
          throttleValueRef.current = null;
        }
      }, CONTROL_THROTTLE_MS - sinceEmit);
    }
  }, []);

  const onRelease = useCallback(
    (finalValue: number) => {
      lastLocalChangeRef.current = Date.now();
      clearTrailing();
      throttleValueRef.current = null;
      setValue(finalValue);
      lastEmitRef.current = Date.now();
      emitRef.current(finalValue); // guaranteed final emit
    },
    [clearTrailing],
  );

  useEffect(() => clearTrailing, [clearTrailing]);

  return { value, onBackendValue, onLocalChange, onRelease };
}
