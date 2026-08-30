import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { TEST_ID_MIXER_MUTE_BUTTON, TEST_ID_MIXER_MUTE_STATUS } from "../../constants/testIds";

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
 * DISCRETE + NOT OPTIMISTIC (Req 6.3): toggling does NOT flip to the commanded
 * state. It immediately enters the UNKNOWN state and stays there until the
 * mixer's own value arrives (read-back success or /xremote push), then resolves
 * to the mixer-reported On/Off. This prevents a brief false "Audio: On/Off"
 * during the send→confirm gap — a false "Off" on a live mic is the worst-case
 * audio error, so mute never shows a value the mixer has not confirmed. It is
 * exempt from the fader/gain suppression window (a discrete toggle).
 */
export function MuteButton({ channel, muted, unreconciled = false, onToggle }: MuteButtonProps): ReactNode {
  // While true, we've toggled and are waiting for the mixer to confirm.
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);
  // Track the backend value we've "seen" so a genuine change clears the wait.
  const lastSeenMutedRef = useRef(muted);

  useEffect(() => {
    // A new backend value arrived → the mixer confirmed; clear the pending state.
    if (muted !== lastSeenMutedRef.current) {
      lastSeenMutedRef.current = muted;
      setAwaitingConfirm(false);
    }
  }, [muted]);

  const display: MuteDisplay = awaitingConfirm || unreconciled ? "unknown" : muted ? "off" : "on";

  const handleClick = (): void => {
    setAwaitingConfirm(true); // enter unknown immediately; do NOT flip optimistically
    onToggle(!muted);
  };

  const statusText = display === "on" ? "Audio: On" : display === "off" ? "Audio: Off" : "Audio: Unknown";
  const dataState = display === "unknown" ? "unknown" : muted ? "muted" : "active";

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
