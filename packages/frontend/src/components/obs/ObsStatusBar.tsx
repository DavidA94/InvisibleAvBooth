import type { ReactNode } from "react";
import { TEST_ID_OBS_STATUS_BAR, TEST_ID_STREAM_STATUS, TEST_ID_STREAM_TIMECODE, TEST_ID_RECORDING_INDICATOR } from "../../constants/testIds";
import { usePlatformState } from "../../hooks/usePlatformState";
import type { ObsState } from "../../types";

interface ObsStatusBarProps {
  obsState: ObsState;
}

export function ObsStatusBar({ obsState }: ObsStatusBarProps): ReactNode {
  const { isAnyStarting, isAnyStopping } = usePlatformState();

  let statusLabel: ReactNode;
  if (isAnyStarting) {
    statusLabel = (
      <span data-testid={TEST_ID_STREAM_STATUS} className="text-warning text-bold">
        ● Going Live…
      </span>
    );
  } else if (isAnyStopping) {
    statusLabel = (
      <span data-testid={TEST_ID_STREAM_STATUS} className="text-warning text-bold">
        ● Stopping…
      </span>
    );
  } else if (obsState.streaming) {
    statusLabel = (
      <span data-testid={TEST_ID_STREAM_STATUS} className="text-success text-bold">
        ● LIVE
      </span>
    );
  } else {
    statusLabel = (
      <span data-testid={TEST_ID_STREAM_STATUS} className="text-muted">
        ● Offline
      </span>
    );
  }
  return (
    <div data-testid={TEST_ID_OBS_STATUS_BAR} className="obs-status-bar">
      {statusLabel}
      {obsState.streamTimecode && <span data-testid={TEST_ID_STREAM_TIMECODE}>{obsState.streamTimecode}</span>}
      {obsState.recording && (
        <span data-testid={TEST_ID_RECORDING_INDICATOR} className="text-danger">
          ⏺ REC
        </span>
      )}
    </div>
  );
}
