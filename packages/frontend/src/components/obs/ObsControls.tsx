import type { ReactNode } from "react";
import { IonButton, IonSpinner } from "@ionic/react";
import { TEST_ID_OBS_CONTROLS, TEST_ID_MANAGE_STREAMS_BUTTON, TEST_ID_OBS_RECORD_BUTTON } from "../../constants/testIds";
import type { ObsState } from "../../types";

interface ObsControlsProps {
  obsState: ObsState;
  isPending: boolean;
  manifestReady: boolean;
  onManageStreams: () => void;
  onStartRecording: () => void;
  onStopRecording: () => void;
}

export function ObsControls({ obsState, isPending, manifestReady, onManageStreams, onStartRecording, onStopRecording }: ObsControlsProps): ReactNode {
  const recordLabel = obsState.recording ? "Stop Recording" : "Start Recording";
  const manageSubLabel = manifestReady ? undefined : "Enter metadata";

  return (
    <div data-testid={TEST_ID_OBS_CONTROLS} className="obs-controls">
      <IonButton
        data-testid={TEST_ID_MANAGE_STREAMS_BUTTON}
        expand="block"
        color="primary"
        disabled={isPending}
        onClick={onManageStreams}
        className={`fill-remaining text-bold ionic-button-rounded ${manageSubLabel ? "opacity-subdued" : ""}`}
      >
        {isPending ? (
          <IonSpinner name="crescent" />
        ) : (
          <div className="layout-column layout-centered">
            <span className="text-button-large">Manage Streams</span>
            {manageSubLabel && <span style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "0.125rem" }}>{manageSubLabel}</span>}
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
