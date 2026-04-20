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

  // Stream button is never truly disabled — tapping it when metadata is missing
  // opens the metadata modal (handled by onStartStream). Only disable during pending.
  return (
    <div data-testid="obs-controls" style={{ display: "flex", gap: "var(--space-control-gap)", flex: 1, maxHeight: "12rem" }}>
      <IonButton
        data-testid="obs-stream-btn"
        expand="block"
        color={obsState.streaming ? "danger" : "primary"}
        disabled={isPending}
        onClick={obsState.streaming ? onStopStream : onStartStream}
        style={{ flex: 1, fontWeight: "bold", "--border-radius": "0.375rem", opacity: streamDisabledReason && !obsState.streaming ? 0.6 : 1 }}
      >
        {isPending ? (
          <IonSpinner name="crescent" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ fontSize: "1.125rem" }}>{streamLabel}</span>
            {streamDisabledReason && !obsState.streaming && (
              <span data-testid="stream-disabled-reason" style={{ fontSize: "0.6875rem", opacity: 0.7, marginTop: "0.125rem" }}>
                {streamDisabledReason}
              </span>
            )}
          </div>
        )}
      </IonButton>
      <IonButton
        data-testid="obs-record-btn"
        expand="block"
        color={obsState.recording ? "danger" : "medium"}
        disabled={isPending}
        onClick={obsState.recording ? onStopRecording : onStartRecording}
        style={{ flex: 1, fontSize: "1.125rem", fontWeight: "bold", "--border-radius": "0.375rem" }}
      >
        {isPending ? <IonSpinner name="crescent" /> : recordLabel}
      </IonButton>
    </div>
  );
}
