import { EventEmitter } from "events";

// ---- Shared types referenced by the EventMap ----

export interface SessionManifest {
  speaker?: string;
  title?: string;
  scripture?: ScriptureReference;
}

export interface ScriptureReference {
  bookId: number;
  chapter: number;
  verse: number;
  verseEnd?: number;
}

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

export interface CapabilitiesObject {
  deviceId: string;
  deviceType: "obs" | "camera-ptz" | "audio-mixer" | "text-overlay";
  features: Record<string, boolean>;
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

// ---- EventMap ----

export interface EventMap {
  // Emitted by SessionManifestService after any update or clear.
  // interpolatedStreamTitle is pre-computed once here so ObsService and
  // SocketGateway both read the same value rather than re-interpolating.
  "session:manifest:updated": {
    manifest: SessionManifest;
    interpolatedStreamTitle: string;
  };

  // Emitted by ObsService on every state change (connect, disconnect, command
  // completion, obs-websocket event). SessionManifestService subscribes to this
  // to know whether a live session is active before allowing a manifest clear.
  "obs:state:changed": { state: ObsState };

  // Emitted by ObsService when a connection or command error occurs.
  "obs:error": ObsErrorEvent;

  // Emitted by ObsService when a previously-reported error condition resolves
  // (e.g., OBS reconnects after OBS_UNREACHABLE). errorCode matches the code
  // from the original obs:error emission so the SocketGateway can dismiss the
  // corresponding notification on the frontend.
  "obs:error:resolved": { errorCode: string };

  // Emitted by ObsService after connecting when capabilities are discovered.
  "device:capabilities:updated": {
    deviceId: string;
    capabilities: CapabilitiesObject;
  };
}

// ---- EventBus ----

class EventBusImpl {
  private readonly emitter = new EventEmitter();

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.emitter.emit(event, payload);
  }

  subscribe<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void,
  ): void {
    this.emitter.on(event, handler);
  }

  unsubscribe<K extends keyof EventMap>(
    event: K,
    handler: (payload: EventMap[K]) => void,
  ): void {
    this.emitter.off(event, handler);
  }
}

// Singleton — all services share the same bus instance.
export const eventBus = new EventBusImpl();
