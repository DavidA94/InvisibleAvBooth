import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton, IonSpinner } from "@ionic/react";
import { Modal } from "../Modal";
import { ConfirmationModal } from "../ConfirmationModal";
import { usePlatformState } from "../../hooks/usePlatformState";
import {
  TEST_ID_MANAGE_STREAMS_MODAL,
  TEST_ID_PLATFORM_START_ALL,
  TEST_ID_PLATFORM_STOP_ALL,
  TEST_ID_PLATFORM_ROW,
  TEST_ID_PLATFORM_START_SINGLE,
  TEST_ID_PLATFORM_STOP_SINGLE,
} from "../../constants/testIds";
import type { PlatformStreamState } from "../../store/platformSlice";

interface ManageStreamsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRETTY_NAMES: Record<string, string> = { youtube: "YouTube", facebook: "Facebook" };

function prettyName(key: string): string {
  return PRETTY_NAMES[key] ?? key;
}

const STATUS_LABELS: Record<PlatformStreamState, string> = {
  idle: "Idle",
  starting: "Starting…",
  streaming: "Streaming",
  stopping: "Stopping…",
  error: "Error",
  no_source: "No Source — waiting for OBS…",
  recovering: "Verifying stream…",
};

const STATUS_DOT_CLASS: Record<PlatformStreamState, string> = {
  idle: "widget-dot-inactive",
  starting: "widget-dot-degraded",
  streaming: "widget-dot-healthy",
  stopping: "widget-dot-inactive",
  error: "widget-dot-unhealthy",
  no_source: "widget-dot-unhealthy",
  recovering: "widget-dot-degraded",
};

const SPINNER_STATES: PlatformStreamState[] = ["starting", "stopping", "recovering"];

export function ManageStreamsModal({ isOpen, onClose }: ManageStreamsModalProps): ReactNode {
  const { platformStates, platformReadiness, isAnyStarting, isAnyStopping, isAnyStreaming, sendCommand } = usePlatformState();
  const platforms = [...platformStates.entries()];
  const empty = platforms.length === 0;
  const [confirmAction, setConfirmAction] = useState<"startAll" | "stopAll" | { type: "start" | "stop"; platformType: string } | null>(null);

  // Build privacy map from readiness data
  const privacyMap = new Map<string, string>();
  for (const p of platformReadiness) {
    if (p.privacy) privacyMap.set(p.platformType, p.privacy);
  }

  const platformLabels = platforms.map(([key]) => prettyName(key)).join(" and ");

  function getStatusLabel(state: PlatformStreamState, error?: string): string {
    if (state === "starting" && error) return error;
    if (state === "error" && error) return error;
    return STATUS_LABELS[state];
  }

  const footer = empty ? (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <IonButton fill="outline" onClick={onClose}>
        Close
      </IonButton>
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
        disabled={!isAnyStreaming || isAnyStopping}
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
              <p className="text-muted" style={{ fontSize: "0.85rem" }}>
                Add platforms in Admin Pages → YouTube / Facebook.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {platforms.map(([key, platform]) => {
                const name = prettyName(key);
                const privacy = privacyMap.get(key);
                const privacyLabel = key === "youtube" && privacy ? ` (${privacy.charAt(0).toUpperCase() + privacy.slice(1)})` : "";
                const showSpinner = SPINNER_STATES.includes(platform.state);
                const actionable = platform.state === "idle" || platform.state === "error" || platform.state === "streaming";

                return (
                  <div
                    key={key}
                    data-testid={TEST_ID_PLATFORM_ROW}
                    className="platform-row"
                    style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.5rem 0", borderBottom: "1px solid var(--color-border)" }}
                  >
                    {/* Status indicator */}
                    {showSpinner ? (
                      <IonSpinner name="crescent" style={{ width: "1rem", height: "1rem", flexShrink: 0 }} />
                    ) : (
                      <span className={STATUS_DOT_CLASS[platform.state]} style={{ fontSize: "0.75rem", flexShrink: 0 }}>
                        ●
                      </span>
                    )}

                    {/* Platform name + privacy */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500 }}>
                        {name}
                        <span className="text-muted">{privacyLabel}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.8rem" }}>
                        {getStatusLabel(platform.state, platform.error)}
                      </div>
                    </div>

                    {/* Action button */}
                    {actionable && (
                      <>
                        {(platform.state === "idle" || platform.state === "error") && (
                          <IonButton
                            data-testid={TEST_ID_PLATFORM_START_SINGLE}
                            size="small"
                            onClick={() => setConfirmAction({ type: "start", platformType: key })}
                          >
                            Start Stream
                          </IonButton>
                        )}
                        {platform.state === "streaming" && (
                          <IonButton
                            data-testid={TEST_ID_PLATFORM_STOP_SINGLE}
                            size="small"
                            color="danger"
                            onClick={() => setConfirmAction({ type: "stop", platformType: key })}
                          >
                            Stop Stream
                          </IonButton>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Start All confirmation */}
      <ConfirmationModal
        isOpen={confirmAction === "startAll"}
        title="Start All Streams"
        body={`Start streaming to ${platformLabels}?`}
        confirmLabel="Go Live"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={() => {
          setConfirmAction(null);
          sendCommand({ type: "startAll" });
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Stop All confirmation */}
      <ConfirmationModal
        isOpen={confirmAction === "stopAll"}
        title="Stop All Streams"
        body="Stop all streams?"
        confirmLabel="Stop All"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmAction(null);
          sendCommand({ type: "stopAll" });
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Individual start confirmation */}
      <ConfirmationModal
        isOpen={typeof confirmAction === "object" && confirmAction?.type === "start"}
        title="Start Stream"
        body={typeof confirmAction === "object" && confirmAction?.type === "start" ? `Start streaming to ${prettyName(confirmAction.platformType)}?` : ""}
        confirmLabel="Go Live"
        cancelLabel="Cancel"
        confirmVariant="primary"
        onConfirm={() => {
          if (typeof confirmAction === "object" && confirmAction?.type === "start") {
            sendCommand({ type: "startPlatform", platformType: confirmAction.platformType });
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />

      {/* Individual stop confirmation */}
      <ConfirmationModal
        isOpen={typeof confirmAction === "object" && confirmAction?.type === "stop"}
        title="Stop Stream"
        body={typeof confirmAction === "object" && confirmAction?.type === "stop" ? `Stop streaming to ${prettyName(confirmAction.platformType)}?` : ""}
        confirmLabel="Stop"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => {
          if (typeof confirmAction === "object" && confirmAction?.type === "stop") {
            sendCommand({ type: "stopPlatform", platformType: confirmAction.platformType });
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </>
  );
}
