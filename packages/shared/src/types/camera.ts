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
  connected: boolean;
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
}

export interface CameraMetadata {
  ndiSourceName: string;
  fovWideAngle: number;
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
