import type { Database } from "better-sqlite3";
import type { CameraState, CameraPreset, PositionInquiry, CameraMetadata } from "@invisible-av-booth/shared";
import type { CameraControlInterface, AiTrackingDriver } from "./CameraControlInterface.js";
import { NdiCameraDriver } from "./NdiCameraDriver.js";
import { ViscaCameraDriver } from "./ViscaCameraDriver.js";
import { TongveoAiDriver } from "./TongveoAiDriver.js";
import { isNdiAvailable } from "./ndiLoader.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";
import { logger } from "../logger.js";
import { decrypt } from "../crypto.js";

// ── Constants ────────────────────────────────────────────────────────────────

export const KEEPALIVE_TIMEOUT_MS = 750;
export const ADAPTIVE_SPEED_DAMPING = 0.7;
export const MAX_EFFECTIVE_SPEED = 0.6;
const VISCA_POLL_INTERVAL_MS = 2000;

// ── Types ────────────────────────────────────────────────────────────────────

interface MoveSession {
  timeout: ReturnType<typeof setTimeout>;
  currentPan: number;
  currentTilt: number;
}

interface CameraInstance {
  id: string;
  ndiDriver: CameraControlInterface;
  viscaDriver: ViscaCameraDriver | null;
  aiDriver: AiTrackingDriver | null;
  state: CameraState;
  pollTimer: ReturnType<typeof setInterval> | null;
}

// ── Exported utility ─────────────────────────────────────────────────────────

export function applyAdaptiveSpeed(requestedSpeed: number, zoomLevel: number): number {
  const scaled = requestedSpeed * (1.0 - zoomLevel * ADAPTIVE_SPEED_DAMPING);
  return Math.min(Math.abs(scaled), MAX_EFFECTIVE_SPEED) * Math.sign(scaled);
}

export function computeFov(fovWideAngle: number, zoom: number, opticalZoomRatio: number): number {
  return fovWideAngle / (1 + zoom * (opticalZoomRatio - 1));
}

// ── Service ──────────────────────────────────────────────────────────────────

export class CameraService {
  private database: Database;
  private cameras = new Map<string, CameraInstance>();
  private moveSessions = new Map<string, MoveSession>();
  private destroyed = false;

  constructor(database: Database) {
    this.database = database;
  }

  async initialize(): Promise<void> {
    const rows = this.database
      .prepare("SELECT id, label, host, port, metadata, features FROM device_connections WHERE deviceType = 'camera-ptz' AND enabled = 1")
      .all() as Array<{ id: string; label: string; host: string; port: number; metadata: string; features: string }>;

    for (const row of rows) {
      const meta: CameraMetadata = JSON.parse(row.metadata);
      const presets = this.loadPresets(row.id);
      const features = meta.cameraFeatures ?? [];

      const ndiDriver = new NdiCameraDriver(meta.ndiSourceName);
      let viscaDriver: ViscaCameraDriver | null = null;
      let aiDriver: AiTrackingDriver | null = null;

      if (meta.viscaEnabled) {
        viscaDriver = new ViscaCameraDriver(row.host, row.port);
      } else {
        logger.warn(`Camera '${row.label}' uses NDI-only — position state is based on commanded values and may drift if the camera is controlled externally.`);
      }

      if (meta.cameraModel !== "generic" && meta.aiHttpCookie && meta.aiCredentialId) {
        try {
          const cookie = decrypt(meta.aiHttpCookie);
          const credId = decrypt(meta.aiCredentialId);
          aiDriver = new TongveoAiDriver(row.host, cookie, credId);
        } catch {
          logger.error(`Failed to decrypt AI credentials for camera ${row.id}`);
        }
      }

      const state: CameraState = {
        cameraId: row.id,
        connected: false,
        position: null,
        autoFocus: true,
        aiTracking: false,
        aiTilt: false,
        aiZoom: false,
        activePresetId: null,
        features,
        capabilities: { tapToCenter: meta.viscaEnabled },
        presets,
      };

      const instance: CameraInstance = { id: row.id, ndiDriver, viscaDriver, aiDriver, state, pollTimer: null };
      this.cameras.set(row.id, instance);

      // Connect asynchronously
      if (isNdiAvailable()) {
        ndiDriver.connect().then((ok) => {
          instance.state.connected = ok;
          this.broadcastState(instance);
        });
      }

      // Start VISCA polling if available
      if (viscaDriver) {
        viscaDriver.connect().then((ok) => {
          if (ok) {
            instance.pollTimer = setInterval(() => this.pollPosition(instance), VISCA_POLL_INTERVAL_MS);
          }
        });
      }
    }
  }

