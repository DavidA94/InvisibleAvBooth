import type { CameraFeature, CameraModel } from "@invisible-av-booth/shared";
import type { DeviceRecord } from "./deviceTypeRegistry";

export const ALL_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom", "focus"];
export const AI_FEATURES: CameraFeature[] = ["ai-tracking", "ai-tracking-tilt", "ai-tracking-zoom"];
export const PTZ_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom", "focus"];

export const MODEL_OPTIONS: Array<{ value: CameraModel; label: string }> = [
  { value: "generic", label: "Generic" },
  { value: "tongveo-nvs20a-4kn", label: "Tongveo NVS20A-4KN" },
];

export interface CameraFormState {
  label: string;
  cameraModel: CameraModel;
  ndiSourceName: string;
  ndiExtraIPs: string;
  viscaEnabled: boolean;
  host: string;
  port: string;
  fovWideAngle: string;
  verticalFovWideAngle: string;
  fovTeleAngle: string;
  verticalFovTeleAngle: string;
  opticalZoomRatio: string;
  panTotalDegrees: string;
  tiltTotalDegrees: string;
  features: CameraFeature[];
  aiHttpCookie: string;
  aiCredentialId: string;
  enabled: boolean;
  panMin: string;
  panMax: string;
  tiltMin: string;
  tiltMax: string;
  zoomMin: string;
  zoomMax: string;
  focusMin: string;
  focusMax: string;
}

export function buildInitialState(device: DeviceRecord | null): CameraFormState {
  if (device) {
    const meta = device.metadata as Record<string, unknown>;
    return {
      label: device.label,
      cameraModel: (meta.cameraModel as CameraModel) ?? "generic",
      ndiSourceName: (meta.ndiSourceName as string) ?? "",
      ndiExtraIPs: (meta.ndiExtraIPs as string) ?? "",
      viscaEnabled: (meta.viscaEnabled as boolean) ?? false,
      host: device.host,
      port: String(device.port),
      fovWideAngle: String((meta.fovWideAngle as number) ?? 60),
      verticalFovWideAngle: String((meta.verticalFovWideAngle as number) ?? ""),
      fovTeleAngle: meta.fovTeleAngle !== undefined ? String(meta.fovTeleAngle) : "",
      verticalFovTeleAngle: meta.verticalFovTeleAngle !== undefined ? String(meta.verticalFovTeleAngle) : "",
      opticalZoomRatio: String((meta.opticalZoomRatio as number) ?? 20),
      features: (meta.cameraFeatures as CameraFeature[]) ?? [...ALL_FEATURES],
      aiHttpCookie: "",
      aiCredentialId: "",
      enabled: device.enabled,
      panMin: meta.panMin !== undefined ? String(meta.panMin) : "",
      panMax: meta.panMax !== undefined ? String(meta.panMax) : "",
      tiltMin: meta.tiltMin !== undefined ? String(meta.tiltMin) : "",
      tiltMax: meta.tiltMax !== undefined ? String(meta.tiltMax) : "",
      zoomMin: meta.zoomMin !== undefined ? String(meta.zoomMin) : "",
      zoomMax: meta.zoomMax !== undefined ? String(meta.zoomMax) : "",
      focusMin: meta.focusMin !== undefined ? String(meta.focusMin) : "",
      focusMax: meta.focusMax !== undefined ? String(meta.focusMax) : "",
      panTotalDegrees: meta.panTotalDegrees !== undefined ? String(meta.panTotalDegrees) : "350",
      tiltTotalDegrees: meta.tiltTotalDegrees !== undefined ? String(meta.tiltTotalDegrees) : "180",
    };
  }
  return {
    label: "",
    cameraModel: "generic",
    ndiSourceName: "",
    ndiExtraIPs: "",
    viscaEnabled: true,
    host: "",
    port: "5500",
    fovWideAngle: "60",
    verticalFovWideAngle: "",
    fovTeleAngle: "",
    verticalFovTeleAngle: "",
    opticalZoomRatio: "20",
    features: [...ALL_FEATURES],
    aiHttpCookie: "",
    aiCredentialId: "",
    enabled: true,
    panMin: "",
    panMax: "",
    tiltMin: "",
    tiltMax: "",
    zoomMin: "",
    zoomMax: "",
    focusMin: "",
    focusMax: "",
    panTotalDegrees: "350",
    tiltTotalDegrees: "180",
  };
}

export function isFormDirty(current: CameraFormState, initial: CameraFormState, isEdit: boolean): boolean {
  if (current.label !== initial.label) return true;
  if (current.cameraModel !== initial.cameraModel) return true;
  if (current.ndiSourceName !== initial.ndiSourceName) return true;
  if (current.ndiExtraIPs !== initial.ndiExtraIPs) return true;
  if (current.viscaEnabled !== initial.viscaEnabled) return true;
  if (current.host !== initial.host) return true;
  if (current.port !== initial.port) return true;
  if (current.fovWideAngle !== initial.fovWideAngle) return true;
  if (current.verticalFovWideAngle !== initial.verticalFovWideAngle) return true;
  if (current.fovTeleAngle !== initial.fovTeleAngle) return true;
  if (current.verticalFovTeleAngle !== initial.verticalFovTeleAngle) return true;
  if (current.opticalZoomRatio !== initial.opticalZoomRatio) return true;
  if (current.panTotalDegrees !== initial.panTotalDegrees) return true;
  if (current.tiltTotalDegrees !== initial.tiltTotalDegrees) return true;
  if (current.enabled !== initial.enabled) return true;
  if (JSON.stringify(current.features) !== JSON.stringify(initial.features)) return true;
  if (isEdit && (current.aiHttpCookie !== "" || current.aiCredentialId !== "")) return true;
  if (!isEdit && (current.aiHttpCookie !== initial.aiHttpCookie || current.aiCredentialId !== initial.aiCredentialId)) return true;
  return false;
}
