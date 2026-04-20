import type { ReactNode } from "react";
import { IonButton, IonSpinner } from "@ionic/react";
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
  const streamDisabled = isPending || (!obsState.streaming && !!streamDisabledReason);

  return (
    <div data-testid="obs-controls" style={{ display: "flex", gap: "var(--space-control-gap)", flex: 1 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <IonButton
          data-testid="obs-stream-btn"
          expand="block"
          color={obsState.streaming ? "danger" : "primary"}
          disabled={streamDisabled}
          onClick={obsState.streaming ? onStopStream : onStartStream}
          style={{ flex: 1, fontSize: "1.125rem", fontWeight: "bold" }}
        >
          {isPending ? <IonSpinner name="crescent" /> : streamLabel}
        </IonButton>
        {streamDisabledReason && !obsState.streaming && (
          <span
            data-testid="stream-disabled-reason"
            style={{ fontSize: "0.6875rem", color: "var(--color-text-muted)", textAlign: "center", marginTop: "0.25rem" }}
          >
            {streamDisabledReason}
          </span>
        )}
      </div>
      <IonButton
        data-testid="obs-record-btn"
        expand="block"
        color={obsState.recording ? "danger" : "medium"}
        disabled={isPending}
        onClick={obsState.recording ? onStopRecording : onStartRecording}
        style={{ flex: 1, fontSize: "1.125rem", fontWeight: "bold" }}
      >
        {isPending ? <IonSpinner name="crescent" /> : recordLabel}
      </IonButton>
    </div>
  );
}