  getCameraState(cameraId: string): CameraState | null {
    return this.cameras.get(cameraId)?.state ?? null;
  }

  getAllCameraStates(): CameraState[] {
    return [...this.cameras.values()].map((c) => c.state);
  }

  // ── PTZ commands ─────────────────────────────────────────────────────────

  startMove(cameraId: string, panSpeed: number, tiltSpeed: number): void {
    const instance = this.cameras.get(cameraId);
    if (!instance) return;

    const zoom = instance.state.position?.zoom ?? 0;
    const adjPan = applyAdaptiveSpeed(panSpeed, zoom);
    const adjTilt = applyAdaptiveSpeed(tiltSpeed, zoom);

    // Clear existing session
    const existing = this.moveSessions.get(cameraId);
    if (existing) clearTimeout(existing.timeout);

    const session: MoveSession = {
      currentPan: adjPan,
      currentTilt: adjTilt,
      timeout: setTimeout(() => this.deadManStop(cameraId), KEEPALIVE_TIMEOUT_MS),
    };
    this.moveSessions.set(cameraId, session);
    instance.ndiDriver.panTiltSpeed(adjPan, adjTilt);
  }

  keepAliveMove(cameraId: string, panSpeed: number, tiltSpeed: number): void {
    const session = this.moveSessions.get(cameraId);
    if (!session) return; // stale keepalive

    const instance = this.cameras.get(cameraId);
    if (!instance) return;

    clearTimeout(session.timeout);
    session.timeout = setTimeout(() => this.deadManStop(cameraId), KEEPALIVE_TIMEOUT_MS);

    const zoom = instance.state.position?.zoom ?? 0;
    const adjPan = applyAdaptiveSpeed(panSpeed, zoom);
    const adjTilt = applyAdaptiveSpeed(tiltSpeed, zoom);

    if (adjPan !== session.currentPan || adjTilt !== session.currentTilt) {
      session.currentPan = adjPan;
      session.currentTilt = adjTilt;
      instance.ndiDriver.panTiltSpeed(adjPan, adjTilt);
    }
  }

  stopMove(cameraId: string): void {
    const session = this.moveSessions.get(cameraId);
    if (session) {
      clearTimeout(session.timeout);
      this.moveSessions.delete(cameraId);
    }
    const instance = this.cameras.get(cameraId);
    if (instance) instance.ndiDriver.stop();
  }

  // ── Camera set (partial state) ───────────────────────────────────────────

  async applySet(
    cameraId: string,
    payload: { zoom?: number; focus?: number; autoFocus?: boolean; aiTracking?: boolean; aiTilt?: boolean; aiZoom?: boolean },
  ): Promise<void> {
    const instance = this.cameras.get(cameraId);
    if (!instance) return;

    // Clear active preset on any manual change
    if (instance.state.activePresetId !== null) {
      instance.state.activePresetId = null;
    }

    if (payload.zoom !== undefined) {
      await instance.ndiDriver.zoomAbsolute(payload.zoom);
      if (instance.state.position) instance.state.position.zoom = payload.zoom;
    }

    if (payload.autoFocus !== undefined) {
      if (payload.autoFocus) {
        await instance.ndiDriver.focusAuto();
      }
      instance.state.autoFocus = payload.autoFocus;
    }

    if (payload.focus !== undefined && !instance.state.autoFocus) {
      await instance.ndiDriver.focusManual(payload.focus);
      if (instance.state.position) instance.state.position.focus = payload.focus;
    }

    if (payload.aiTracking !== undefined || payload.aiTilt !== undefined || payload.aiZoom !== undefined) {
      if (payload.aiTracking !== undefined) instance.state.aiTracking = payload.aiTracking;
      if (payload.aiTilt !== undefined) instance.state.aiTilt = payload.aiTilt;
      if (payload.aiZoom !== undefined) instance.state.aiZoom = payload.aiZoom;

      if (instance.aiDriver) {
        await instance.aiDriver.setAiState(instance.state.aiTracking, instance.state.aiTilt, instance.state.aiZoom);
      }
    }

    this.broadcastState(instance);
  }

  // ── Tap to center ────────────────────────────────────────────────────────

