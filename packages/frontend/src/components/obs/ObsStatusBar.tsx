import type { ReactNode } from "react";
import type { ObsState } from "../../types";

interface ObsStatusBarProps {
  obsState: ObsState;
}

export function ObsStatusBar({ obsState }: ObsStatusBarProps): ReactNode {
  return (
    <div data-testid="obs-status-bar" style={{ display: "flex", alignItems: "center", height: "2.25rem", gap: "0.5rem", fontSize: "0.8125rem" }}>
      {obsState.streaming ? (
        <span data-testid="stream-status" style={{ color: "var(--color-success)", fontWeight: "bold" }}>
          ● LIVE
        </span>
      ) : (
        <span data-testid="stream-status" style={{ color: "var(--color-text-muted)" }}>
          ● Offline
        </span>
      )}
      {obsState.streamTimecode && <span data-testid="stream-timecode">{obsState.streamTimecode}</span>}
      {obsState.recording && (
        <span data-testid="recording-indicator" style={{ color: "var(--color-danger)" }}>
          ⏺ REC
        </span>
      )}
    </div>
  );
}
