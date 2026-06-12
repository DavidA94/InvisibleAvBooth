import { useState, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { WidgetContainer } from "../WidgetContainer";
import type { ConnectionStatus } from "../WidgetContainer";
import { MuteButton } from "./MuteButton";
import { StreamPreviewModal } from "./StreamPreviewModal";
import { usePreviewStream } from "../../hooks/usePreviewStream";
import { useStore } from "../../store";
import { TEST_ID_OBS_PREVIEW_WIDGET, TEST_ID_OBS_PREVIEW_VIDEO, TEST_ID_OBS_PREVIEW_INACTIVE, TEST_ID_OBS_PREVIEW_RECONNECTING } from "../../constants/testIds";

interface ObsPreviewWidgetProps {
  enabled?: boolean;
  ndiConfigured?: boolean;
}

function deriveConnectionStatus(status: string, ndiConfigured: boolean): ConnectionStatus {
  if (!ndiConfigured) return { label: "Feed", status: "inactive" };
  if (status === "streaming") return { label: "Feed", status: "healthy" };
  return { label: "Feed", status: "unhealthy" };
}

export function ObsPreviewWidget({ enabled = true, ndiConfigured = false }: ObsPreviewWidgetProps): ReactNode {
  const { status, videoRef, reconnect } = usePreviewStream("/preview/obs", enabled && ndiConfigured);
  const [muted, setMuted] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const setObsPreviewStatus = useStore((s) => s.setObsPreviewStatus);

  useEffect(() => {
    const mapped =
      status === "streaming" ? "streaming" : status === "connecting" || status === "reconnecting" ? "connecting" : status === "error" ? "error" : "inactive";
    setObsPreviewStatus(mapped);
  }, [status, setObsPreviewStatus]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, [videoRef]);

  const connection = deriveConnectionStatus(status, ndiConfigured);

  return (
    <div data-testid={TEST_ID_OBS_PREVIEW_WIDGET} className="full-height">
      <WidgetContainer title="OBS Preview" connections={[connection]}>
        <div className="preview-video-container" onClick={() => status === "streaming" && setModalOpen(true)}>
          {status === "streaming" && (
            <video data-testid={TEST_ID_OBS_PREVIEW_VIDEO} ref={videoRef} className="preview-video" autoPlay playsInline muted={muted} />
          )}

          {!ndiConfigured && (
            <div data-testid={TEST_ID_OBS_PREVIEW_INACTIVE} className="preview-overlay">
              <div className="error-overlay-content">
                <p className="text-muted margin-none">OBS Preview Not Configured</p>
              </div>
            </div>
          )}

          {ndiConfigured && status === "error" && (
            <div data-testid={TEST_ID_OBS_PREVIEW_INACTIVE} className="preview-overlay preview-overlay-interactive" onClick={reconnect}>
              <div className="error-overlay-content">
                <p className="text-danger text-bold error-overlay-message">OBS Preview Unavailable</p>
                <p className="margin-none">Tap to Reconnect</p>
              </div>
            </div>
          )}

          {status === "reconnecting" && (
            <div data-testid={TEST_ID_OBS_PREVIEW_RECONNECTING} className="preview-overlay">
              <div className="error-overlay-content">
                <p className="margin-none">Reconnecting…</p>
              </div>
            </div>
          )}

          {status === "streaming" && <MuteButton muted={muted} onToggle={toggleMute} />}
        </div>
      </WidgetContainer>

      <StreamPreviewModal open={modalOpen} onDismiss={() => setModalOpen(false)} videoRef={videoRef} muted={muted} onToggleMute={toggleMute} />
    </div>
  );
}
