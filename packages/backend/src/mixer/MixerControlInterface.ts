// Mixer Hardware Abstraction Layer (HAL).
//
// MixerControlInterface normalizes mixer operations across models and transports
// (Req 1). Callers express INTENT (set fader, read channel state, observe meters,
// monitor a channel); the driver decides internally whether that requires OSC
// polling, /xremote subscription, /meters blob decode, or USB capture. This is
// the single backend abstraction for all mixer communication (steering §2).
//
// This mirrors the camera HAL precedent (CameraControlInterface + driver factory
// keyed off model). The only model in this release is the Behringer X Air.

import type { MixerCapabilities, MixerChannelState, MixerChannelLevel, MixerModel, MixerPresetPayload } from "@invisible-av-booth/shared";

/**
 * A minimal OSC/UDP transport the driver depends on, so the socket can be faked
 * in tests without real UDP or hardware. The real implementation wraps node
 * dgram; tests provide an in-memory fake that records sends and can inject
 * inbound messages (external changes, read-back replies, meter blobs).
 */
export interface OscTransport {
  /** Send an OSC message to the configured mixer. */
  send(address: string, types?: string, values?: Array<number | string | Uint8Array>): void;
  /** Register a listener for inbound OSC messages. Returns an unsubscribe fn. */
  onMessage(listener: (address: string, values: Array<number | string | Uint8Array>) => void): () => void;
  /** Open the socket. Resolves true once ready. */
  open(): Promise<boolean>;
  /** Close the socket and release resources. */
  close(): void;
}

/**
 * The subset of AudioCaptureService the driver needs to satisfy
 * startChannelMonitor/stopChannelMonitor (Req 2.8 / Req 8-in-Req-4). Defined
 * here as a narrow interface so the driver does not depend on the full capture
 * service (built in Phase 4) and can be tested with a stub.
 */
export interface ChannelMonitorSink {
  /** Begin monitoring a channel's isolated audio (subscribe a consumer). */
  startChannelMonitor(mixerId: string, channel: number): void;
  /** Stop monitoring a channel (unsubscribe; teardown when no consumers remain). */
  stopChannelMonitor(mixerId: string, channel: number): void;
}

export interface MixerDriverConfig {
  mixerId: string;
  host: string;
  port: number;
  channelCount: number;
  /** Enabled features from the admin `features` column (before runtime downgrade). */
  features: MixerCapabilities["features"];
  /** Optional injected transport (tests inject a fake; production omits → real UDP). */
  transport?: OscTransport;
}

export interface MixerControlInterface {
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;

  getCapabilities(): MixerCapabilities;

  setFader(channel: number, level: number): Promise<void>; // level 0.0–1.0
  setMute(channel: number, muted: boolean): Promise<void>;
  setGain(channel: number, gainDb: number): Promise<void>;

  getChannelState(channel: number): MixerChannelState | null;
  getAllChannelStates(): MixerChannelState[];

  /** Capture the current board (all settable values, all channels) into an address→value map. */
  capturePreset(): Promise<MixerPresetPayload>;
  /** Apply a preset payload to the mixer (writes each address). */
  activatePreset(payload: MixerPresetPayload): Promise<void>;

  /** Metering observation intent — driver decides mechanism (OSC /meters). */
  onMeterUpdate(listener: (levels: MixerChannelLevel[]) => void): () => void;
  /** Lifecycle-gate metering to widget presence (Req 12.4). */
  setMeteringEnabled(enabled: boolean): void;

  /** External-change + reconciliation intent — emits the mixer-reported channel state. */
  onStateChange(listener: (state: MixerChannelState) => void): () => void;

  /** Emitted when any confirmed round-trip occurs (renewal reply, read-back, push) — feeds the "Controls" freshness indicator (Req 12.2). */
  onLiveness(listener: () => void): () => void;

  /** Isolated audio monitoring intent — driver delegates to the capture layer. */
  startChannelMonitor(channel: number): void;
  stopChannelMonitor(channel: number): void;
}

/**
 * Driver factory keyed off model (camera-model precedent). Dynamically imports
 * the concrete driver to keep this module dependency-light. The only model in
 * this release is "behringer-xair".
 */
export async function createMixerDriver(model: MixerModel, config: MixerDriverConfig, capture: ChannelMonitorSink): Promise<MixerControlInterface> {
  switch (model) {
    case "behringer-xair": {
      const { BehringerXAirDriver } = await import("./BehringerXAirDriver.js");
      return new BehringerXAirDriver(config, capture);
    }
    default: {
      // Exhaustiveness guard — a new model must add a case here.
      throw new Error(`Unsupported mixer model: ${String(model)}`);
    }
  }
}
