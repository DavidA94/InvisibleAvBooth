import type { ComponentType } from "react";

/** Shape every device-type form component must accept. */
export interface DeviceFormProps {
  /** null = creating a new device; object = editing an existing one. */
  device: DeviceRecord | null;
  /** Called when the form is saved successfully — parent refreshes the list. */
  onSaved: () => void;
  /** Called when the user taps Delete and confirms — parent refreshes the list. */
  onDeleted: () => void;
  /** Register a snapshot so the parent can detect unsaved changes. */
  registerDirtyCheck: (check: DirtyCheck) => void;
}

export interface DeviceRecord {
  id: string;
  deviceType: string;
  label: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
  features: Record<string, boolean>;
  enabled: boolean;
  createdAt: string;
}

export interface DirtyCheck {
  isDirty: () => boolean;
}

export interface DeviceTypeEntry {
  /** Display name shown in the list sublabel and add-device popover. */
  displayName: string;
  /** The form component rendered in the right panel. */
  formComponent: ComponentType<DeviceFormProps>;
}

/**
 * Registry of all supported device types.
 * To add a new device type: import its form component and add one entry here.
 */
import { ObsDeviceForm } from "./ObsDeviceForm";
import { CameraDeviceForm } from "./CameraDeviceForm";

export const DEVICE_TYPE_REGISTRY: Record<string, DeviceTypeEntry> = {
  obs: { displayName: "OBS", formComponent: ObsDeviceForm },
  "camera-ptz": { displayName: "Camera (PTZ)", formComponent: CameraDeviceForm },
};

/** Ordered list of device type keys for the "Add Device" popover. */
export const DEVICE_TYPE_KEYS: string[] = Object.keys(DEVICE_TYPE_REGISTRY);

/** Get display name for a device type, falling back to the raw key. */
export function getDeviceTypeDisplayName(deviceType: string): string {
  return DEVICE_TYPE_REGISTRY[deviceType]?.displayName ?? deviceType;
}
