import type { MixerFeature, MixerModel } from "@invisible-av-booth/shared";
import { OSC_PORT_DEFAULT } from "@invisible-av-booth/shared";
import type { DeviceRecord } from "./deviceTypeRegistry";

export const MIXER_FEATURES: MixerFeature[] = ["gain-control", "channel-metering"];

export const MIXER_MODEL_OPTIONS: Array<{ value: MixerModel; label: string }> = [{ value: "behringer-xair", label: "Behringer X Air" }];

/**
 * Form state kept as strings for inputs. Feature toggles live in `features`
 * (Record<string, boolean>). Numeric metadata (channelCount) is held as a string
 * here and serialized at the DeviceRecord.metadata boundary (Record<string,string>).
 *
 * NOTE: the channel→USB-slot mapping was intentionally removed (it was never used
 * by a shipping feature) — see `sound-board-control` spec Appendix A. The capture
 * layer, if revived, assumes identity routing (USB slot N = channel N).
 */
export interface SoundBoardFormState {
  label: string;
  model: MixerModel;
  host: string;
  port: string;
  channelCount: string;
  features: Record<MixerFeature, boolean>;
  enabled: boolean;
}

function defaultFeatures(): Record<MixerFeature, boolean> {
  return { "gain-control": true, "channel-metering": true };
}

export function buildInitialState(device: DeviceRecord | null): SoundBoardFormState {
  if (device) {
    const metadata = device.metadata as Record<string, string>;
    const channelCount = metadata["channelCount"] ?? "8";
    const features = {
      "gain-control": device.features["gain-control"] ?? false,
      "channel-metering": device.features["channel-metering"] ?? false,
    };
    return {
      label: device.label,
      model: (metadata["model"] as MixerModel) ?? "behringer-xair",
      host: device.host,
      port: String(device.port),
      channelCount: String(channelCount),
      features,
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
    enabled: true,
  };
}

/**
 * Serialize the form's metadata for the DeviceRecord.metadata boundary
 * (Record<string,string>): model as-is and channelCount as a string.
 */
export function serializeMetadata(form: SoundBoardFormState): Record<string, string> {
  return {
    model: form.model,
    channelCount: String(Number(form.channelCount)),
  };
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
    JSON.stringify(current.features) !== JSON.stringify(initial.features)
  );
}
