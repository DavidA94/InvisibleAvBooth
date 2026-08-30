import type { MixerFeature, MixerModel } from "@invisible-av-booth/shared";
import { OSC_PORT_DEFAULT } from "@invisible-av-booth/shared";
import type { DeviceRecord } from "./deviceTypeRegistry";

export const MIXER_FEATURES: MixerFeature[] = ["gain-control", "channel-metering", "channel-audio-capture"];

export const MIXER_MODEL_OPTIONS: Array<{ value: MixerModel; label: string }> = [{ value: "behringer-xair", label: "Behringer X Air" }];

/**
 * Form state kept as strings for inputs. Feature toggles live in `features`
 * (Record<string, boolean>). Numeric metadata (channelCount) and the usbSlotMap
 * (Record<string, number>) are held as strings/objects here and serialized to
 * STRINGS at the DeviceRecord.metadata boundary (which is Record<string,string>).
 */
export interface SoundBoardFormState {
  label: string;
  model: MixerModel;
  host: string;
  port: string;
  channelCount: string;
  features: Record<MixerFeature, boolean>;
  /** channel number (string) → USB slot number (string). */
  usbSlotMap: Record<string, string>;
  enabled: boolean;
}

function defaultFeatures(): Record<MixerFeature, boolean> {
  return { "gain-control": true, "channel-metering": true, "channel-audio-capture": false };
}

/** Identity map channel N → slot N for `count` channels. */
export function identityUsbSlotMap(count: number): Record<string, string> {
  const map: Record<string, string> = {};
  for (let channel = 1; channel <= count; channel++) map[String(channel)] = String(channel);
  return map;
}

export function buildInitialState(device: DeviceRecord | null): SoundBoardFormState {
  if (device) {
    const metadata = device.metadata as Record<string, string>;
    const channelCount = metadata["channelCount"] ?? "8";
    const features = {
      "gain-control": device.features["gain-control"] ?? false,
      "channel-metering": device.features["channel-metering"] ?? false,
      "channel-audio-capture": device.features["channel-audio-capture"] ?? false,
    };
    let usbSlotMap: Record<string, string> = identityUsbSlotMap(Number(channelCount) || 0);
    const rawMap = metadata["usbSlotMap"];
    if (rawMap) {
      try {
        const parsed = JSON.parse(rawMap) as Record<string, number>;
        usbSlotMap = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
      } catch {
        // fall back to identity
      }
    }
    return {
      label: device.label,
      model: (metadata["model"] as MixerModel) ?? "behringer-xair",
      host: device.host,
      port: String(device.port),
      channelCount: String(channelCount),
      features,
      usbSlotMap,
      enabled: device.enabled,
    };
  }
  return {
    label: "",
    model: "behringer-xair",
    host: "",
    port: String(OSC_PORT_DEFAULT),
    channelCount: "8",
    features: defaultFeatures(),
    usbSlotMap: identityUsbSlotMap(8),
    enabled: true,
  };
}

/**
 * Serialize the form's metadata for the DeviceRecord.metadata boundary
 * (Record<string,string>): model as-is, channelCount as a string, and — WHEN
 * channel-audio-capture is enabled — usbSlotMap JSON-encoded with numeric slots.
 */
export function serializeMetadata(form: SoundBoardFormState): Record<string, string> {
  const metadata: Record<string, string> = {
    model: form.model,
    channelCount: String(Number(form.channelCount)),
  };
  if (form.features["channel-audio-capture"]) {
    const numericMap: Record<string, number> = {};
    for (const [channel, slot] of Object.entries(form.usbSlotMap)) numericMap[channel] = Number(slot);
    metadata["usbSlotMap"] = JSON.stringify(numericMap);
  }
  return metadata;
}

/** The `features` object (Record<string, boolean>) sent in the request body. */
export function serializeFeatures(form: SoundBoardFormState): Record<string, boolean> {
  return { ...form.features };
}

/** Validate the form; returns an error message or null. */
export function validate(form: SoundBoardFormState): string | null {
  if (!form.label.trim()) return "Label is required";
  if (!form.host.trim()) return "Host is required";
  const port = Number(form.port);
  if (!Number.isInteger(port) || port <= 0) return "Port must be a positive integer";
  const channelCount = Number(form.channelCount);
  if (!Number.isInteger(channelCount) || channelCount <= 0) return "Channel count must be a positive integer";
  if (form.features["channel-audio-capture"]) {
    for (const [channel, slot] of Object.entries(form.usbSlotMap)) {
      const slotNumber = Number(slot);
      if (!Number.isInteger(slotNumber) || slotNumber <= 0) return `USB slot for channel ${channel} must be a positive integer`;
    }
  }
  return null;
}

export function isFormDirty(current: SoundBoardFormState, initial: SoundBoardFormState): boolean {
  return (
    current.label !== initial.label ||
    current.model !== initial.model ||
    current.host !== initial.host ||
    current.port !== initial.port ||
    current.channelCount !== initial.channelCount ||
    current.enabled !== initial.enabled ||
    JSON.stringify(current.features) !== JSON.stringify(initial.features) ||
    JSON.stringify(current.usbSlotMap) !== JSON.stringify(initial.usbSlotMap)
  );
}
