import type { BUS_OBS_STATE_CHANGED, BUS_OBS_ERROR, BUS_OBS_ERROR_RESOLVED, BUS_DEVICE_CAPABILITIES_UPDATED } from "../../../eventBus/types.js";
import type { CapabilitiesObject } from "../../../eventBus/types.js";

export interface ObsState {
  connected: boolean;
  streaming: boolean;
  recording: boolean;
  streamTimecode?: string;
  recordingTimecode?: string;
  commandedState: {
    streaming: boolean;
    recording: boolean;
  };
}

export type ObsErrorCode =
  | "OBS_UNREACHABLE"
  | "OBS_NOT_CONFIGURED"
  | "STREAM_START_FAILED"
  | "STREAM_STOP_FAILED"
  | "RECORDING_START_FAILED"
  | "RECORDING_STOP_FAILED"
  | "METADATA_UPDATE_FAILED";

export class ObsError extends Error {
  constructor(
    public readonly code: ObsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ObsError";
  }
}

// Discriminated union: OBS_UNREACHABLE always carries retryExhausted + context;
// all other codes never do. This ensures the SocketGateway can always produce
// the correct disconnect message without runtime checks for undefined fields.
export type ObsErrorEvent =
  | {
      error: ObsError & { code: "OBS_UNREACHABLE" };
      retryExhausted: boolean;
      context: { streaming: boolean; recording: boolean };
    }
  | {
      error: ObsError & { code: Exclude<ObsErrorCode, "OBS_UNREACHABLE"> };
      retryExhausted?: never;
      context?: never;
    };

// EventMap slice — merged into the root EventMap in eventBus.ts
export interface ObsEventMap {
  [BUS_OBS_STATE_CHANGED]: { state: ObsState };
  [BUS_OBS_ERROR]: ObsErrorEvent;
  [BUS_OBS_ERROR_RESOLVED]: { errorCode: string };
  [BUS_DEVICE_CAPABILITIES_UPDATED]: { deviceId: string; capabilities: CapabilitiesObject };
}
