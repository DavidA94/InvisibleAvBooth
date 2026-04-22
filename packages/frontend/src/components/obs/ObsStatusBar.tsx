import type { ReactNode } from "react";
import type { ObsState } from "../../types";

interface ObsStatusBarProps {
  obsState: ObsState;
}

export function ObsStatusBar({ obsState }: ObsStatusBarProps): ReactNode {
  return (
    <div data-testid="obs-status-bar" className="obs-status-bar">
      {obsState.streaming ? (
        <span data-testid="stream-status" className="text-success text-bold">
          ● LIVE
        </span>
      ) : (
        <span data-testid="stream-status" className="text-muted">
          ● Offline
        </span>
      )}
      {obsState.streamTimecode && <span data-testid="stream-timecode">{obsState.streamTimecode}</span>}
      {obsState.recording && (
        <span data-testid="recording-indicator" className="text-danger">
          ⏺ REC
        </span>
      )}
    </div>
  );
}
