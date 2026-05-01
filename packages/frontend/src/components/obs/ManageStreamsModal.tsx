import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { Modal } from "../Modal";
import { ConfirmationModal } from "../ConfirmationModal";
import { usePlatformState } from "../../hooks/usePlatformState";
import { TEST_ID_MANAGE_STREAMS_MODAL, TEST_ID_PLATFORM_START_ALL, TEST_ID_PLATFORM_STOP_ALL, TEST_ID_PLATFORM_ROW } from "../../constants/testIds";
import type { PlatformStreamState } from "../../store/platformSlice";

interface ManageStreamsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<PlatformStreamState, string> = {
  idle: "var(--color-text-muted)",
  starting: "var(--color-warning)",
  streaming: "var(--color-success)",
  stopping: "var(--color-warning)",
  error: "var(--color-danger)",
  no_source: "var(--color-text-muted)",
  recovering: "var(--color-warning)",
};

export function ManageStreamsModal({ isOpen, onClose }: ManageStreamsModalProps): ReactNode {
  const { platformStates, isAnyStarting, isAnyStreaming, sendCommand } = usePlatformState();
  const platforms = [...platformStates.entries()];
  const empty = platforms.length === 0;
  const [confirmAction, setConfirmAction] = useState<"startAll" | "stopAll" | null>(null);

  const footer = empty ? (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <IonButton fill="outline" onClick={onClose}>Close</IonButton>
    </div>
  ) : (
    <div style={{ display: "flex", gap: "0.75rem" }}>
      <IonButton
        data-testid={TEST_ID_PLATFORM_START_ALL}
        expand="block"
        disabled={isAnyStarting || isAnyStreaming}
        onClick={() => setConfirmAction("startAll")}
        style={{ flex: 1 }}
      >
        Start All
      </IonButton>
      <IonButton
        data-testid={TEST_ID_PLATFORM_STOP_ALL}
        expand="block"
        color="danger"
        disabled={!isAnyStreaming}
        onClick={() => setConfirmAction("stopAll")}
        style={{ flex: 1 }}
      >
        Stop All
      </IonButton>
    </div>
  );

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} header="Manage Streams" footer={footer}>
      <div data-testid={TEST_ID_MANAGE_STREAMS_MODAL}>
        {empty ? (
          <div style={{ textAlign: "center" }}>
            <p className="text-muted">No streaming platforms configured.</p>
            <p className="text-muted" style={{ fontSize: "0.85rem" }}>Add platforms in Admin Pages → YouTube / Facebook.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {platforms.map(([name, platform]) => (
              <div key={name} data-testid={TEST_ID_PLATFORM_ROW} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0" }}>
                <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: STATUS_COLORS[platform.state], flexShrink: 0 }} />
                <span style={{ flex: 1 }}>{name}</span>
                <span className="text-muted" style={{ fontSize: "0.75rem" }}>{platform.state}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>

    <ConfirmationModal
      isOpen={confirmAction === "startAll"}
      title="Start All Streams"
      body="This will start streaming on all configured platforms."
      confirmLabel="Start All"
      cancelLabel="Cancel"
      confirmVariant="primary"
      onConfirm={() => { setConfirmAction(null); sendCommand({ action: "startAll" }); }}
      onCancel={() => setConfirmAction(null)}
    />
    <ConfirmationModal
      isOpen={confirmAction === "stopAll"}
      title="Stop All Streams"
      body="This will stop streaming on all platforms."
      confirmLabel="Stop All"
      cancelLabel="Cancel"
      confirmVariant="danger"
      onConfirm={() => { setConfirmAction(null); sendCommand({ action: "stopAll" }); }}
      onCancel={() => setConfirmAction(null)}
    />
    </>
  );
}
