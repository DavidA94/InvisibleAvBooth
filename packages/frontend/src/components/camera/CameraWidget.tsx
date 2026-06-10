import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import { IonToggle, IonRange } from "@ionic/react";
import { WidgetContainer } from "../WidgetContainer";
import type { ConnectionStatus } from "../WidgetContainer";
import { PtzJoystick } from "./PtzJoystick";
import { usePreviewStream } from "../../hooks/usePreviewStream";
import { usePtzMove } from "../../hooks/usePtzMove";
import { useStore } from "../../store";
import { useSocket } from "../../providers/SocketProvider";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import { CTS_CAMERA_SET } from "@invisible-av-booth/shared";
import type { CameraState, CameraFeature } from "@invisible-av-booth/shared";

const COMPACT_WIDTH_THRESHOLD = 480;

interface CameraWidgetProps {
  enabled?: boolean;
}

function deriveConnection(state: CameraState | null): ConnectionStatus {
  if (!state) return { label: "Camera", status: "inactive" };
  if (state.connected) return { label: "Camera", status: "healthy" };
  return { label: "Camera", status: "unhealthy" };
}

function hasFeature(features: CameraFeature[], f: CameraFeature): boolean {
  return features.includes(f);
}

export function CameraWidget({ enabled = true }: CameraWidgetProps): ReactNode {
  const cameraStates = useStore((s) => s.cameraStates);
  const user = useStore((s) => s.user);
  const socket = useSocket();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useResizeObserver(containerRef);

  const cameras = Object.values(cameraStates);
  const [selectedId, setSelectedId] = useState<string>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("camera-widget-selected") : null;
    return saved ?? "";
  });

  useEffect(() => {
    if (!selectedId && cameras.length > 0) {
      setSelectedId(cameras[0]!.cameraId);
    }
  }, [cameras, selectedId]);

  useEffect(() => {
    if (selectedId) localStorage.setItem("camera-widget-selected", selectedId);
  }, [selectedId]);

  const currentState = selectedId ? (cameraStates[selectedId] ?? null) : null;
  const { videoRef, status } = usePreviewStream(selectedId ? `/preview/camera/${selectedId}` : "", enabled && !!selectedId);
  const { startMove, updateMove, stopMove } = usePtzMove();

  const isCompact = width > 0 && width < COMPACT_WIDTH_THRESHOLD;
  const isAdmin = user?.role === "ADMIN" || user?.role === "AvPowerUser";
  const features = currentState?.features ?? [];

  const [modalOpen, setModalOpen] = useState(false);

  const handleJoystickStart = useCallback(
    (pan: number, tilt: number) => {
      if (selectedId) startMove(selectedId, pan, tilt);
    },
    [selectedId, startMove],
  );

  const handleZoomChange = useCallback(
    (zoom: number) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, zoom });
    },
    [socket, selectedId],
  );

  const handleToggle = useCallback(
    (field: string, value: boolean) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, [field]: value });
    },
    [socket, selectedId],
  );

  const handleFocusChange = useCallback(
    (focus: number) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, focus });
    },
    [socket, selectedId],
  );

  const connection = deriveConnection(currentState);
  const cameraOptions = cameras.map((c) => ({ value: c.cameraId, label: c.cameraId }));
  const selectedOption = cameraOptions.find((o) => o.value === selectedId) ?? null;

  return (
    <div data-testid="camera-widget" ref={containerRef}>
      <WidgetContainer title="Camera" connections={[connection]}>
        {/* Camera selector */}
        {cameras.length > 1 && (
          <Select
            data-testid="camera-select"
            options={cameraOptions}
            value={selectedOption}
            onChange={(opt) => opt && setSelectedId(opt.value)}
            isDisabled={cameras.length <= 1}
            placeholder="Select Camera"
          />
        )}

        {/* Video preview */}
        <div className="preview-video-container" data-testid="camera-preview" onClick={() => isCompact && setModalOpen(true)}>
          <video ref={videoRef} className="preview-video" autoPlay playsInline muted />
          {currentState && !currentState.connected && (
            <div className="preview-overlay" data-testid="camera-offline-overlay">
              Camera Offline
            </div>
          )}
          {status === "connecting" && (
            <div className="preview-overlay" data-testid="camera-connecting-overlay">
              Connecting…
            </div>
          )}
        </div>

        {/* Controls — expanded mode only */}
        {!isCompact && (
          <div className="camera-controls" data-testid="camera-controls">
            {/* Joystick */}
            {(hasFeature(features, "pan") || hasFeature(features, "tilt")) && (
              <PtzJoystick
                onStart={handleJoystickStart}
                onMove={updateMove}
                onStop={stopMove}
                disabled={{ pan: !hasFeature(features, "pan"), tilt: !hasFeature(features, "tilt") }}
              />
            )}

            {/* Zoom slider */}
            {hasFeature(features, "zoom") && (
              <div data-testid="camera-zoom-slider">
                <IonRange
                  min={0}
                  max={1}
                  step={0.01}
                  value={currentState?.position?.zoom ?? 0}
                  onIonChange={(e) => handleZoomChange(e.detail.value as number)}
                />
              </div>
            )}

            {/* AI Toggles — hidden for AvVolunteer */}
            {isAdmin && hasFeature(features, "ai-tracking") && (
              <div data-testid="camera-toggle-row">
                <IonToggle checked={currentState?.aiTracking ?? false} onIonChange={(e) => handleToggle("aiTracking", e.detail.checked)}>
                  AI Tracking
                </IonToggle>
                {currentState?.aiTracking && (
                  <>
                    <IonToggle checked={currentState?.aiTilt ?? false} onIonChange={(e) => handleToggle("aiTilt", e.detail.checked)}>
                      AI Tilt
                    </IonToggle>
                    <IonToggle checked={currentState?.aiZoom ?? false} onIonChange={(e) => handleToggle("aiZoom", e.detail.checked)}>
                      AI Zoom
                    </IonToggle>
                  </>
                )}
              </div>
            )}

            {/* Focus slider */}
            {isAdmin && hasFeature(features, "focus") && (
              <div data-testid="camera-focus-slider">
                <IonToggle checked={currentState?.autoFocus ?? true} onIonChange={(e) => handleToggle("autoFocus", e.detail.checked)}>
                  Auto Focus
                </IonToggle>
                <IonRange
                  min={0}
                  max={1}
                  step={0.01}
                  disabled={currentState?.autoFocus ?? true}
                  value={currentState?.position?.focus ?? 0.5}
                  onIonChange={(e) => handleFocusChange(e.detail.value as number)}
                />
              </div>
            )}
          </div>
        )}
      </WidgetContainer>

      {/* Modal for compact mode */}
      {modalOpen && (
        <div data-testid="camera-control-modal" className="preview-modal-backdrop" onClick={() => setModalOpen(false)}>
          <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setModalOpen(false)} type="button">
              Close
            </button>
            <div className="preview-video-container">
              <video ref={videoRef} className="preview-video" autoPlay playsInline muted />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
