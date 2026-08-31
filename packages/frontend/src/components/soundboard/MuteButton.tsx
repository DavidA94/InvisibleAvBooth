import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { MUTE_CONFIRM_TIMEOUT_MS } from "@invisible-av-booth/shared";
import { TEST_ID_MIXER_MUTE_BUTTON, TEST_ID_MIXER_MUTE_STATUS } from "../../constants/testIds";
import { logger } from "../../logger";

interface MuteButtonProps {
  channel: number;
  /** Backend-reported mute state (authoritative). */
  muted: boolean;
  /** True when read-back was exhausted (Req 6.6) — forces the unknown state. */
  unreconciled?: boolean;
  /** Toggle handler — emits the desired mute state to the backend. */
  onToggle: (muted: boolean) => void;
}

type MuteDisplay = "on" | "off" | "unknown";

/**
 * Mute / unmute control (Req 6). A physical-button affordance with a "Mute"
 * label and an unambiguous TEXT status above it — "Audio: On" (green dot),
 * "Audio: Off" (red dot), or "Audio: Unknown" (yellow dot).
 *
 * DISCRETE + OPTIMISTIC-WITH-TIMEOUT: toggling immediately shows the COMMANDED
 * state (we trust the command went through) rather than flashing "Unknown" on
 * every normal toggle. A MUTE_CONFIRM_TIMEOUT_MS (500ms) timer runs; if the
 * mixer confirms the commanded value (via a `muted` prop update from read-back
 * or /xremote) before it fires, the optimistic value is simply confirmed and the
 * timer is cancelled. If the window elapses with no confirmation, the control
 * falls back to "Audio: Unknown" — surfacing a genuinely lost/failed command
 * rather than continuing to assert an unconfirmed value. Read-back exhaustion
 * reported by the backend (`unreconciled`, Req 6.6) always forces Unknown.
 *
 * Mute is exempt from the fader/gain suppression window (a discrete toggle).
 */
export function MuteButton({ channel, muted, unreconciled = false, onToggle }: MuteButtonProps): ReactNode {
  // The value we optimistically show after a local toggle, or null when we are
  // simply reflecting the backend-reported `muted`.
  const [optimisticMuted, setOptimisticMuted] = useState<boolean | null>(null);
  // True after the confirm window elapsed with no matching backend value.
  const [confirmTimedOut, setConfirmTimedOut] = useState(false);

  const commandedRef = useRef<boolean | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = (): void => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // When the backend-reported value matches what we commanded, the mixer has
  // confirmed the toggle — drop the optimistic overlay and cancel the timer.
  useEffect(() => {
    if (commandedRef.current !== null && muted === commandedRef.current) {
      commandedRef.current = null;
      setOptimisticMuted(null);
      setConfirmTimedOut(false);
      clearTimer();
    }
  }, [muted]);

  useEffect(() => clearTimer, []);

  const handleClick = (): void => {
    const commanded = !muted;
    commandedRef.current = commanded;
    setOptimisticMuted(commanded); // OPTIMISTIC: show the commanded state immediately
    setConfirmTimedOut(false);
    onToggle(commanded);

    clearTimer();
    timerRef.current = setTimeout(() => {
      // No confirmed value within the window → fall back to Unknown. Log it so a
      // channel that keeps flipping to Unknown is traceable in the unified log
      // (source: "frontend"), distinguishing a UI confirm-timeout from a backend
      // read-back exhaustion (which the driver WARN-logs separately).
      logger.warn("Mute confirm timed out — channel showing Unknown", {
        context: { channel, commanded, timeoutMs: MUTE_CONFIRM_TIMEOUT_MS },
      });
      setConfirmTimedOut(true);
      timerRef.current = null;
    }, MUTE_CONFIRM_TIMEOUT_MS);
  };

  // Effective mute state to display: the optimistic value while pending,
  // otherwise the backend-reported value.
  const effectiveMuted = optimisticMuted ?? muted;
  const display: MuteDisplay = confirmTimedOut || unreconciled ? "unknown" : effectiveMuted ? "off" : "on";

  const statusText = display === "on" ? "Audio: On" : display === "off" ? "Audio: Off" : "Unknown";
  const dataState = display === "unknown" ? "unknown" : effectiveMuted ? "muted" : "active";

  return (
    <div className="mixer-mute">
      <div data-testid={`${TEST_ID_MIXER_MUTE_STATUS}-${channel}`} className={`mixer-mute-status mixer-mute-status-${display}`}>
        <span className={`mixer-mute-dot mixer-mute-dot-${display}`} aria-hidden="true" />
        <span className="mixer-mute-status-text">{statusText}</span>
      </div>
      <button
        type="button"
        data-testid={`${TEST_ID_MIXER_MUTE_BUTTON}-${channel}`}
        data-state={dataState}
        className="mixer-mute-button"
        onClick={handleClick}
        aria-label={`Toggle mute for channel ${channel}`}
      >
        Mute
      </button>
    </div>
  );
}
