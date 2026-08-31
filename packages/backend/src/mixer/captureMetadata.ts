// Pure parsers for soundboard device metadata used by the capture layer wiring
// in app.ts. Extracted so the branchy coercion/fallback logic is unit-testable
// without a database or the full app (testing.md: decompose testable pieces).
//
// The device form stores channelCount as either a number or a string; both these
// parsers coerce it the same way MixerService.parseConfig does, so the /preview
// WS validator and the capture-target resolver never disagree with the driver
// (a mismatch previously rejected every channel — "Live Audio View Unavailable").

import type { CaptureTarget } from "./AudioCaptureService.js";

interface SoundboardMetadata {
  usbSlotMap?: Record<string, number>;
  captureNodeName?: string;
  deviceChannels?: number;
  channelCount?: number | string;
}

/**
 * Resolve a channel's capture target from a soundboard row's metadata JSON.
 * Returns an identity fallback (slot === channel, no node, 0 channels) when the
 * row is absent (null) or the JSON is unparseable.
 */
export function resolveCaptureTarget(metadataJson: string | null, channel: number): CaptureTarget {
  const fallback: CaptureTarget = { slot: channel, nodeName: "", deviceChannels: 0 };
  if (metadataJson === null) return fallback;
  try {
    const metadata = JSON.parse(metadataJson) as SoundboardMetadata;
    const slot = metadata.usbSlotMap?.[String(channel)];
    return {
      slot: typeof slot === "number" ? slot : channel,
      nodeName: typeof metadata.captureNodeName === "string" ? metadata.captureNodeName : "",
      deviceChannels: typeof metadata.deviceChannels === "number" ? metadata.deviceChannels : 0,
    };
  } catch {
    return fallback;
  }
}

/**
 * Whether a channel is within a soundboard's configured channel count. Returns
 * false for an absent row (null) or unparseable JSON. channelCount is coerced
 * from string when needed.
 */
export function isChannelInRange(metadataJson: string | null, channel: number): boolean {
  if (metadataJson === null) return false;
  try {
    const metadata = JSON.parse(metadataJson) as SoundboardMetadata;
    const count = typeof metadata.channelCount === "string" ? Number(metadata.channelCount) : (metadata.channelCount ?? 0);
    return Number.isFinite(count) && channel >= 1 && channel <= count;
  } catch {
    return false;
  }
}
