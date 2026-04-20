import type { ReactNode } from "react";
import type { ObsState } from "../../types";

interface ObsStatusBarProps {
  obsState: ObsState;
  onEditDetails: () => void;
}

export function ObsStatusBar({ obsState, onEditDetails }: ObsStatusBarProps): ReactNode {
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
      <span style={{ flex: 1 }} />
      <button
        data-testid="edit-details-btn"
        onClick={onEditDetails}
        style={{
          background: "none",
          border: "none",
          color: "var(--color-text)",
          cursor: "pointer",
          fontSize: "1.125rem",
          width: "2.5rem",
          height: "2.5rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
        aria-label="Edit Details"
      >
        ✏
      </button>
    </div>
  );
}
