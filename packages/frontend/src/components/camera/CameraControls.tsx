import type { ReactNode, RefObject } from "react";
import { IonRange, IonToggle, IonIcon } from "@ionic/react";
import { searchOutline } from "ionicons/icons";
import { PtzJoystick } from "./PtzJoystick";
import type { CameraFeature, CameraPreset } from "@invisible-av-booth/shared";

export interface CameraControlsProps {
  /** Ref to the video element for preview */
  videoRef: RefObject<HTMLVideoElement | null>;
  /** Preview connection status */
  previewStatus: string;
  /** Whether the camera is connected */
  connected: boolean;
  /** Enabled features for this camera */
  features: CameraFeature[];
  /** Whether AI tracking metadata is configured (model !== generic) */
  aiConfigured: boolean;
  /** Whether user has permission for power-user controls (focus, AI) */
  isAdmin: boolean;
  /** Current state values */
  zoom: number;
  zoomMin: number;
  zoomMax: number;
  focus: number;
  autoFocus: boolean;
  aiTracking: boolean;
  aiTilt: boolean;
  aiZoom: boolean;
  /** Presets to display */
  presets: CameraPreset[];
  activePresetId: string | null;
  /** Handlers */
  onZoomChange: (value: number) => void;
  onFocusChange: (value: number) => void;
  onAutoFocusChange: (checked: boolean) => void;
  onAiTrackingChange: (checked: boolean) => void;
  onAiTiltChange: (checked: boolean) => void;
  onAiZoomChange: (checked: boolean) => void;
  onJoystickStart: (pan: number, tilt: number) => void;
  onJoystickMove: (pan: number, tilt: number) => void;
  onJoystickStop: () => void;
  onPresetActivate: (presetId: string) => void;
}

function hasFeature(features: CameraFeature[], f: CameraFeature): boolean {
  return features.includes(f);
}

export function CameraControls({
  videoRef,
  previewStatus,
  connected,
  features,
  aiConfigured,
  isAdmin,
  zoom,
  zoomMin,
  zoomMax,
  focus,
  autoFocus,
  aiTracking,
  aiTilt,
  aiZoom,
  presets,
  activePresetId,
  onZoomChange,
  onFocusChange,
  onAutoFocusChange,
  onAiTrackingChange,
  onAiTiltChange,
  onAiZoomChange,
  onJoystickStart,
  onJoystickMove,
  onJoystickStop,
  onPresetActivate,
}: CameraControlsProps): ReactNode {
  const hasPan = hasFeature(features, "pan");
  const hasTilt = hasFeature(features, "tilt");
  const hasZoom = hasFeature(features, "zoom");
  const hasFocus = hasFeature(features, "focus");
  const hasAiTracking = aiConfigured && hasFeature(features, "ai-tracking");
  const showJoystick = hasPan || hasTilt;

  return (
    <div className="camera-controls-layout" data-testid="camera-controls">
      {/* Row 1: Video + Zoom slider + Joystick */}
      <div className="camera-controls-top">
        {/* Video Preview */}
        <div className="camera-controls-video">
          <div className="preview-video-container" data-testid="camera-preview">
            <video ref={videoRef} className="preview-video" autoPlay playsInline muted style={previewStatus !== "streaming" ? { display: "none" } : undefined} />
            {!connected && (
              <div className="preview-overlay" data-testid="camera-offline-overlay">
                <p className="margin-none text-muted">Camera Offline</p>
              </div>
            )}
            {connected && previewStatus !== "streaming" && (
              <div className="preview-overlay" data-testid="camera-connecting-overlay">
                <p className="margin-none text-muted">{previewStatus === "connecting" ? "Connecting…" : "No preview"}</p>
              </div>
            )}
          </div>
        </div>

        {/* Zoom slider (vertical) — between video and joystick */}
        {hasZoom && (
          <div className="camera-controls-zoom" data-testid="camera-zoom-slider">
            <div className="camera-zoom-wrapper">
              <IonRange min={zoomMin} max={zoomMax} step={0.01} value={zoom} onIonChange={(e) => onZoomChange(e.detail.value as number)}>
                <IonIcon slot="end" icon={searchOutline} className="camera-zoom-icon" />
              </IonRange>
            </div>
          </div>
        )}

        {/* Joystick + Presets column */}
        {(showJoystick || presets.length > 0) && (
          <div className="camera-controls-right">
            {showJoystick && (
              <PtzJoystick
                onStart={onJoystickStart}
                onMove={onJoystickMove}
                onStop={onJoystickStop}
                disabled={{ pan: !hasPan, tilt: !hasTilt }}
              />
            )}

            {/* Presets */}
            {presets.length > 0 && (
              <div className="camera-controls-presets">
                <label className="text-muted text-secondary" style={{ fontSize: "0.75rem", marginBottom: "0.25rem" }}>Presets</label>
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`camera-preset-btn ${p.id === activePresetId ? "camera-preset-active" : ""}`}
                    onClick={() => onPresetActivate(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Row 2: Focus bar (width of video) */}
      {isAdmin && hasFocus && (
        <div className="camera-controls-focus" data-testid="camera-focus-slider">
          <label className="text-muted text-secondary" style={{ fontSize: "0.75rem" }}>Focus</label>
          <IonRange
            min={0}
            max={1}
            step={0.01}
            value={focus}
            disabled={autoFocus}
            onIonChange={(e) => onFocusChange(e.detail.value as number)}
            className="camera-focus-range"
          />
        </div>
      )}

      {/* Row 3-4: Toggles (two-column grid) */}
      {isAdmin && (hasFocus || hasAiTracking) && (
        <div className="camera-controls-toggles" data-testid="camera-toggle-row">
          {hasFocus && (
            <label className="camera-toggle-item">
              <IonToggle checked={autoFocus} onIonChange={(e) => onAutoFocusChange(e.detail.checked)} />
              Auto Focus
            </label>
          )}
          {hasAiTracking && (
            <label className="camera-toggle-item">
              <IonToggle checked={aiTracking} onIonChange={(e) => onAiTrackingChange(e.detail.checked)} />
              AI Tracking
            </label>
          )}
          {hasAiTracking && aiTracking && (
            <label className="camera-toggle-item">
              <IonToggle checked={aiZoom} onIonChange={(e) => onAiZoomChange(e.detail.checked)} />
              AI Zooming
            </label>
          )}
          {hasAiTracking && aiTracking && (
            <label className="camera-toggle-item">
              <IonToggle checked={aiTilt} onIonChange={(e) => onAiTiltChange(e.detail.checked)} />
              AI Tilting
            </label>
          )}
        </div>
      )}
    </div>
  );
}
