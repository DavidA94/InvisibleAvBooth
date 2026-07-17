// Camera-related types shared between frontend and backend.

export type CameraFeature = "pan" | "tilt" | "zoom" | "focus" | "ai-tracking" | "ai-tracking-tilt" | "ai-tracking-zoom";
export type CameraModel = "generic" | "tongveo-nvs20a-4kn";

export interface PositionInquiry {
  pan: number | null;
  tilt: number | null;
  zoom: number | null;
  focus: number | null;
  autoFocus: boolean | null;
}

export interface CameraPreset {
  id: string;
  name: string;
  sortOrder: number;
  storedOnCamera: boolean;
  cameraPresetSlot: number | null;
  pan: number | null;
  tilt: number | null;
  zoom: number | null;
  focus: number | null;
  autoFocus: boolean;
  aiTracking: boolean;
  aiTilt: boolean;
  aiZoom: boolean;
}

export interface CameraState {
  cameraId: string;
  label: string;
  connected: boolean;
  viscaConnected: boolean;
  position: PositionInquiry | null;
  autoFocus: boolean;
  aiTracking: boolean;
  aiTilt: boolean;
  aiZoom: boolean;
  activePresetId: string | null;
  features: CameraFeature[];
  capabilities: { tapToCenter: boolean };
  presets: CameraPreset[];
  zoomMin?: number;
  zoomMax?: number;
  panMin?: number;
  panMax?: number;
  tiltMin?: number;
  tiltMax?: number;
}

export interface CameraMetadata {
  ndiSourceName: string;
  fovWideAngle: number;
  /** Vertical FOV at widest zoom in degrees. If not set, calculated from fovWideAngle * 9/16. */
  verticalFovWideAngle?: number;
  /** Horizontal FOV at maximum zoom (telephoto) in degrees. Used for accurate FOV interpolation. */
  fovTeleAngle?: number;
  /** Vertical FOV at maximum zoom (telephoto) in degrees. */
  verticalFovTeleAngle?: number;
  opticalZoomRatio: number;
  cameraModel: CameraModel;
  cameraFeatures: CameraFeature[];
  viscaEnabled: boolean;
  ndiExtraIPs?: string;
  aiHttpCookie?: string;
  aiCredentialId?: string;
  panMin?: number;
  panMax?: number;
  tiltMin?: number;
  tiltMax?: number;
  zoomMin?: number;
  zoomMax?: number;
  focusMin?: number;
  focusMax?: number;
  /** Total mechanical pan range in degrees (e.g., 350 for most PTZ cameras). Used for tap-to-center. */
  panTotalDegrees?: number;
  /** Total mechanical tilt range in degrees (e.g., 180 for most PTZ cameras). Used for tap-to-center. */
  tiltTotalDegrees?: number;
}

export interface ObsMetadata {
  ndiOutputName?: string;
  ndiExtraIPs?: string;
}

export interface CameraSetPayload {
  cameraId: string;
  zoom?: number;
  focus?: number;
  autoFocus?: boolean;
  aiTracking?: boolean;
  aiTilt?: boolean;
  aiZoom?: boolean;
}
