import { useState, useCallback } from "react";
import type { ReactNode } from "react";
import { WidgetContainer } from "../WidgetContainer";
import { WidgetErrorOverlay } from "../WidgetErrorOverlay";
import { ConfirmationModal } from "../ConfirmationModal";
import { SessionManifestModal } from "../SessionManifestModal";
import { ManageStreamsModal } from "./ManageStreamsModal";
import { ObsStatusBar } from "./ObsStatusBar";
import { ObsMetadataPreview } from "./ObsMetadataPreview";
import { ObsControls } from "./ObsControls";
import { useObsState } from "../../hooks/useObsState";
import { useSocket } from "../../providers/SocketProvider";
import { CTS_OBS_RECONNECT } from "@invisible-av-booth/shared";
import { logger } from "../../logger";
import { TEST_ID_OBS_WIDGET } from "../../constants/testIds";
import { useStore } from "../../store";

export function ObsWidget(): ReactNode {
  const { state: obsState, isPending, sendCommand } = useObsState();
  const interpolatedStreamTitle = useStore((s) => s.interpolatedStreamTitle);
  const manifest = useStore((s) => s.manifest);
  const socket = useSocket();

  const [showManifestModal, setShowManifestModal] = useState(false);
  const [showManageStreams, setShowManageStreams] = useState(false);
  const [showStopRecordConfirm, setShowStopRecordConfirm] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);

  const manifestReady = !!(manifest.speaker || manifest.title);

  const runCommand = useCallback(
    async (type: "startRecording" | "stopRecording"): Promise<void> => {
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
    logger.info("OBS reconnect requested by user");
    setReconnecting(true);
    socket?.emit(CTS_OBS_RECONNECT);
    setTimeout(() => setReconnecting(false), 3000);
  }, [socket]);

  return (
    <WidgetContainer title="OBS" connections={[{ label: "OBS", status: obsState.connected ? "healthy" : "unhealthy" }]}>
      <div data-testid={TEST_ID_OBS_WIDGET} className="layout-column full-height">
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
            manifestReady={manifestReady}
            onManageStreams={() => setShowManageStreams(true)}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
          />
        </WidgetErrorOverlay>
      </div>

      <SessionManifestModal isOpen={showManifestModal} onClose={() => setShowManifestModal(false)} />
      <ManageStreamsModal isOpen={showManageStreams} onClose={() => setShowManageStreams(false)} />

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