  async tapToCenter(cameraId: string, offsetX: number, offsetY: number, meta: CameraMetadata): Promise<{ success: boolean; error?: string }> {
    const instance = this.cameras.get(cameraId);
    if (!instance) return { success: false, error: "Camera not found" };
    if (!instance.viscaDriver || !instance.viscaDriver.isConnected()) {
      return { success: false, error: "VISCA not configured — tap-to-center unavailable" };
    }

    const zoom = instance.state.position?.zoom ?? 0;
    const fov = computeFov(meta.fovWideAngle, zoom, meta.opticalZoomRatio);
    const panDelta = offsetX * (fov / 2) * (Math.PI / 180);
    const tiltDelta = instance.state.aiTilt ? 0 : offsetY * (fov / 2) * (Math.PI / 180);

    const currentPan = instance.state.position?.pan ?? 0;
    const currentTilt = instance.state.position?.tilt ?? 0;

    await instance.ndiDriver.panTiltAbsolute(currentPan + panDelta, currentTilt + tiltDelta);
    instance.state.activePresetId = null;
    this.broadcastState(instance);
    return { success: true };
  }

  // ── Preset activation ────────────────────────────────────────────────────

  async activatePreset(cameraId: string, presetId: string): Promise<{ success: boolean; error?: string }> {
    const instance = this.cameras.get(cameraId);
    if (!instance) return { success: false, error: "Camera not found" };

    const preset = instance.state.presets.find((p) => p.id === presetId);
    if (!preset) return { success: false, error: "Preset not found" };

    // Set active immediately (optimistic)
    instance.state.activePresetId = presetId;
    this.broadcastState(instance);

    if (preset.storedOnCamera && preset.cameraPresetSlot !== null) {
      // On-camera recall — would use VISCA preset recall command
      // For now, fall through to software positioning
    }

    // Apply position
    if (preset.zoom !== null) await instance.ndiDriver.zoomAbsolute(preset.zoom);
    if (preset.pan !== null && preset.tilt !== null) await instance.ndiDriver.panTiltAbsolute(preset.pan, preset.tilt);
    if (preset.autoFocus) {
      await instance.ndiDriver.focusAuto();
    } else if (preset.focus !== null) {
      await instance.ndiDriver.focusManual(preset.focus);
    }

    // Apply toggles
    instance.state.autoFocus = preset.autoFocus;
    instance.state.aiTracking = preset.aiTracking;
    instance.state.aiTilt = preset.aiTilt;
    instance.state.aiZoom = preset.aiZoom;

    if (instance.aiDriver) {
      await instance.aiDriver.setAiState(preset.aiTracking, preset.aiTilt, preset.aiZoom);
    }

    this.broadcastState(instance);
    return { success: true };
  }

  capturePosition(cameraId: string): PositionInquiry | null {
    const instance = this.cameras.get(cameraId);
    if (!instance) return null;
    return instance.state.position;
  }

  destroy(): void {
    this.destroyed = true;
    for (const session of this.moveSessions.values()) {
      clearTimeout(session.timeout);
    }
    this.moveSessions.clear();
    for (const instance of this.cameras.values()) {
      if (instance.pollTimer) clearInterval(instance.pollTimer);
      instance.ndiDriver.disconnect();
      instance.viscaDriver?.disconnect();
    }
    this.cameras.clear();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private deadManStop(cameraId: string): void {
    this.moveSessions.delete(cameraId);
    const instance = this.cameras.get(cameraId);
    if (instance) instance.ndiDriver.stop();
  }

  private async pollPosition(instance: CameraInstance): Promise<void> {
    if (this.destroyed || !instance.viscaDriver) return;
    try {
      const pos = await instance.viscaDriver.inquirePosition();
      const changed =
        pos.pan !== instance.state.position?.pan ||
        pos.tilt !== instance.state.position?.tilt ||
        pos.zoom !== instance.state.position?.zoom ||
        pos.focus !== instance.state.position?.focus;
      instance.state.position = pos;
      if (pos.autoFocus !== null) instance.state.autoFocus = pos.autoFocus;
      if (changed) this.broadcastState(instance);
    } catch {
      // poll failed, skip
    }
  }

  private broadcastState(instance: CameraInstance): void {
    eventBus.emit(BUS_CAMERA_STATE_CHANGED, { cameraId: instance.id, state: instance.state });
  }

  private loadPresets(cameraId: string): CameraPreset[] {
    return this.database.prepare("SELECT * FROM camera_presets WHERE cameraId = ? ORDER BY sortOrder").all(cameraId) as CameraPreset[];
  }
}
