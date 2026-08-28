import type { ReactNode, RefObject } from "react";
import { IonToggle, IonIcon } from "@ionic/react";
import { searchOutline } from "ionicons/icons";
import { PtzJoystick } from "./PtzJoystick";
import type { CameraFeature, CameraPreset } from "@invisible-av-booth/shared";
import { Slider } from "@mui/material";
import {
  TEST_ID_CAMERA_CONTROLS,
  TEST_ID_CAMERA_PREVIEW,
  TEST_ID_CAMERA_OFFLINE_OVERLAY,
  TEST_ID_CAMERA_CONNECTING_OVERLAY,
  TEST_ID_CAMERA_ZOOM_SLIDER,
  TEST_ID_CAMERA_FOCUS_SLIDER,
  TEST_ID_CAMERA_TOGGLE_ROW,
} from "../../constants/testIds";

export interface CameraControlsProps {
  /** Ref to the img element for MJPEG preview */
  imgRef: RefObject<HTMLImageElement | null>;
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
  focusMin: number;
  focusMax: number;
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
  /** Double-tap-to-center handler for the video preview */
  onVideoTap?: (e: { clientX: number; clientY: number; currentTarget: Element }) => void;
  /** Optional camera selector dropdown rendered at the top of the right column */
  cameraSelector?: ReactNode;
}

function hasFeature(features: CameraFeature[], f: CameraFeature): boolean {
  return features.includes(f);
}

export function CameraControls({
  imgRef,
  previewStatus,
  connected,
  features,
  aiConfigured,
  isAdmin,
  zoom,
  zoomMin,
  zoomMax,
  focus,
  focusMin,
  focusMax,
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
  onVideoTap,
  cameraSelector,
}: CameraControlsProps): ReactNode {
  const hasPan = hasFeature(features, "pan");
  const hasTilt = hasFeature(features, "tilt");
  const hasZoom = hasFeature(features, "zoom");
  const hasFocus = hasFeature(features, "focus");
  const hasAiTracking = aiConfigured && hasFeature(features, "ai-tracking");
  const showJoystick = hasPan || hasTilt;

  return (
    <div className="camera-controls-layout" data-testid={TEST_ID_CAMERA_CONTROLS}>
      {/* Row 1: Video + Zoom slider + Joystick */}
      <div className="camera-controls-top">
        {/* Video Preview */}
        <div className="camera-controls-video">
          <div className="preview-video-container" data-testid={TEST_ID_CAMERA_PREVIEW}>
            <picture className="cross-hairs">
              <img
                ref={imgRef}
                className="preview-video"
                alt="Camera preview"
                onClick={onVideoTap ? (e) => onVideoTap(e) : undefined}
                style={previewStatus !== "streaming" ? { display: "none" } : undefined}
              />
            </picture>
            {!connected && (
              <div className="preview-overlay" data-testid={TEST_ID_CAMERA_OFFLINE_OVERLAY}>
                <p className="margin-none text-muted">Camera Offline</p>
              </div>
            )}
            {connected && previewStatus !== "streaming" && (
              <div className="preview-overlay" data-testid={TEST_ID_CAMERA_CONNECTING_OVERLAY}>
                <p className="margin-none text-muted">{previewStatus === "connecting" ? "Connecting…" : "No preview"}</p>
              </div>
            )}
          </div>
        </div>

        {/* Joystick + Presets column */}
        {(showJoystick || presets.length > 0 || cameraSelector) && (
          <div className="camera-controls-right">
            {cameraSelector}
            {showJoystick && (
              <PtzJoystick onStart={onJoystickStart} onMove={onJoystickMove} onStop={onJoystickStop} disabled={{ pan: !hasPan, tilt: !hasTilt }} />
            )}

            {/* Presets */}
            {presets.length > 0 && (
              <div className="camera-controls-presets">
                <label className="text-muted text-secondary text-caption">Presets</label>
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

        {/* Zoom slider (vertical) — between video and joystick */}
        {hasZoom && (
          <div className="camera-controls-zoom" data-testid={TEST_ID_CAMERA_ZOOM_SLIDER}>
            <IonIcon slot="end" icon={searchOutline} className="camera-zoom-icon" /> <br />
            <Slider
              orientation="vertical"
              size="medium"
              valueLabelDisplay="off"
              min={0}
              max={1}
              step={0.01}
              value={zoomMax > zoomMin ? (zoom - zoomMin) / (zoomMax - zoomMin) : 0}
              onChange={(_, newValue) => {
                // Map 0-1 user percentage to the camera's actual zoom range
                const mapped = zoomMin + (newValue as number) * (zoomMax - zoomMin);
                onZoomChange(mapped);
              }}
            />
            <span className="camera-zoom-value">{Math.round((zoomMax > zoomMin ? (zoom - zoomMin) / (zoomMax - zoomMin) : 0) * 100)}%</span>
          </div>
        )}
      </div>

      {/* Row 2: Focus bar (width of video) */}
      {isAdmin && hasFocus && (
        <div className="camera-controls-focus" data-testid={TEST_ID_CAMERA_FOCUS_SLIDER}>
          <label className="text-muted text-secondary text-caption">Focus</label>
          <Slider
            size="small"
            valueLabelDisplay="auto"
            min={0}
            max={1}
            step={0.01}
            value={focusMax > focusMin ? (focus - focusMin) / (focusMax - focusMin) : 0}
            valueLabelFormat={(v) => `${Math.round(v * 100)}%`}
            disabled={autoFocus}
            onChange={(_, newValue) => {
              const mapped = focusMin + (newValue as number) * (focusMax - focusMin);
              onFocusChange(mapped);
            }}
          />
        </div>
      )}

      {/* Row 3-4: Toggles (two-column grid) */}
      {isAdmin && (hasFocus || hasAiTracking) && (
        <div className="camera-controls-toggles" data-testid={TEST_ID_CAMERA_TOGGLE_ROW}>
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
