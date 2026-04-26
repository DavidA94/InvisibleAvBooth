import type { ReactNode } from "react";
import { TEST_ID_OBS_STATUS_BAR, TEST_ID_STREAM_STATUS, TEST_ID_STREAM_TIMECODE, TEST_ID_RECORDING_INDICATOR } from "../../constants/testIds";
import type { ObsState } from "../../types";

interface ObsStatusBarProps {
  obsState: ObsState;
}

export function ObsStatusBar({ obsState }: ObsStatusBarProps): ReactNode {
  return (
    <div data-testid={TEST_ID_OBS_STATUS_BAR} className="obs-status-bar">
      {obsState.streaming ? (
        <span data-testid={TEST_ID_STREAM_STATUS} className="text-success text-bold">
          ● LIVE
        </span>
      ) : (
        <span data-testid={TEST_ID_STREAM_STATUS} className="text-muted">
          ● Offline
        </span>
      )}
      {obsState.streamTimecode && <span data-testid={TEST_ID_STREAM_TIMECODE}>{obsState.streamTimecode}</span>}
      {obsState.recording && (
        <span data-testid={TEST_ID_RECORDING_INDICATOR} className="text-danger">
          ⏺ REC
        </span>
      )}
    </div>
  );
}
