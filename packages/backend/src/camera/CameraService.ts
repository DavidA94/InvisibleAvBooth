import type { Database } from "better-sqlite3";
import type { CameraState, CameraPreset, PositionInquiry, CameraMetadata } from "@invisible-av-booth/shared";
import type { AiTrackingDriver } from "./CameraControlInterface.js";
import { ViscaCameraDriver } from "./ViscaCameraDriver.js";
import { TongveoAiDriver } from "./TongveoAiDriver.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED, BUS_CAMERA_PRESETS_CHANGED, BUS_CAMERA_DEVICE_CHANGED } from "../eventBus/types.js";
import { logger } from "../logger.js";
import { decrypt } from "../crypto.js";
import type { PreviewStreamManager } from "../services/previewStreamManager.js";

// ── Constants ────────────────────────────────────────────────────────────────

export const KEEPALIVE_TIMEOUT_MS = 750;
export const ADAPTIVE_SPEED_DAMPING = 0.7;
export const MAX_EFFECTIVE_SPEED = 0.6;
const VISCA_POLL_INTERVAL_MS = 5000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

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
  metadata: CameraMetadata;
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

/**
 * Compute the FOV at a given zoom fraction.
 * If fovTeleAngle is provided, uses logarithmic interpolation (matches optical zoom curves).
 * Otherwise falls back to the ratio-based formula.
 */
