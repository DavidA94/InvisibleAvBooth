import { useState, useCallback, useRef, useEffect } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import { darkSelectStyles } from "../../theme/selectStyles";
import { WidgetContainer } from "../WidgetContainer";
import type { ConnectionStatus } from "../WidgetContainer";
import { CameraControls } from "./CameraControls";
import { useMjpegStream } from "../../hooks/useMjpegStream";
import { usePtzMove } from "../../hooks/usePtzMove";
import { useDoubleTapToCenter } from "../../hooks/useDoubleTapToCenter";
import { useStore } from "../../store";
import { useSocket } from "../../providers/SocketProvider";
import { useResizeObserver } from "../../hooks/useResizeObserver";
import { CTS_CAMERA_SET, CTS_CAMERA_PRESET_ACTIVATE } from "@invisible-av-booth/shared";
import type { CameraState, CameraFeature } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";

const COMPACT_WIDTH_THRESHOLD = 480;
const VISCA_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom", "focus"];

interface CameraWidgetProps {
  enabled?: boolean;
  /** Force selection of a specific camera (used in modal/preset context) */
  forceSelectedId?: string;
}

function hasViscaFeatures(features: CameraFeature[]): boolean {
  return features.some((f) => VISCA_FEATURES.includes(f));
}

function deriveConnections(state: CameraState | null): ConnectionStatus[] {
  const connections: ConnectionStatus[] = [];

  // Camera (NDI preview) — always present
  if (!state) {
    connections.push({ label: "Camera", status: "inactive" });
  } else if (state.connected) {
    connections.push({ label: "Camera", status: "healthy" });
  } else {
    connections.push({ label: "Camera", status: "unhealthy" });
  }

  // Controls (VISCA) — only present if camera has VISCA-using features
  if (state && hasViscaFeatures(state.features)) {
    connections.push({
      label: "Controls",
      status: state.viscaConnected ? "healthy" : "unhealthy",
    });
  }

  return connections;
}

export function CameraWidget({ enabled = true, forceSelectedId }: CameraWidgetProps): ReactNode {
  const cameraStates = useStore((s) => s.cameraStates);
  const user = useStore((s) => s.user);
  const socket = useSocket();
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useResizeObserver(containerRef);

  const cameras = Object.values(cameraStates);
  const [selectedId, setSelectedId] = useState<string>(() => {
    if (forceSelectedId) return forceSelectedId;
    const saved = typeof window !== "undefined" ? localStorage.getItem("camera-widget-selected") : null;
    return saved ?? "";
  });

  useEffect(() => {
    if (forceSelectedId) {
      setSelectedId(forceSelectedId);
    } else if (!selectedId && cameras.length > 0) {
      setSelectedId(cameras[0]!.cameraId);
    }
  }, [cameras, selectedId, forceSelectedId]);

  useEffect(() => {
    if (selectedId) localStorage.setItem("camera-widget-selected", selectedId);
  }, [selectedId]);

  const currentState = selectedId ? (cameraStates[selectedId] ?? null) : null;
  const { imgRef, status } = useMjpegStream(selectedId ? `/preview/camera/${selectedId}` : "", enabled && !!selectedId);
  const { startMove, updateMove, stopMove } = usePtzMove();

  const isCompact = width > 0 && width < COMPACT_WIDTH_THRESHOLD;
  const isAdmin = user?.role === "ADMIN" || user?.role === "AvPowerUser";
  const features = currentState?.features ?? [];
  const aiConfigured = currentState?.features.includes("ai-tracking") ?? false;

  const [modalOpen, setModalOpen] = useState(false);

  const handleDoubleTap = useDoubleTapToCenter({
    cameraId: selectedId,
    cameraState: currentState,
  });

  const handleJoystickStart = useCallback(
    (pan: number, tilt: number) => {
      if (selectedId) startMove(selectedId, pan, tilt);
    },
    [selectedId, startMove],
  );
  const handleJoystickMove = useCallback(
    (pan: number, tilt: number) => {
      if (selectedId) updateMove(pan, tilt);
    },
    [selectedId, updateMove],
  );
  const handleJoystickStop = useCallback(() => {
    stopMove();
  }, [stopMove]);

  const handleZoomChange = useCallback(
    (zoom: number) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, zoom });
    },
    [socket, selectedId],
  );
  const handleFocusChange = useCallback(
    (focus: number) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, focus });
    },
    [socket, selectedId],
  );
  const handleToggle = useCallback(
    (field: string, value: boolean) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_SET, { cameraId: selectedId, [field]: value });
    },
    [socket, selectedId],
  );
  const handlePresetActivate = useCallback(
    (presetId: string) => {
      if (socket && selectedId) socket.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId: selectedId, presetId });
    },
    [socket, selectedId],
  );

  const connections = deriveConnections(currentState);
  const cameraOptions = cameras.map((c) => ({ value: c.cameraId, label: c.label }));
  const selectedOption = cameraOptions.find((o) => o.value === selectedId) ?? null;

  const controlProps = {
    imgRef,
    previewStatus: status,
    connected: currentState?.connected ?? false,
    features,
    aiConfigured,
    isAdmin,
    zoom: currentState?.position?.zoom ?? 0,
    zoomMin: currentState?.zoomMin ?? 0,
    zoomMax: currentState?.zoomMax ?? 16384,
    focus: currentState?.position?.focus ?? 0,
    focusMin: 0,
    focusMax: 16384,
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
    onVideoTap: handleDoubleTap,
    cameraSelector: (
      <div className="camera-select-wrapper">
        <Select
          data-testid="camera-select"
          options={cameraOptions}
          value={selectedOption}
          onChange={(opt) => opt && setSelectedId((opt as { value: string }).value)}
          isDisabled={cameras.length <= 1}
          isSearchable={false}
          styles={darkSelectStyles()}
          placeholder="Select Camera"
          menuPortalTarget={document.body}
        />
      </div>
    ),
  };

  return (
    <div data-testid="camera-widget" ref={containerRef} className="full-height">
      <WidgetContainer title="Camera" connections={connections}>
        {isCompact ? (
          <div className="preview-video-container" data-testid="camera-preview" onClick={() => setModalOpen(true)}>
            <img ref={imgRef} className="preview-video" alt="Camera preview" style={status !== "streaming" ? { display: "none" } : undefined} />
            {currentState && !currentState.connected && (
              <div className="preview-overlay" data-testid="camera-offline-overlay">
                Camera Offline
              </div>
            )}
            {status !== "streaming" && currentState?.connected && (
              <div className="preview-overlay" data-testid="camera-connecting-overlay">
                Connecting…
              </div>
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
