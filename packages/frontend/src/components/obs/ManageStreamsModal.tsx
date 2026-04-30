import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { Modal } from "../Modal";
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} header="Manage Streams">
      <div data-testid={TEST_ID_MANAGE_STREAMS_MODAL}>
        {platforms.length === 0 ? (
          <div style={{ textAlign: "center", padding: "1rem 0" }}>
            <p className="text-muted">No streaming platforms configured.</p>
            <p className="text-muted" style={{ fontSize: "0.85rem" }}>Add platforms in Admin Pages → YouTube / Facebook.</p>
            <IonButton fill="outline" onClick={onClose} style={{ marginTop: "0.75rem" }}>
              Close
            </IonButton>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {platforms.map(([name, platform]) => (
                <div key={name} data-testid={TEST_ID_PLATFORM_ROW} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.375rem 0" }}>
                  <span style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", backgroundColor: STATUS_COLORS[platform.state], flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{name}</span>
                  <span className="text-muted" style={{ fontSize: "0.75rem" }}>{platform.state}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem" }}>
              <IonButton
                data-testid={TEST_ID_PLATFORM_START_ALL}
                expand="block"
                disabled={isAnyStarting || isAnyStreaming}
                onClick={() => sendCommand({ action: "startAll" })}
                style={{ flex: 1 }}
              >
                Start All
              </IonButton>
              <IonButton
                data-testid={TEST_ID_PLATFORM_STOP_ALL}
                expand="block"
                color="danger"
                disabled={!isAnyStreaming}
                onClick={() => sendCommand({ action: "stopAll" })}
                style={{ flex: 1 }}
              >
                Stop All
              </IonButton>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
