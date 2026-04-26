import type { ReactNode } from "react";
import { IonButton, IonSpinner } from "@ionic/react";
import { TEST_ID_OBS_CONTROLS, TEST_ID_OBS_STREAM_BUTTON, TEST_ID_OBS_RECORD_BUTTON, TEST_ID_STREAM_DISABLED_REASON } from "../../constants/testIds";
import type { ObsState } from "../../types";

interface ObsControlsProps {
  obsState: ObsState;
  isPending: boolean;
  onStartStream: () => void;
  onStopStream: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
  streamDisabledReason?: string;
}

export function ObsControls({
  obsState,
  isPending,
  onStartStream,
  onStopStream,
  onStartRecording,
  onStopRecording,
  streamDisabledReason,
}: ObsControlsProps): ReactNode {
  const streamLabel = obsState.streaming ? "Stop Stream" : "Start Stream";
  const recordLabel = obsState.recording ? "Stop Recording" : "Start Recording";

  return (
    <div data-testid={TEST_ID_OBS_CONTROLS} className="obs-controls">
      <IonButton
        data-testid={TEST_ID_OBS_STREAM_BUTTON}
        expand="block"
        color={obsState.streaming ? "danger" : "primary"}
        disabled={isPending}
        onClick={obsState.streaming ? onStopStream : onStartStream}
        className={`fill-remaining text-bold ionic-button-rounded ${streamDisabledReason && !obsState.streaming ? "opacity-subdued" : ""}`}
      >
        {isPending ? (
          <IonSpinner name="crescent" />
        ) : (
          <div className="layout-column layout-centered">
            <span className="text-button-large">{streamLabel}</span>
            {streamDisabledReason && !obsState.streaming && (
              <span data-testid={TEST_ID_STREAM_DISABLED_REASON} style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.125rem" }}>
                {streamDisabledReason}
              </span>
            )}
          </div>
        )}
      </IonButton>
      <IonButton
        data-testid={TEST_ID_OBS_RECORD_BUTTON}
        expand="block"
        color={obsState.recording ? "danger" : "medium"}
        disabled={isPending}
        onClick={obsState.recording ? onStopRecording : onStartRecording}
        className="fill-remaining text-button-large text-bold ionic-button-rounded"
      >
        {isPending ? <IonSpinner name="crescent" /> : recordLabel}
      </IonButton>
    </div>
  );
}
