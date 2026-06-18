import type { Database } from "better-sqlite3";
import type { CameraState, CameraPreset, PositionInquiry, CameraMetadata } from "@invisible-av-booth/shared";
import type { CameraControlInterface, AiTrackingDriver } from "./CameraControlInterface.js";
import type { Writable } from "stream";
import { NdiCameraDriver } from "./NdiCameraDriver.js";
import { ViscaCameraDriver } from "./ViscaCameraDriver.js";
import { TongveoAiDriver } from "./TongveoAiDriver.js";
import { NdiFramePipe, buildNdiInputArgs } from "./ndiFramePipe.js";
import { getNdiModule, isNdiAvailable, loadNdi } from "./ndiLoader.js";
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
  ndiDriver: CameraControlInterface;
  viscaDriver: ViscaCameraDriver | null;
  aiDriver: AiTrackingDriver | null;
  state: CameraState;
  pollTimer: ReturnType<typeof setInterval> | null;
  framePipe: NdiFramePipe | null;
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
    await loadNdi();
    const rows = this.database
      .prepare("SELECT id, label, host, port, metadata, features FROM device_connections WHERE deviceType = 'camera-ptz' AND enabled = 1")
      .all() as Array<{ id: string; label: string; host: string; port: number; metadata: string; features: string }>;

    logger.info(`CameraService: found ${rows.length} camera(s)`);
    for (const row of rows) {
      const meta: CameraMetadata = JSON.parse(row.metadata);
      const presets = this.loadPresets(row.id);
      const features = meta.cameraFeatures ?? [];

      const ndiExtraIPs = meta.ndiExtraIPs ?? (meta.viscaEnabled ? row.host : null);
      const ndiDriver = new NdiCameraDriver(meta.ndiSourceName, ndiExtraIPs ?? undefined);
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

      const instance: CameraInstance = { id: row.id, ndiDriver, viscaDriver, aiDriver, state, pollTimer: null, framePipe: null, ndiSourceName: meta.ndiSourceName, ndiExtraIPs: ndiExtraIPs ?? null };
      this.cameras.set(row.id, instance);

      // Connect asynchronously
      if (isNdiAvailable()) {
        logger.info(`Attempting NDI connect for camera "${row.label}" (${meta.ndiSourceName})`);
        ndiDriver.connect().then((ok) => {
          instance.state.connected = ok;
          this.broadcastState(instance);
          if (ok && this.previewManager) {
            this.startCameraPreview(instance);
          }
        });
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
      if (instance.framePipe) instance.framePipe.destroy();
      instance.ndiDriver.disconnect();
      instance.viscaDriver?.disconnect();
    }
    this.cameras.clear();
  }

  // ── Camera Preview ───────────────────────────────────────────────────────

  private startCameraPreview(instance: CameraInstance): void {
    if (!this.previewManager || this.destroyed) return;

    const ndi = getNdiModule();
    if (!ndi) return;

    const mod = ndi.default ?? ndi;
    const sourceId = `camera-${instance.id}`;
    const framePipe = new NdiFramePipe(instance.ndiSourceName);
    instance.framePipe = framePipe;

    const poll = async (): Promise<void> => {
      try {
        const findOpts: Record<string, unknown> = { showLocalSources: true };
        if (instance.ndiExtraIPs) findOpts["extraIPs"] = instance.ndiExtraIPs;

        // Retry finding the source (may not be discovered immediately)
        let source = null;
        for (let attempt = 0; attempt < 3 && !this.destroyed; attempt++) {
          const finder = await mod.find(findOpts);
          if (finder.wait) finder.wait(3000);
          const sources = finder.sources ? finder.sources() : finder;
          source = (Array.isArray(sources) ? sources : []).find((s: { name: string }) => s.name === instance.ndiSourceName);
          if (finder.destroy) finder.destroy();
          if (source) break;
          logger.debug(`Camera preview [${instance.ndiSourceName}]: source not found, retry ${attempt + 1}/3`);
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (!source) {
          logger.warn(`Camera preview [${instance.ndiSourceName}]: NDI source not found after retries`);
          return;
        }
        const receiver = await mod.receive({ source, colorFormat: mod.COLOR_FORMAT_BEST ?? mod.COLOR_FORMAT_BGRX_BGRA ?? 101 });

        // Wait for first video frame to detect format
        let format = framePipe.getFormat();
        if (!format) {
          for (let i = 0; i < 300 && !this.destroyed; i++) {
            try {
              const frame = await receiver.data(1000);
              if (frame?.type === "video" && frame.data) {
                framePipe.pushFrame(frame);
                format = framePipe.getFormat();
                if (format) break;
              }
            } catch { /* timeout, retry */ }
          }
        }
        if (!format || this.destroyed) {
          logger.warn(`Camera preview [${instance.ndiSourceName}]: failed to detect frame format`);
          return;
        }

        // Register source — onStdinReady attaches the pipe each time FFmpeg spawns
        const inputArgs = buildNdiInputArgs(format);
        this.previewManager!.setSourceAvailable(
          sourceId,
          true,
          "pipe:0",
          (stdin) => framePipe.attach(stdin as Writable),
          inputArgs,
        );
        logger.info(`Camera preview [${instance.ndiSourceName}]: source registered, awaiting subscribers`);

        // Main loop — just push frames when attached
        while (!this.destroyed && instance.framePipe === framePipe) {
          try {
            const frame = await receiver.data(5000);
            if (!frame) continue;
            if (frame.type === "video" && frame.data) {
              if (!framePipe.isAttached()) continue;
              framePipe.pushFrame(frame);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (msg.includes("timeout") || msg.includes("Timeout")) continue;
            logger.warn(`Camera preview [${instance.ndiSourceName}]: receive error — exiting loop`, { context: { error: msg } });
            framePipe.detach();
            this.previewManager!.setSourceAvailable(sourceId, false, "pipe:0");
            break;
          }
        }
        // Log why loop exited
        if (this.destroyed) {
          logger.info(`Camera preview [${instance.ndiSourceName}]: loop exited — service destroyed`);
        } else if (instance.framePipe !== framePipe) {
          logger.info(`Camera preview [${instance.ndiSourceName}]: loop exited — framePipe replaced`);
        } else {
          logger.warn(`Camera preview [${instance.ndiSourceName}]: loop exited — unknown reason`);
        }
      } catch (err) {
        logger.error(`Camera "${instance.ndiSourceName}" preview failed to start`, { context: { error: String(err) } });
      }
    };
    poll();
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
