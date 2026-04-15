import OBSWebSocket from "obs-websocket-js";
import type { Database } from "better-sqlite3";
import { eventBus } from "../eventBus.js";
import { ObsError } from "../eventBus.js";
import type { ObsState } from "../eventBus.js";
import { decrypt } from "../crypto.js";
import { logger } from "../logger.js";

export type { ObsState };
export { ObsError };
export type ObsErrorCode = InstanceType<typeof ObsError>["code"];

export type Result<T, E> = { success: true; value: T } | { success: false; error: E };

interface DeviceRow {
  id: string;
  host: string;
  port: number;
  encryptedPassword: string | null;
  metadata: string;
  enabled: number;
}

interface RetryConfig {
  initialDelayMs: number;
  maxDelayMs: number;
  maxAttempts: number;
  backoffFactor: number;
  jitterMs: number;
}

const DEFAULT_RETRY: RetryConfig = {
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: 10,
  backoffFactor: 2,
  jitterMs: 500,
};

export class ObsService {
  private obs: OBSWebSocket;
  private state: ObsState = {
    connected: false,
    streaming: false,
    recording: false,
    commandedState: { streaming: false, recording: false },
  };
  private cachedStreamTitle = "";
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryExhausted = false;
  private readonly manifestHandler: (payload: { interpolatedStreamTitle: string }) => void;

  constructor(
    private readonly db: Database,
    private readonly retry: RetryConfig = DEFAULT_RETRY,
    obsClient?: OBSWebSocket,
  ) {
    this.obs = obsClient ?? new OBSWebSocket();

    // Cache the latest interpolated stream title for use in the safe-start sequence.
    this.manifestHandler = ({ interpolatedStreamTitle }) => {
      this.cachedStreamTitle = interpolatedStreamTitle;
    };
    eventBus.subscribe("session:manifest:updated", this.manifestHandler);
  }

