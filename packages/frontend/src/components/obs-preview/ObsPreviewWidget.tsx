import { useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { WidgetContainer } from "../WidgetContainer";
import type { ConnectionStatus } from "../WidgetContainer";
import { MuteButton } from "./MuteButton";
import { AudioLevelMeter } from "./AudioLevelMeter";
import { useObsPreviewStream } from "../../hooks/useObsPreviewStream";
import { useStore } from "../../store";
import { TEST_ID_OBS_PREVIEW_WIDGET, TEST_ID_OBS_PREVIEW_VIDEO, TEST_ID_OBS_PREVIEW_INACTIVE, TEST_ID_OBS_PREVIEW_RECONNECTING } from "../../constants/testIds";

const AUDIO_STALENESS_MS = 500;

interface ObsPreviewWidgetProps {
  enabled?: boolean;
  ndiConfigured?: boolean;
}

function deriveFeedConnection(status: string, ndiConfigured: boolean): ConnectionStatus {
  if (!ndiConfigured) return { label: "Feed", status: "inactive" };
  if (status === "streaming") return { label: "Feed", status: "healthy" };
  return { label: "Feed", status: "unhealthy" };
}

function deriveAudioConnection(levelPipelineAvailable: boolean, audioEventsFlowing: boolean): ConnectionStatus {
  if (!levelPipelineAvailable) return { label: "Audio", status: "inactive" };
  if (audioEventsFlowing) return { label: "Audio", status: "healthy" };
  return { label: "Audio", status: "unhealthy" };
}

export function ObsPreviewWidget({ enabled = true, ndiConfigured = false }: ObsPreviewWidgetProps): ReactNode {
  const { status, imgRef, reconnect, muted, setMuted } = useObsPreviewStream("/preview/obs", enabled && ndiConfigured);
  const setObsPreviewStatus = useStore((s) => s.setObsPreviewStatus);

  // Audio level state
  const obsAudioLevels = useStore((s) => s.obsAudioLevels);
  const obsAudioEventsFlowing = useStore((s) => s.obsAudioEventsFlowing);
  const obsLevelPipelineAvailable = useStore((s) => s.obsLevelPipelineAvailable);
  const setObsAudioEventsFlowing = useStore((s) => s.setObsAudioEventsFlowing);

  // Staleness timeout: 500ms with no level event → set obsAudioEventsFlowing to false
  const stalenessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (obsAudioLevels === null) return; // No events received yet

    // Reset staleness timer on each level update
    if (stalenessTimer.current) clearTimeout(stalenessTimer.current);
    stalenessTimer.current = setTimeout(() => {
      setObsAudioEventsFlowing(false);
    }, AUDIO_STALENESS_MS);

    return () => {
      if (stalenessTimer.current) clearTimeout(stalenessTimer.current);
    };
  }, [obsAudioLevels, setObsAudioEventsFlowing]);

  useEffect(() => {
    const mapped =
      status === "streaming" ? "streaming" : status === "connecting" || status === "reconnecting" ? "connecting" : status === "error" ? "error" : "inactive";
    setObsPreviewStatus(mapped);
  }, [status, setObsPreviewStatus]);

  const toggleMute = useCallback(() => {
    setMuted(!muted);
  }, [muted, setMuted]);

  const feedConnection = deriveFeedConnection(status, ndiConfigured);
  const audioConnection = deriveAudioConnection(obsLevelPipelineAvailable, obsAudioEventsFlowing);
  const connections: ConnectionStatus[] = [feedConnection, audioConnection];

  // Meters visible once the first level event has been received (obsAudioLevels !== null)
  const showMeters = obsAudioLevels !== null;

  return (
    <div data-testid={TEST_ID_OBS_PREVIEW_WIDGET} className="full-height">
      <WidgetContainer title="OBS Preview" connections={connections}>
        <div className="preview-video-container">
          <div className="preview-video-area">
            <img
              data-testid={TEST_ID_OBS_PREVIEW_VIDEO}
              ref={imgRef}
              className="preview-video"
              alt="OBS preview"
              style={status !== "streaming" ? { display: "none" } : undefined}
            />

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

          {showMeters && <AudioLevelMeter levels={obsAudioLevels} eventsFlowing={obsAudioEventsFlowing} />}
        </div>
      </WidgetContainer>
    </div>
  );
}
