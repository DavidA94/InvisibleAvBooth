/**
 * Pure logic for the OBS device form. Extracted from ObsDeviceForm.tsx for testability.
 */

import type { DeviceRecord } from "./deviceTypeRegistry";

export const DEFAULT_PORT = "4455";

export interface ObsFormState {
  label: string;
  host: string;
  port: string;
  password: string;
  enabled: boolean;
  ndiOutputName: string;
  ndiExtraIPs: string;
}

export function buildInitialState(device: DeviceRecord | null): ObsFormState {
  if (device) {
    return {
      label: device.label,
      host: device.host,
      port: String(device.port),
      password: "",
      enabled: device.enabled,
      ndiOutputName: (device.metadata as { ndiOutputName?: string })?.ndiOutputName ?? "",
      ndiExtraIPs: (device.metadata as { ndiExtraIPs?: string })?.ndiExtraIPs ?? "",
    };
  }
  return { label: "", host: "", port: DEFAULT_PORT, password: "", enabled: true, ndiOutputName: "", ndiExtraIPs: "" };
}

/**
 * Compare current form state to the initial snapshot.
 * Password is excluded from dirty-check when editing (blank = "keep existing").
 */
export function isFormDirty(current: ObsFormState, initial: ObsFormState, isEdit: boolean): boolean {
  if (current.label !== initial.label) return true;
  if (current.host !== initial.host) return true;
  if (current.port !== initial.port) return true;
  if (current.enabled !== initial.enabled) return true;
  if (current.ndiOutputName !== initial.ndiOutputName) return true;
  if (current.ndiExtraIPs !== initial.ndiExtraIPs) return true;
  if (!isEdit && current.password !== initial.password) return true;
  if (isEdit && current.password !== "") return true;
  return false;
}
