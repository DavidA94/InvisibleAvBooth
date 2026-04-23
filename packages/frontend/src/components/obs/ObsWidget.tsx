import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { WidgetContainer } from "../WidgetContainer";
import { WidgetErrorOverlay } from "../WidgetErrorOverlay";
import { ConfirmationModal } from "../ConfirmationModal";
import { SessionManifestModal } from "../SessionManifestModal";
import { ObsStatusBar } from "./ObsStatusBar";
import { ObsMetadataPreview } from "./ObsMetadataPreview";
import { ObsControls } from "./ObsControls";
import { useObsState } from "../../hooks/useObsState";
import { useStore } from "../../store";

export function ObsWidget(): ReactNode {
  const { state: obsState, isPending, sendCommand } = useObsState();
  const interpolatedStreamTitle = useStore((s) => s.interpolatedStreamTitle);
  const manifest = useStore((s) => s.manifest);

  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showStartConfirm, setShowStartConfirm] = useState(false);
  const [showStopStreamConfirm, setShowStopStreamConfirm] = useState(false);
  const [showStopRecordConfirm, setShowStopRecordConfirm] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const hasMetadata = !!(manifest.speaker || manifest.title);
  const streamDisabledReason = !hasMetadata ? "Enter metadata" : undefined;

  const runCommand = useCallback(
    async (type: "startStream" | "stopStream" | "startRecording" | "stopRecording"): Promise<void> => {
      const result = await sendCommand({ type });
      if (!result.success) {
        useStore.getState().addNotification({
          id: `obs-cmd-${Date.now()}`,
          level: "toast",
          severity: "error",
          message: result.error,
        });
      }
    },
    [sendCommand],
  );

  const handleStartStream = useCallback((): void => {
    if (!hasMetadata) {
      setShowManifestModal(true);
      return;
    }
    setShowStartConfirm(true);
  }, [hasMetadata]);

  const confirmStartStream = useCallback((): void => {
    setShowStartConfirm(false);
    void runCommand("startStream");
  }, [runCommand]);

  const handleStopStream = useCallback((): void => {
    setShowStopStreamConfirm(true);
  }, []);

  const confirmStopStream = useCallback((): void => {
    setShowStopStreamConfirm(false);
    void runCommand("stopStream");
  }, [runCommand]);

  const handleStartRecording = useCallback((): void => {
    void runCommand("startRecording");
  }, [runCommand]);

  const handleStopRecording = useCallback((): void => {
    setShowStopRecordConfirm(true);
  }, []);

  const confirmStopRecording = useCallback((): void => {
    setShowStopRecordConfirm(false);
    void runCommand("stopRecording");
  }, [runCommand]);

  const handleReconnect = useCallback((): void => {
    setReconnecting(true);
    setTimeout(() => setReconnecting(false), 3000);
  }, []);

  return (
    <WidgetContainer title="OBS" connections={[{ label: "OBS", healthy: obsState.connected }]}>
      <div data-testid="obs-widget" className="layout-column full-height">
        <ObsStatusBar obsState={obsState} />
        <ObsMetadataPreview interpolatedStreamTitle={interpolatedStreamTitle} onEditDetails={() => setShowManifestModal(true)} />
        <WidgetErrorOverlay
          isVisible={!obsState.connected}
          message="OBS Disconnected"
          actionLabel="Tap to Retry"
          onAction={handleReconnect}
          isPending={reconnecting}
          display="flex-column"
        >
          <ObsControls
            obsState={obsState}
            isPending={isPending}
            onStartStream={handleStartStream}
            onStopStream={handleStopStream}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            {...(streamDisabledReason ? { streamDisabledReason } : {})}
          />
        </WidgetErrorOverlay>
      </div>

      <SessionManifestModal isOpen={showManifestModal} onClose={() => setShowManifestModal(false)} />

      <ConfirmationModal
        isOpen={showStartConfirm}
        title="Begin Stream"
        body={
          <div>
            <p className="text-muted margin-bottom-narrow">Stream title</p>
            <div className="stream-confirm-preview">{interpolatedStreamTitle}</div>
          </div>
        }
        confirmLabel="Start Stream"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={confirmStartStream}
        onCancel={() => setShowStartConfirm(false)}
      />

      <ConfirmationModal
        isOpen={showStopStreamConfirm}
        title="Are you sure you want to stop the stream?"
        confirmLabel="Stop Streaming"
        cancelLabel="Continue Streaming"
        confirmVariant="danger"
        onConfirm={confirmStopStream}
        onCancel={() => setShowStopStreamConfirm(false)}
      />

      <ConfirmationModal
        isOpen={showStopRecordConfirm}
        title="Are you sure you want to stop recording?"
        confirmLabel="Stop Recording"
        cancelLabel="Keep Recording"
        confirmVariant="danger"
        onConfirm={confirmStopRecording}
        onCancel={() => setShowStopRecordConfirm(false)}
      />
    </WidgetContainer>
  );
}