  destroy(): void {
    eventBus.unsubscribe("session:manifest:updated", this.manifestHandler);
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  getState(): ObsState {
    return { ...this.state };
  }

  async connect(): Promise<Result<void, ObsError>> {
    const config = this.loadConfig();
    if (!config) {
      const err = new ObsError("OBS_NOT_CONFIGURED", "No enabled OBS device connection found");
      eventBus.emit("obs:error", { error: err as ObsError & { code: "OBS_NOT_CONFIGURED" } });
      return { success: false, error: err };
    }

    try {
      const url = `ws://${config.host}:${config.port}`;
      const password = config.encryptedPassword ? decrypt(config.encryptedPassword) : undefined;
      await this.obs.connect(url, password);

      this.retryAttempt = 0;
      this.retryExhausted = false;

      // Query current state from OBS on connect
      const [streamStatus, recordStatus] = await Promise.all([this.obs.call("GetStreamStatus"), this.obs.call("GetRecordStatus")]);

      this.updateState({
        connected: true,
        streaming: streamStatus.outputActive,
        recording: recordStatus.outputActive,
      });

      // Wire up obs-websocket event listeners
      this.obs.on("StreamStateChanged", (data) => {
        this.updateState({ streaming: data.outputActive });
      });
      this.obs.on("RecordStateChanged", (data) => {
        this.updateState({ recording: data.outputActive });
      });
      this.obs.on("ConnectionClosed", () => {
        this.handleDisconnect();
      });

      logger.info("OBS connected", { context: { host: config.host, port: config.port } });
      return { success: true, value: undefined };
    } catch (err) {
      const obsErr = new ObsError("OBS_UNREACHABLE", err instanceof Error ? err.message : String(err));
      this.scheduleReconnect();
      return { success: false, error: obsErr };
    }
  }

  async disconnect(): Promise<Result<void, ObsError>> {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    try {
      await this.obs.disconnect();
      this.updateState({ connected: false });
      return { success: true, value: undefined };
    } catch (err) {
      return { success: false, error: new ObsError("OBS_UNREACHABLE", String(err)) };
    }
  }

  // Safe-start: update metadata first, then start stream.
  async startStream(): Promise<Result<ObsState, ObsError>> {
    if (!this.state.connected) {
      return { success: false, error: new ObsError("OBS_UNREACHABLE", "OBS is not connected") };
    }

    // Step 1: update stream metadata
    const metaResult = await this.updateStreamMetadata(this.cachedStreamTitle);
    if (!metaResult.success) return metaResult;

    // Step 2: start stream
    try {
      await this.obs.call("StartStream");
      this.state.commandedState.streaming = true;
      eventBus.emit("obs:state:changed", { state: this.getState() });
      return { success: true, value: this.getState() };
    } catch (err) {
      eventBus.emit("obs:error", {
        error: new ObsError("STREAM_START_FAILED", String(err)) as ObsError & { code: "STREAM_START_FAILED" },
      });
      return { success: false, error: new ObsError("STREAM_START_FAILED", String(err)) };
    }
  }

  async stopStream(): Promise<Result<ObsState, ObsError>> {
    if (!this.state.connected) {
      return { success: false, error: new ObsError("OBS_UNREACHABLE", "OBS is not connected") };
    }
    try {
      await this.obs.call("StopStream");
      this.state.commandedState.streaming = false;
      eventBus.emit("obs:state:changed", { state: this.getState() });
      return { success: true, value: this.getState() };
    } catch (err) {
      eventBus.emit("obs:error", {
        error: new ObsError("STREAM_STOP_FAILED", String(err)) as ObsError & { code: "STREAM_STOP_FAILED" },
      });
      return { success: false, error: new ObsError("STREAM_STOP_FAILED", String(err)) };
    }
  }

  async startRecording(): Promise<Result<ObsState, ObsError>> {
    if (!this.state.connected) {
      return { success: false, error: new ObsError("OBS_UNREACHABLE", "OBS is not connected") };
    }
    try {
      await this.obs.call("StartRecord");
      this.state.commandedState.recording = true;
      eventBus.emit("obs:state:changed", { state: this.getState() });
      return { success: true, value: this.getState() };
    } catch (err) {
      eventBus.emit("obs:error", {
        error: new ObsError("RECORDING_START_FAILED", String(err)) as ObsError & { code: "RECORDING_START_FAILED" },
      });
      return { success: false, error: new ObsError("RECORDING_START_FAILED", String(err)) };
    }
  }

  async stopRecording(): Promise<Result<ObsState, ObsError>> {
    if (!this.state.connected) {
      return { success: false, error: new ObsError("OBS_UNREACHABLE", "OBS is not connected") };
    }
    try {
      await this.obs.call("StopRecord");
      this.state.commandedState.recording = false;
      eventBus.emit("obs:state:changed", { state: this.getState() });
      return { success: true, value: this.getState() };
    } catch (err) {
      eventBus.emit("obs:error", {
        error: new ObsError("RECORDING_STOP_FAILED", String(err)) as ObsError & { code: "RECORDING_STOP_FAILED" },
      });
      return { success: false, error: new ObsError("RECORDING_STOP_FAILED", String(err)) };
    }
  }

  async updateStreamMetadata(title: string): Promise<Result<void, ObsError>> {
    try {
      await this.obs.call("SetStreamServiceSettings", {
        streamServiceType: "rtmp_common",
        streamServiceSettings: { stream_title: title },
      });
      return { success: true, value: undefined };
    } catch (err) {
      eventBus.emit("obs:error", {
        error: new ObsError("METADATA_UPDATE_FAILED", String(err)) as ObsError & { code: "METADATA_UPDATE_FAILED" },
      });
      return { success: false, error: new ObsError("METADATA_UPDATE_FAILED", String(err)) };
    }
  }

  // Trigger a fresh reconnect attempt (e.g., from SocketGateway obs:reconnect command).
  async reconnect(): Promise<Result<void, ObsError>> {
    this.retryAttempt = 0;
    this.retryExhausted = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    return this.connect();
  }

  private loadConfig(): DeviceRow | null {
    return (this.db.prepare("SELECT * FROM device_connections WHERE deviceType = 'obs' AND enabled = 1 LIMIT 1").get() as DeviceRow | undefined) ?? null;
  }

  private updateState(patch: Partial<Omit<ObsState, "commandedState">>): void {
    this.state = { ...this.state, ...patch };
    eventBus.emit("obs:state:changed", { state: this.getState() });
  }

  private handleDisconnect(): void {
    const wasStreaming = this.state.commandedState.streaming;
    const wasRecording = this.state.commandedState.recording;
    this.updateState({ connected: false, streaming: false, recording: false });

    eventBus.emit("obs:error", {
      error: new ObsError("OBS_UNREACHABLE", "OBS connection lost") as ObsError & { code: "OBS_UNREACHABLE" },
      retryExhausted: false,
      context: { streaming: wasStreaming, recording: wasRecording },
    });

    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryExhausted) return;
    if (this.retryAttempt >= this.retry.maxAttempts) {
      this.retryExhausted = true;
      eventBus.emit("obs:error", {
        error: new ObsError("OBS_UNREACHABLE", "Reconnection attempts exhausted") as ObsError & { code: "OBS_UNREACHABLE" },
        retryExhausted: true,
        context: { streaming: this.state.commandedState.streaming, recording: this.state.commandedState.recording },
      });
      return;
    }

    const delay = Math.min(
      this.retry.initialDelayMs * Math.pow(this.retry.backoffFactor, this.retryAttempt) + Math.random() * this.retry.jitterMs,
      this.retry.maxDelayMs,
    );

    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      void this.connect();
    }, delay);
  }
}

// Singleton factory — used by index.ts. Tests inject their own instance.
let _obsService: ObsService | null = null;

export function getObsService(db: Database): ObsService {
  if (!_obsService) _obsService = new ObsService(db);
  return _obsService;
}

export function resetObsService(): void {
  _obsService?.destroy();
  _obsService = null;
}