export function computeFov(fovWideAngle: number, zoomFraction: number, opticalZoomRatio: number, fovTeleAngle?: number): number {
  if (fovTeleAngle !== undefined) {
    // Logarithmic: fovWide * (fovTele / fovWide) ^ zoomFraction
    return fovWideAngle * Math.pow(fovTeleAngle / fovWideAngle, zoomFraction);
  }
  return fovWideAngle / (1 + zoomFraction * (opticalZoomRatio - 1));
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
        label: row.label,
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
        ...(meta.zoomMin !== undefined ? { zoomMin: meta.zoomMin } : {}),
        ...(meta.zoomMax !== undefined ? { zoomMax: meta.zoomMax } : {}),
        ...(meta.panMin !== undefined ? { panMin: meta.panMin } : {}),
        ...(meta.panMax !== undefined ? { panMax: meta.panMax } : {}),
        ...(meta.tiltMin !== undefined ? { tiltMin: meta.tiltMin } : {}),
        ...(meta.tiltMax !== undefined ? { tiltMax: meta.tiltMax } : {}),
      };

      const instance: CameraInstance = {
        id: row.id,
        viscaDriver,
        aiDriver,
        metadata: meta,
        state,
        pollTimer: null,
        ndiSourceName: meta.ndiSourceName,
        ndiExtraIPs: ndiExtraIPs ?? null,
      };
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

    // Subscribe to preset changes so activatePreset uses current data
    eventBus.subscribe(BUS_CAMERA_PRESETS_CHANGED, ({ cameraId, presets }) => {
      const instance = this.cameras.get(cameraId);
      if (instance) {
        instance.state.presets = presets as CameraPreset[];
        this.broadcastState(instance);
      }
    });

    // Subscribe to camera device config changes for hot-reload
    eventBus.subscribe(BUS_CAMERA_DEVICE_CHANGED, ({ action, deviceId }) => {
      logger.info(`Camera device ${action}: ${deviceId} — reloading`);
      void this.reloadCamera(deviceId, action as "created" | "updated" | "deleted");
    });
  }

  getCameraState(cameraId: string): CameraState | null {
    return this.cameras.get(cameraId)?.state ?? null;
  }

  getCameraMetadata(cameraId: string): CameraMetadata | null {
    return this.cameras.get(cameraId)?.metadata ?? null;
  }

  getAllCameraStates(): CameraState[] {
    return [...this.cameras.values()].map((c) => c.state);
  }

  // ── PTZ commands ─────────────────────────────────────────────────────────

  startMove(cameraId: string, panSpeed: number, tiltSpeed: number): void {
    const instance = this.cameras.get(cameraId);
    if (!instance) return;

    // Clear active preset on manual joystick movement (Req 6.6)
    if (instance.state.activePresetId !== null) {
      instance.state.activePresetId = null;
      this.broadcastState(instance);
    }

    // Normalize zoom to 0-1 for adaptive speed calculation
    const zoomRaw = instance.state.position?.zoom ?? 0;
    const zoomMin = instance.metadata.zoomMin ?? 0;
    const zoomMax = instance.metadata.zoomMax ?? 16384;
    const zoomFraction = zoomMax > zoomMin ? (zoomRaw - zoomMin) / (zoomMax - zoomMin) : 0;
    const adjPan = applyAdaptiveSpeed(panSpeed, zoomFraction);
    const adjTilt = applyAdaptiveSpeed(tiltSpeed, zoomFraction);

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
    if (instance.pollTimer) {
      clearInterval(instance.pollTimer);
      instance.pollTimer = null;
    }
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

    const zoomRaw = instance.state.position?.zoom ?? 0;
    const zoomMin = instance.metadata.zoomMin ?? 0;
    const zoomMax = instance.metadata.zoomMax ?? 16384;
    const zoomFraction = zoomMax > zoomMin ? (zoomRaw - zoomMin) / (zoomMax - zoomMin) : 0;
    const adjPan = applyAdaptiveSpeed(panSpeed, zoomFraction);
    const adjTilt = applyAdaptiveSpeed(tiltSpeed, zoomFraction);

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

    // Poll fresh position before calculating — ensures consecutive taps work correctly
    try {
      const freshPos = await instance.viscaDriver.inquirePosition();
      if (freshPos.pan !== null) instance.state.position = { ...instance.state.position!, pan: freshPos.pan };
      if (freshPos.tilt !== null) instance.state.position = { ...instance.state.position!, tilt: freshPos.tilt };
      if (freshPos.zoom !== null) instance.state.position = { ...instance.state.position!, zoom: freshPos.zoom };
    } catch {
      // Use last known position if poll fails
    }

    // Current raw position
    const currentPan = instance.state.position?.pan ?? 0;
    const currentTilt = instance.state.position?.tilt ?? 0;
    const zoomRaw = instance.state.position?.zoom ?? 0;

    // Compute zoom as 0-1 fraction for FOV calculation
    const zoomMin = meta.zoomMin ?? 0;
    const zoomMax = meta.zoomMax ?? 16384;
    const zoomFraction = zoomMax > zoomMin ? (zoomRaw - zoomMin) / (zoomMax - zoomMin) : 0;

    // FOV at current zoom level
    const fovDegrees = computeFov(meta.fovWideAngle, zoomFraction, meta.opticalZoomRatio, meta.fovTeleAngle);

    // Total mechanical range in degrees and raw units
    const panTotalDegrees = meta.panTotalDegrees ?? 350;
    const tiltTotalDegrees = meta.tiltTotalDegrees ?? 180;
    const panMin = meta.panMin ?? 0;
    const panMax = meta.panMax ?? 65535;
    const tiltMin = meta.tiltMin ?? 0;
    const tiltMax = meta.tiltMax ?? 65535;
    const panRawRange = panMax - panMin;
    const tiltRawRange = tiltMax - tiltMin;

    // Horizontal FOV is fovDegrees. Vertical FOV from metadata or estimated from aspect ratio.
    const verticalFovDegrees = meta.verticalFovWideAngle
      ? computeFov(meta.verticalFovWideAngle, zoomFraction, meta.opticalZoomRatio, meta.verticalFovTeleAngle)
      : fovDegrees * (9 / 16);

    // Convert tap offset to angular offset using rectilinear lens projection.
    // A point at pixel offset `p` from center is at angle atan(p * tan(fov/2)) from optical axis.
    // This is larger than the linear approximation (p * fov/2) for points far from center.
    const hHalfFovRad = (fovDegrees / 2) * (Math.PI / 180);
    const vHalfFovRad = (verticalFovDegrees / 2) * (Math.PI / 180);
    const panAngleDeg = Math.atan(offsetX * Math.tan(hHalfFovRad)) * (180 / Math.PI);
    const tiltAngleDeg = Math.atan(-offsetY * Math.tan(vHalfFovRad)) * (180 / Math.PI);

    // Convert angular offset to raw position delta
    // rawUnitsPerDegree = panRawRange / panTotalDegrees
    const panDelta = panAngleDeg * (panRawRange / panTotalDegrees);
    const tiltDelta = instance.state.aiTilt ? 0 : tiltAngleDeg * (tiltRawRange / tiltTotalDegrees);

    let targetPan = Math.round(currentPan + panDelta);
    let targetTilt = Math.round(currentTilt + tiltDelta);

    // Clamp to discovered ranges
    targetPan = Math.max(panMin, Math.min(panMax, targetPan));
    targetTilt = Math.max(tiltMin, Math.min(tiltMax, targetTilt));

    logger.debug("Tap-to-center step-by-step", {
      context: {
        step1_clickOffset: `offsetX=${offsetX.toFixed(4)}, offsetY=${offsetY.toFixed(4)} (range: -1=left/top edge, 0=center, 1=right/bottom edge)`,
        step2_currentPosition: `pan=${currentPan}, tilt=${currentTilt}, zoom=${zoomRaw}`,
        step3_zoomFraction: `(${zoomRaw} - ${zoomMin}) / (${zoomMax} - ${zoomMin}) = ${zoomFraction.toFixed(4)}`,
        step4_fov: `fovWideAngle / (1 + zoomFraction * (opticalZoomRatio - 1)) = ${meta.fovWideAngle} / (1 + ${zoomFraction.toFixed(4)} * ${meta.opticalZoomRatio - 1}) = ${fovDegrees.toFixed(2)}°`,
        step5_angularOffset: `panAngle = ${offsetX.toFixed(4)} * (${fovDegrees.toFixed(2)}/2) = ${panAngleDeg.toFixed(4)}°, tiltAngle = ${(-offsetY).toFixed(4)} * (${verticalFovDegrees.toFixed(2)}/2) = ${tiltAngleDeg.toFixed(4)}°`,
        step6_rawUnitsPerDegree: `pan: ${panRawRange}/${panTotalDegrees} = ${(panRawRange / panTotalDegrees).toFixed(2)} units/°, tilt: ${tiltRawRange}/${tiltTotalDegrees} = ${(tiltRawRange / tiltTotalDegrees).toFixed(2)} units/°`,
        step7_delta: `panDelta = ${panAngleDeg.toFixed(4)}° * ${(panRawRange / panTotalDegrees).toFixed(2)} = ${panDelta.toFixed(2)}, tiltDelta = ${tiltAngleDeg.toFixed(4)}° * ${(tiltRawRange / tiltTotalDegrees).toFixed(2)} = ${tiltDelta.toFixed(2)}`,
        step8_target: `targetPan = ${currentPan} + ${panDelta.toFixed(2)} = ${targetPan}, targetTilt = ${currentTilt} + ${tiltDelta.toFixed(2)} = ${targetTilt}`,
        step9_clamp: `pan clamped to [${panMin}, ${panMax}], tilt clamped to [${tiltMin}, ${tiltMax}]`,
      },
    });

    await instance.viscaDriver!.panTiltAbsolute(targetPan, targetTilt);
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

    if (preset.storedOnCamera && preset.cameraPresetSlot !== null && instance.viscaDriver) {
      // On-camera recall — faster and smoother than software positioning
      logger.debug("Activating on-camera preset", { context: { presetId, slot: preset.cameraPresetSlot, name: preset.name } });
      await instance.viscaDriver.presetRecall(preset.cameraPresetSlot);
    } else if (instance.viscaDriver) {
      // Software positioning — send each axis individually
      logger.debug("Activating software preset", {
        context: {
          presetId,
          name: preset.name,
          pan: preset.pan,
          tilt: preset.tilt,
          zoom: preset.zoom,
          focus: preset.focus,
          autoFocus: preset.autoFocus,
        },
      });
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

  async capturePosition(cameraId: string): Promise<PositionInquiry | null> {
    const instance = this.cameras.get(cameraId);
    if (!instance) return null;
    if (!instance.viscaDriver || !instance.viscaDriver.isConnected()) {
      return instance.state.position;
    }
    // Fresh poll from camera for accurate capture
    try {
      const pos = await instance.viscaDriver.inquirePosition();
      instance.state.position = pos;
      return pos;
    } catch {
      return instance.state.position;
    }
  }

  /** Store the camera's current position to an on-camera preset slot. */
  async storePresetOnCamera(cameraId: string, slot: number): Promise<{ success: boolean; error?: string }> {
    const instance = this.cameras.get(cameraId);
    if (!instance) return { success: false, error: "Camera not found" };
    if (!instance.viscaDriver || !instance.viscaDriver.isConnected()) {
      return { success: false, error: "VISCA not connected" };
    }
    await instance.viscaDriver.presetStore(slot);
    return { success: true };
  }

  // ── Range Discovery ──────────────────────────────────────────────────────

  async discoverRange(
    ip: string,
    port: number,
    axis: "pan" | "tilt" | "zoom" | "focus",
  ): Promise<{ success: true; value: { min: number; max: number } } | { success: false; error: string; status?: number }> {
    const driver = new ViscaCameraDriver(ip, port);
    const connected = await driver.connect();
    if (!connected) {
      return { success: false, error: `Cannot connect to VISCA at ${ip}:${port}`, status: 503 };
    }

    const readAxis = async (): Promise<number | null> => {
      const pos = await driver.inquirePosition();
      if (axis === "pan") return pos.pan;
      if (axis === "tilt") return pos.tilt;
      if (axis === "focus") return pos.focus;
      return pos.zoom;
    };

    const moveToLimit = async (direction: "min" | "max"): Promise<number | null> => {
      let prev: number | null = null;
      for (let i = 0; i < 60; i++) {
        if (axis === "pan") {
          await driver.panTiltSpeed(direction === "min" ? -1 : 1, 0);
        } else if (axis === "tilt") {
          await driver.panTiltSpeed(0, direction === "min" ? -1 : 1);
        } else if (axis === "zoom") {
          await driver.zoomSpeed(direction === "min" ? -1 : 1);
        } else {
          // Focus: near for min, far for max
          await driver.focusSpeed(direction === "min" ? -1 : 1);
        }

        await sleep(1000);
        if (axis === "zoom") {
          await driver.zoomSpeed(0);
        } else if (axis === "focus") {
          await driver.focusSpeed(0);
        } else {
          await driver.stop();
        }
        await sleep(200);

        const current = await readAxis();
        if (current === null) return null;
        // Raw integer comparison — position stabilized when change is < 2 units
        if (prev !== null && Math.abs(current - prev) < 2) return current;
        prev = current;
      }
      return null; // Never stabilized — no edge found
    };

    try {
      const min = await moveToLimit("min");
      if (min === null) {
        driver.disconnect();
        return { success: false, error: "Failed to read position during discovery" };
      }

      const max = await moveToLimit("max");
      if (max === null) {
        driver.disconnect();
        return { success: false, error: "Failed to read position during discovery" };
      }

      // Return to center (pan/tilt) or full wide (zoom)
      // Use midpoint of discovered range as center for the axis being tested,
      // and read current position for the other axis to avoid moving it
      if (axis === "pan") {
        const currentPos = await driver.inquirePosition();
        await driver.panTiltAbsolute(Math.round((min + max) / 2), currentPos.tilt ?? Math.round((min + max) / 2));
      } else if (axis === "tilt") {
        const currentPos = await driver.inquirePosition();
        await driver.panTiltAbsolute(currentPos.pan ?? Math.round((min + max) / 2), Math.round((min + max) / 2));
      } else if (axis === "zoom") {
        await driver.zoomAbsolute(min);
      } else {
        // Focus: return to midpoint
        await driver.focusManual(Math.round((min + max) / 2));
      }
      await sleep(500);

      driver.disconnect();
      return { success: true, value: { min, max } };
    } catch (error) {
      await driver.stop().catch(() => {});
      driver.disconnect();
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  // ── Hot-reload ────────────────────────────────────────────────────────────

  private async reloadCamera(deviceId: string, action: "created" | "updated" | "deleted"): Promise<void> {
    if (action === "deleted") {
      const existing = this.cameras.get(deviceId);
      if (existing) {
        if (existing.pollTimer) clearInterval(existing.pollTimer);
        existing.viscaDriver?.disconnect();
        if (this.previewManager) {
          this.previewManager.setSourceAvailable(`camera-${deviceId}`, false, "");
        }
        this.cameras.delete(deviceId);
      }
      return;
    }

    // For "created" or "updated", (re-)load from database
    const row = this.database
      .prepare("SELECT id, label, host, port, metadata, features FROM device_connections WHERE id = ? AND deviceType = 'camera-ptz' AND enabled = 1")
      .get(deviceId) as { id: string; label: string; host: string; port: number; metadata: string; features: string } | undefined;

    if (!row) {
      // Device was disabled or deleted — remove if present
      const existing = this.cameras.get(deviceId);
      if (existing) {
        if (existing.pollTimer) clearInterval(existing.pollTimer);
        existing.viscaDriver?.disconnect();
        if (this.previewManager) {
          this.previewManager.setSourceAvailable(`camera-${deviceId}`, false, "");
        }
        this.cameras.delete(deviceId);
      }
      return;
    }

    // Tear down existing instance if updating
    const existing = this.cameras.get(deviceId);
    if (existing) {
      if (existing.pollTimer) clearInterval(existing.pollTimer);
      existing.viscaDriver?.disconnect();
    }

    const meta: CameraMetadata = JSON.parse(row.metadata);
    const presets = this.loadPresets(row.id);
    const features = meta.cameraFeatures ?? [];
    const ndiExtraIPs = meta.ndiExtraIPs ?? (meta.viscaEnabled ? row.host : null);

    let viscaDriver: ViscaCameraDriver | null = null;
    let aiDriver: AiTrackingDriver | null = null;

    if (meta.viscaEnabled) {
      viscaDriver = new ViscaCameraDriver(row.host, row.port);
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
      label: row.label,
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
      ...(meta.zoomMin !== undefined ? { zoomMin: meta.zoomMin } : {}),
      ...(meta.zoomMax !== undefined ? { zoomMax: meta.zoomMax } : {}),
      ...(meta.panMin !== undefined ? { panMin: meta.panMin } : {}),
      ...(meta.panMax !== undefined ? { panMax: meta.panMax } : {}),
      ...(meta.tiltMin !== undefined ? { tiltMin: meta.tiltMin } : {}),
      ...(meta.tiltMax !== undefined ? { tiltMax: meta.tiltMax } : {}),
    };

    const instance: CameraInstance = {
      id: row.id,
      viscaDriver,
      aiDriver,
      metadata: meta,
      state,
      pollTimer: null,
      ndiSourceName: meta.ndiSourceName,
      ndiExtraIPs: ndiExtraIPs ?? null,
    };
    this.cameras.set(row.id, instance);

    // Register preview source
    if (this.previewManager) {
      const sourceId = `camera-${instance.id}`;
      this.previewManager.setSourceAvailable(sourceId, true, meta.ndiSourceName);
      instance.state.connected = true;
      logger.info(`Camera preview ${action === "created" ? "registered" : "updated"}: "${row.label}" (${meta.ndiSourceName})`);
    }

    // Connect VISCA
    if (viscaDriver) {
      const ok = await viscaDriver.connect();
      if (ok) {
        logger.info(`VISCA connected for camera "${row.label}"`);
        instance.pollTimer = setInterval(() => this.pollPosition(instance), 5000);
      } else {
        logger.warn(`VISCA connection failed for camera "${row.label}"`);
      }
    }

    this.broadcastState(instance);
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
      const changed = merged.pan !== prev.pan || merged.tilt !== prev.tilt || merged.zoom !== prev.zoom || merged.focus !== prev.focus;
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
