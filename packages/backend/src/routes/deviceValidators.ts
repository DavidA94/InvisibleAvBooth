// Per-device-type validation seam for adminDeviceRoutes.
//
// WHY a seam (not more inline `if (deviceType === ...)` blocks): the shared
// device CRUD handler already dispatches by deviceType for hot-reload emits.
// Rather than scatter per-type metadata validation across the handler, a device
// type registers a validate function here. Adding a new type's validation is a
// new entry, not an edit to the shared handler (steering §2 / §8 extensibility).
//
// Only types that need metadata/feature validation register a validator; types
// with no entry pass the generic label/host/port checks only (current behavior
// for camera/OBS is preserved).

import type { MixerFeature } from "@invisible-av-booth/shared";

export interface DeviceValidationInput {
  deviceType: string;
  label?: string;
  host?: string;
  port?: number;
  metadata?: Record<string, unknown>;
  features?: Record<string, unknown>;
}

/** Returns an error message string if invalid, or null if valid. */
export type DeviceValidator = (input: DeviceValidationInput) => string | null;

const MIXER_FEATURES: MixerFeature[] = ["gain-control", "channel-metering", "channel-audio-capture"];

/**
 * Validate a soundboard (mixer) device (Req 9.2/9.6):
 * - model must be the only supported value
 * - channelCount must be a positive integer
 * - feature flags, when present, must be booleans over the known feature set
 * - usbSlotMap, when channel-audio-capture is enabled, must map channel→slot
 *   with positive-integer slots (defaults to identity, but is editable)
 */
export const validateSoundboard: DeviceValidator = (input) => {
  const metadata = (input.metadata ?? {}) as Record<string, unknown>;
  const features = (input.features ?? {}) as Record<string, unknown>;

  const model = metadata["model"];
  if (model !== "behringer-xair") {
    return 'model must be "behringer-xair"';
  }

  // channelCount is JSON-encoded but semantically numeric — accept number or numeric string.
  const rawChannelCount = metadata["channelCount"];
  const channelCount = typeof rawChannelCount === "string" ? Number(rawChannelCount) : rawChannelCount;
  if (typeof channelCount !== "number" || !Number.isInteger(channelCount) || channelCount <= 0) {
    return "channelCount must be a positive integer";
  }

  for (const [key, value] of Object.entries(features)) {
    if (!MIXER_FEATURES.includes(key as MixerFeature)) {
      return `unknown mixer feature "${key}"`;
    }
    if (typeof value !== "boolean") {
      return `mixer feature "${key}" must be a boolean`;
    }
  }

  const captureEnabled = features["channel-audio-capture"] === true;
  if (captureEnabled) {
    const rawMap = metadata["usbSlotMap"];
    if (rawMap !== undefined && rawMap !== null) {
      const map = typeof rawMap === "string" ? safeParse(rawMap) : rawMap;
      if (typeof map !== "object" || map === null || Array.isArray(map)) {
        return "usbSlotMap must be an object mapping channel number to USB slot";
      }
      for (const [channel, slot] of Object.entries(map as Record<string, unknown>)) {
        if (!/^\d+$/.test(channel)) {
          return `usbSlotMap keys must be channel numbers, got "${channel}"`;
        }
        const slotNumber = typeof slot === "string" ? Number(slot) : slot;
        if (typeof slotNumber !== "number" || !Number.isInteger(slotNumber) || slotNumber <= 0) {
          return `usbSlotMap slot for channel ${channel} must be a positive integer`;
        }
      }
    }
  }

  return null;
};

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

/** Registry of per-type validators. Types without an entry use generic checks only. */
export const DEVICE_VALIDATORS: Record<string, DeviceValidator> = {
  soundboard: validateSoundboard,
};
