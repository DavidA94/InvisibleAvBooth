import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";

interface PresetRow {
  id: string;
  cameraId: string;
  name: string;
  sortOrder: number;
  storedOnCamera: number;
  cameraPresetSlot: number | null;
  pan: number | null;
  tilt: number | null;
  zoom: number | null;
  focus: number | null;
  autoFocus: number;
  aiTracking: number;
  aiTilt: number;
  aiZoom: number;
  createdAt: string;
}

function toPublic(row: PresetRow) {
  return {
    id: row.id,
    cameraId: row.cameraId,
    name: row.name,
    sortOrder: row.sortOrder,
    storedOnCamera: !!row.storedOnCamera,
    cameraPresetSlot: row.cameraPresetSlot,
    pan: row.pan,
    tilt: row.tilt,
    zoom: row.zoom,
    focus: row.focus,
    autoFocus: !!row.autoFocus,
    aiTracking: !!row.aiTracking,
    aiTilt: !!row.aiTilt,
    aiZoom: !!row.aiZoom,
  };
}

export function createPresetRouter(database: Database, authService: AuthService): Router {
  const router = Router({ mergeParams: true });
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /api/admin/cameras/:cameraId/presets
  router.get("/", adminOnly, (req: Request, res: Response): void => {
    const { cameraId } = req.params;
    const rows = database.prepare("SELECT * FROM camera_presets WHERE cameraId = ? ORDER BY sortOrder").all(cameraId as string) as PresetRow[];
    res.json(rows.map(toPublic));
  });

  // POST /api/admin/cameras/:cameraId/presets
  router.post("/", adminOnly, (req: Request, res: Response): void => {
    const { cameraId } = req.params;
    const { name, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom } = req.body as Record<string, unknown>;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const id = randomBytes(16).toString("hex");
    const maxOrder =
      (database.prepare("SELECT MAX(sortOrder) as m FROM camera_presets WHERE cameraId = ?").get(cameraId as string) as { m: number | null })?.m ?? -1;

    database
      .prepare(
        "INSERT INTO camera_presets (id, cameraId, name, sortOrder, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom, createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        cameraId as string,
        name,
        maxOrder + 1,
        storedOnCamera ? 1 : 0,
        cameraPresetSlot ?? null,
        pan ?? null,
        tilt ?? null,
        zoom ?? null,
        focus ?? null,
        autoFocus ? 1 : 0,
        aiTracking ? 1 : 0,
        aiTilt ? 1 : 0,
        aiZoom ? 1 : 0,
        new Date().toISOString(),
      );

    logger.info("Preset created", { userId: req.jwtPayload!.sub, context: { cameraId, presetId: id } });
    broadcastPresets(database, cameraId as string);
    const row = database.prepare("SELECT * FROM camera_presets WHERE id = ?").get(id) as PresetRow;
    res.status(201).json(toPublic(row));
  });

  // PUT /api/admin/cameras/:cameraId/presets/order
  router.put("/order", adminOnly, (req: Request, res: Response): void => {
    const { order } = req.body as { order?: string[] };
    if (!Array.isArray(order)) {
      res.status(400).json({ error: "order array is required" });
      return;
    }
    const stmt = database.prepare("UPDATE camera_presets SET sortOrder = ? WHERE id = ?");
    for (let i = 0; i < order.length; i++) {
      stmt.run(i, order[i]);
    }
    broadcastPresets(database, req.params["cameraId"] as string);
    res.json({ success: true });
  });

  // POST /api/admin/cameras/:cameraId/capture-position
  router.post("/capture-position", adminOnly, (req: Request, res: Response): void => {
    // Return current camera position from CameraService
    // For now, return null position (CameraService integration in later phase)
    res.json({ pan: null, tilt: null, zoom: null, focus: null, autoFocus: null });
  });

  // PUT /api/admin/cameras/:cameraId/presets/:presetId
  router.put("/:presetId", adminOnly, (req: Request, res: Response): void => {
    const { presetId } = req.params;
    const existing = database.prepare("SELECT * FROM camera_presets WHERE id = ?").get(presetId as string) as PresetRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }

    const { name, storedOnCamera, cameraPresetSlot, pan, tilt, zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom } = req.body as Record<string, unknown>;

    database
      .prepare(
        "UPDATE camera_presets SET name=?, storedOnCamera=?, cameraPresetSlot=?, pan=?, tilt=?, zoom=?, focus=?, autoFocus=?, aiTracking=?, aiTilt=?, aiZoom=? WHERE id=?",
      )
      .run(
        (name as string) ?? existing.name,
        storedOnCamera !== undefined ? (storedOnCamera ? 1 : 0) : existing.storedOnCamera,
        cameraPresetSlot ?? existing.cameraPresetSlot,
        pan ?? existing.pan,
        tilt ?? existing.tilt,
        zoom ?? existing.zoom,
        focus ?? existing.focus,
        autoFocus !== undefined ? (autoFocus ? 1 : 0) : existing.autoFocus,
        aiTracking !== undefined ? (aiTracking ? 1 : 0) : existing.aiTracking,
        aiTilt !== undefined ? (aiTilt ? 1 : 0) : existing.aiTilt,
        aiZoom !== undefined ? (aiZoom ? 1 : 0) : existing.aiZoom,
        presetId as string,
      );

    logger.info("Preset updated", { userId: req.jwtPayload!.sub, context: { presetId } });
    broadcastPresets(database, existing.cameraId);
    const updated = database.prepare("SELECT * FROM camera_presets WHERE id = ?").get(presetId as string) as PresetRow;
    res.json(toPublic(updated));
  });

  // DELETE /api/admin/cameras/:cameraId/presets/:presetId
  router.delete("/:presetId", adminOnly, (req: Request, res: Response): void => {
    const { presetId, cameraId } = req.params;
    const existing = database.prepare("SELECT id FROM camera_presets WHERE id = ?").get(presetId as string);
    if (!existing) {
      res.status(404).json({ error: "Preset not found" });
      return;
    }
    database.prepare("DELETE FROM camera_presets WHERE id = ?").run(presetId as string);
    logger.info("Preset deleted", { userId: req.jwtPayload!.sub, context: { presetId } });
    broadcastPresets(database, cameraId as string);
    res.status(204).send();
  });

  return router;
}

function broadcastPresets(database: Database, cameraId: string): void {
  const presets = (database.prepare("SELECT * FROM camera_presets WHERE cameraId = ? ORDER BY sortOrder").all(cameraId) as PresetRow[]).map(toPublic);
  // Emit a state change to notify connected clients
  const device = database.prepare("SELECT id FROM device_connections WHERE id = ?").get(cameraId);
  if (device) {
    eventBus.emit(BUS_CAMERA_STATE_CHANGED, {
      cameraId,
      state: {
        cameraId,
        connected: false,
        position: null,
        autoFocus: true,
        aiTracking: false,
        aiTilt: false,
        aiZoom: false,
        activePresetId: null,
        features: [],
        capabilities: { tapToCenter: false },
        presets,
      },
    });
  }
}
