import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import { WidgetContainer } from "../WidgetContainer";
import type { ConnectionStatus } from "../WidgetContainer";
import { CameraControls } from "./CameraControls";
import { usePreviewStream } from "../../hooks/usePreviewStream";
import { usePtzMove } from "../../hooks/usePtzMove";
import { useStore } from "../../store";
import { useSocket } from "../../providers/SocketProvider";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import { CTS_CAMERA_SET, CTS_CAMERA_PRESET_ACTIVATE } from "@invisible-av-booth/shared";
import type { CameraState } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";

const COMPACT_WIDTH_THRESHOLD = 480;

interface CameraWidgetProps {
  enabled?: boolean;
}

function deriveConnection(state: CameraState | null): ConnectionStatus {
  if (!state) return { label: "Camera", status: "inactive" };
  if (state.connected) return { label: "Camera", status: "healthy" };
  return { label: "Camera", status: "unhealthy" };
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
  const aiConfigured = currentState?.features.includes("ai-tracking") ?? false;

  const [modalOpen, setModalOpen] = useState(false);

  const handleJoystickStart = useCallback(
    (pan: number, tilt: number) => { if (selectedId) startMove(selectedId, pan, tilt); },
    [selectedId, startMove],
  );
  const handleJoystickMove = useCallback(
    (pan: number, tilt: number) => { if (selectedId) updateMove(pan, tilt); },
    [selectedId, updateMove],
  );
  const handleJoystickStop = useCallback(() => { stopMove(); }, [stopMove]);

  const handleZoomChange = useCallback(
    (zoom: number) => { if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, zoom }); },
    [socket, selectedId],
  );
  const handleFocusChange = useCallback(
    (focus: number) => { if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, focus }); },
    [socket, selectedId],
  );
  const handleToggle = useCallback(
    (field: string, value: boolean) => { if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, [field]: value }); },
    [socket, selectedId],
  );
  const handlePresetActivate = useCallback(
    (presetId: string) => { if (socket && selectedId) socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: selectedId, presetId }); },
    [socket, selectedId],
  );

  const connection = deriveConnection(currentState);
  const cameraOptions = cameras.map((c) => ({ value: c.cameraId, label: c.cameraId }));
  const selectedOption = cameraOptions.find((o) => o.value === selectedId) ?? null;

  const controlProps = {
    videoRef,
    previewStatus: status,
    connected: currentState?.connected ?? false,
    features,
    aiConfigured,
    isAdmin,
    zoom: currentState?.position?.zoom ?? 0,
    zoomMin: currentState?.zoomMin ?? 0,
    zoomMax: currentState?.zoomMax ?? 1,
    focus: currentState?.position?.focus ?? 0.5,
    autoFocus: currentState?.autoFocus ?? true,
    aiTracking: currentState?.aiTracking ?? false,
    aiTilt: currentState?.aiTilt ?? false,
    aiZoom: currentState?.aiZoom ?? false,
    presets: currentState?.presets ?? [],
    activePresetId: currentState?.activePresetId ?? null,
    onZoomChange: handleZoomChange,
    onFocusChange: handleFocusChange,
    onAutoFocusChange: (v: boolean) => handleToggle("autoFocus", v),
    onAiTrackingChange: (v: boolean) => handleToggle("aiTracking", v),
    onAiTiltChange: (v: boolean) => handleToggle("aiTilt", v),
    onAiZoomChange: (v: boolean) => handleToggle("aiZoom", v),
    onJoystickStart: handleJoystickStart,
    onJoystickMove: handleJoystickMove,
    onJoystickStop: handleJoystickStop,
    onPresetActivate: handlePresetActivate,
  };

  return (
    <div data-testid="camera-widget" ref={containerRef} className="full-height">
      <WidgetContainer title="Camera" connections={[connection]}>
        {cameras.length > 1 && (
          <Select
            data-testid="camera-select"
            options={cameraOptions}
            value={selectedOption}
            onChange={(opt) => opt && setSelectedId((opt as { value: string }).value)}
            isDisabled={cameras.length <= 1}
            placeholder="Select Camera"
          />
        )}

        {isCompact ? (
          <div className="preview-video-container" data-testid="camera-preview" onClick={() => setModalOpen(true)}>
            <video ref={videoRef} className="preview-video" autoPlay playsInline muted style={status !== "streaming" ? { display: "none" } : undefined} />
            {currentState && !currentState.connected && (
              <div className="preview-overlay" data-testid="camera-offline-overlay">Camera Offline</div>
            )}
            {status !== "streaming" && currentState?.connected && (
              <div className="preview-overlay" data-testid="camera-connecting-overlay">Connecting…</div>
            )}
          </div>
        ) : (
          <CameraControls {...controlProps} />
        )}
      </WidgetContainer>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} size="large" header="Camera Control">
        <CameraControls {...controlProps} />
      </Modal>
    </div>
  );
}
