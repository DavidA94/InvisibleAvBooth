import { useCallback, useEffect, useRef, useState } from "react";
import { CONTROL_DEBOUNCE_MS, CONTROL_MAX_WAIT_MS } from "@invisible-av-booth/shared";

export interface HeldControl {
  /** The value to display (local while interacting, backend value otherwise). */
  value: number;
  /** Feed a value that arrived from the backend. Always applied (see WHY below). */
  onBackendValue: (value: number) => void;
  /** Report a local change (drag). Updates value immediately, sends debounced. */
  onLocalChange: (value: number) => void;
  /** Report release (pointer/touch up). Guarantees a final send of the exact value. */
  onRelease: (value: number) => void;
}

/**
 * Local-display hold for a continuous control (fader / gain), Req 8.
 *
 * WHAT THIS SOLVES, AND WHO OWNS WHAT
 * -----------------------------------
 * While the volunteer moves a control, two things happen at once: the UI must
 * track their finger smoothly, AND the backend is streaming the control's real
 * value back (the mixer rounds/clamps, e.g. you command 2.5 dB and the console
 * lands on 2.0 dB — that 2.0 is the truth and must become the live value).
 *
 * Earlier variants tried to filter inbound values on the FRONTEND (suppress /
 * settle windows) to avoid a stale echo yanking the thumb. That was the wrong
 * layer: while the user kept nudging, the window never closed, so the mixer's
 * genuine value was hidden until release — and a stale echo at the window edge
 * still slipped through. The correct owner of "is this value stale?" is the
 * BACKEND, which stamps every write with a sequence and only ever broadcasts a
 * read-back that is still the latest write for that address (see
 * BehringerXAirDriver writeSeq/broadcastSeq). Superseded read-backs are dropped
 * before they leave the server.
 *
 * GIVEN that backend guarantee, this hook is simple and correct:
 *   • onLocalChange shows the finger position immediately (local authority while
 *     interacting) and schedules a debounced send.
 *   • onBackendValue is applied UNCONDITIONALLY — anything the backend sends is,
 *     by construction, the newest settled truth. This is what lets a mid-hold
 *     correction (2.5→2.0) appear even while the control is still held.
 *   • onRelease forces an immediate final send of the exact released value.
 *
 * OUTBOUND: DEBOUNCE + MAX-WAIT
 * -----------------------------
 * We do NOT send every intermediate value (that floods the board and the wire).
 * Instead we debounce: a send fires CONTROL_DEBOUNCE_MS after the user goes
 * quiet. But a pure debounce would send NOTHING during a continuous slow drag or
 * a held-and-nudged thumb — so the board would not track and the authoritative
 * value could not flow back until release. MAX-WAIT fixes that: regardless of
 * how continuously the user moves, we force a send at least every
 * CONTROL_MAX_WAIT_MS. Release always forces a final send immediately.
 */
export function useHeldControl(initial: number, emit: (value: number) => void): HeldControl {
  const [value, setValue] = useState(initial);

  // Latest value the user has dialed in but not yet sent.
  const pendingValueRef = useRef<number | null>(null);
  // Debounce timer (fires after the user goes quiet).
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Timestamp of the first un-sent change in the current burst (for max-wait).
  const burstStartRef = useRef<number>(0);

  // Keep the latest emit fn without retriggering effects.
  const emitRef = useRef(emit);
  useEffect(() => {
    emitRef.current = emit;
  }, [emit]);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  /** Send the pending value now and reset the burst bookkeeping. */
  const flush = useCallback(() => {
    clearDebounce();
    burstStartRef.current = 0;
    if (pendingValueRef.current !== null) {
      const toSend = pendingValueRef.current;
      pendingValueRef.current = null;
      emitRef.current(toSend);
    }
  }, [clearDebounce]);

  const onBackendValue = useCallback((incoming: number) => {
    // Applied unconditionally — the backend guarantees it only broadcasts the
    // latest settled value for this address, so there is nothing to filter.
    setValue(incoming);
  }, []);

  const onLocalChange = useCallback(
    (next: number) => {
      setValue(next); // local display authority while interacting
      pendingValueRef.current = next;

      const now = Date.now();
      if (burstStartRef.current === 0) burstStartRef.current = now;

      // MAX-WAIT: if we have been accumulating changes for at least this long
      // without a send, fire immediately so the board tracks a continuous drag
      // and the authoritative value can echo back mid-hold.
      if (now - burstStartRef.current >= CONTROL_MAX_WAIT_MS) {
        flush();
        return;
      }

      // Otherwise (re)arm the debounce — a send fires once the user goes quiet.
      clearDebounce();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        flush();
      }, CONTROL_DEBOUNCE_MS);
    },
    [clearDebounce, flush],
  );

  const onRelease = useCallback(
    (finalValue: number) => {
      setValue(finalValue);
      pendingValueRef.current = finalValue;
      flush(); // guaranteed immediate final send of the exact released value
    },
    [flush],
  );

  useEffect(() => clearDebounce, [clearDebounce]);

  return { value, onBackendValue, onLocalChange, onRelease };
}
