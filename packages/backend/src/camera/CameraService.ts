import type { Database } from "better-sqlite3";
import type { CameraState, CameraPreset, PositionInquiry, CameraMetadata } from "@invisible-av-booth/shared";
import type { AiTrackingDriver } from "./CameraControlInterface.js";
import { ViscaCameraDriver } from "./ViscaCameraDriver.js";
import { TongveoAiDriver } from "./TongveoAiDriver.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";
import { logger } from "../logger.js";
import { decrypt } from "../crypto.js";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";

// ── Constants ────────────────────────────────────────────────────────────────

export const KEEPALIVE_TIMEOUT_MS = 750;
export const ADAPTIVE_SPEED_DAMPING = 0.7;
export const MAX_EFFECTIVE_SPEED = 0.6;
const VISCA_POLL_INTERVAL_MS = 5000;

// ── Types ────────────────────────────────────────────────────────────────────

interface MoveSession {
  timeout: ReturnType<typeof setTimeout>;
  currentPan: number;
  currentTilt: number;
}

interface CameraInstance {
  id: string;
  viscaDriver: ViscaCameraDriver | null;
  aiDriver: AiTrackingDriver | null;
  state: CameraState;
  pollTimer: ReturnType<typeof setInterval> | null;
  ndiSourceName: string;
  ndiExtraIPs: string | null;
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
  private previewManager: PreviewStreamManager | null;

  constructor(database: Database, previewManager?: PreviewStreamManager) {
    this.database = database;
    this.previewManager = previewManager ?? null;
  }

  async initialize(): Promise<void> {
    const rows = this.database
      .prepare("SELECT id, label, host, port, metadata, features FROM device_connections WHERE deviceType = 'camera-ptz' AND enabled = 1")
      .all() as Array<{ id: string; label: string; host: string; port: number; metadata: string; features: string }>;

    logger.info(`CameraService: found ${rows.length} camera(s)`);
    for (const row of rows) {
      const meta: CameraMetadata = JSON.parse(row.metadata);
      const presets = this.loadPresets(row.id);
      const features = meta.cameraFeatures ?? [];

      const ndiExtraIPs = meta.ndiExtraIPs ?? (meta.viscaEnabled ? row.host : null);
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

      const instance: CameraInstance = { id: row.id, viscaDriver, aiDriver, state, pollTimer: null, ndiSourceName: meta.ndiSourceName, ndiExtraIPs: ndiExtraIPs ?? null };
      this.cameras.set(row.id, instance);

      // Register NDI source with preview manager (GStreamer handles receive)
      if (this.previewManager) {
        const sourceId = `camera-${instance.id}`;
        this.previewManager.setSourceAvailable(sourceId, true, meta.ndiSourceName);
        instance.state.connected = true;
        this.broadcastState(instance);
        logger.info(`Camera preview registered: "${row.label}" (${meta.ndiSourceName})`);
      }

      // Start VISCA polling if available
      if (viscaDriver) {
        viscaDriver.connect().then((ok) => {
          if (ok) {
            logger.info(`VISCA connected for camera "${row.label}"`);
            instance.pollTimer = setInterval(() => this.pollPosition(instance), VISCA_POLL_INTERVAL_MS);
          } else {
            logger.warn(`VISCA connection failed for camera "${row.label}"`);
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
    // Pause polling during movement to avoid command conflicts
    if (instance.pollTimer) { clearInterval(instance.pollTimer); instance.pollTimer = null; }
    if (instance.viscaDriver) {
      logger.debug("VISCA panTiltSpeed call", { context: { cameraId, adjPan, adjTilt, connected: instance.viscaDriver.isConnected() } });
      instance.viscaDriver.panTiltSpeed(adjPan, adjTilt);
    } else {
      logger.warn("No VISCA driver for camera", { context: { cameraId } });
    }
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
      if (instance.viscaDriver) instance.viscaDriver.panTiltSpeed(adjPan, adjTilt);
    }
  }

  stopMove(cameraId: string): void {
    const session = this.moveSessions.get(cameraId);
    if (session) {
      clearTimeout(session.timeout);
      this.moveSessions.delete(cameraId);
    }
    const instance = this.cameras.get(cameraId);
    if (instance?.viscaDriver) {
      instance.viscaDriver.stop();
      // Resume polling after movement ends
      if (!instance.pollTimer) {
        instance.pollTimer = setInterval(() => this.pollPosition(instance), VISCA_POLL_INTERVAL_MS);
      }
    }
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
      if (instance.viscaDriver) await instance.viscaDriver.zoomAbsolute(payload.zoom);
      if (instance.state.position) instance.state.position.zoom = payload.zoom;
    }

    if (payload.autoFocus !== undefined) {
      if (payload.autoFocus && instance.viscaDriver) {
        await instance.viscaDriver.focusAuto();
      }
      instance.state.autoFocus = payload.autoFocus;
    }

    if (payload.focus !== undefined && !instance.state.autoFocus) {
      if (instance.viscaDriver) await instance.viscaDriver.focusManual(payload.focus);
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

    await instance.viscaDriver!.panTiltAbsolute(currentPan + panDelta, currentTilt + tiltDelta);
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
    if (instance.viscaDriver) {
      if (preset.zoom !== null) await instance.viscaDriver.zoomAbsolute(preset.zoom);
      if (preset.pan !== null && preset.tilt !== null) await instance.viscaDriver.panTiltAbsolute(preset.pan, preset.tilt);
      if (preset.autoFocus) {
        await instance.viscaDriver.focusAuto();
      } else if (preset.focus !== null) {
        await instance.viscaDriver.focusManual(preset.focus);
      }
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
      instance.viscaDriver?.disconnect();
    }
    this.cameras.clear();
  }

  // ── Private ──────────────────────────────────────────────────────────────

  private deadManStop(cameraId: string): void {
    this.moveSessions.delete(cameraId);
    const instance = this.cameras.get(cameraId);
    if (instance?.viscaDriver) {
      instance.viscaDriver.stop();
      if (!instance.pollTimer) {
        instance.pollTimer = setInterval(() => this.pollPosition(instance), VISCA_POLL_INTERVAL_MS);
      }
    }
  }

  private async pollPosition(instance: CameraInstance): Promise<void> {
    if (this.destroyed || !instance.viscaDriver) return;
    // Skip polling when no dashboard client is viewing this camera
    if (this.previewManager && this.previewManager.getSubscriberCount(`camera-${instance.id}`) === 0) return;
    try {
      const pos = await instance.viscaDriver.inquirePosition();
      // Only update fields that have actual values (null = inquiry failed)
      const prev = instance.state.position ?? { pan: null, tilt: null, zoom: null, focus: null, autoFocus: null };
      const merged = {
        pan: pos.pan ?? prev.pan,
        tilt: pos.tilt ?? prev.tilt,
        zoom: pos.zoom ?? prev.zoom,
        focus: pos.focus ?? prev.focus,
        autoFocus: pos.autoFocus ?? prev.autoFocus,
      };
      const changed =
        merged.pan !== prev.pan ||
        merged.tilt !== prev.tilt ||
        merged.zoom !== prev.zoom ||
        merged.focus !== prev.focus;
      instance.state.position = merged;
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
