// Admin mixer preset routes (Req 10.8).
//
// Mirrors adminPresetRoutes (cameras): a router mounted at
// /api/admin/mixers/:mixerId/presets for preset CRUD + reorder. The
// capture-preset endpoint is registered inline on the /api/admin/mixers mount
// (see app.ts), like the camera `discover` endpoint, so the literal segment
// does not collide with :mixerId.
//
// Presets are ADMIN-only. A preset is an open OSC address→value map stored as
// JSON in `mixer_presets.payload` (Req 10.2), so future parameters need no
// schema change. When a preset changes we emit BUS_MIXER_DEVICE_CHANGED (action
// "updated") so MixerService reloads its preset list and re-broadcasts state —
// reusing the hot-reload path rather than fabricating a full MixerState here.

import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_MIXER_DEVICE_CHANGED } from "../eventBus/types.js";
import type { MixerPresetSummary, MixerPresetPayload } from "@invisible-av-booth/shared";

interface MixerPresetRow {
  id: string;
  mixerId: string;
  name: string;
  sortOrder: number;
  payload: string;
  createdAt: string;
}

interface PublicMixerPreset {
  id: string;
  mixerId: string;
  name: string;
  sortOrder: number;
  payload: MixerPresetPayload;
}

function toPublic(row: MixerPresetRow): PublicMixerPreset {
  return {
    id: row.id,
    mixerId: row.mixerId,
    name: row.name,
    sortOrder: row.sortOrder,
    payload: JSON.parse(row.payload) as MixerPresetPayload,
  };
}

export function createMixerPresetRouter(routerDatabase: Database, authService: AuthService): Router {
  const router = Router({ mergeParams: true });
  const adminOnly = requireRole(authService, "ADMIN");

  const emitChanged = (mixerId: string): void => {
    eventBus.emit(BUS_MIXER_DEVICE_CHANGED, { action: "updated", mixerId });
  };

  // GET /api/admin/mixers/:mixerId/presets
  router.get("/", adminOnly, (request: Request, response: Response): void => {
    const { mixerId } = request.params;
    const rows = routerDatabase.prepare("SELECT * FROM mixer_presets WHERE mixerId = ? ORDER BY sortOrder").all(mixerId as string) as MixerPresetRow[];
    response.json(rows.map(toPublic));
  });

  // POST /api/admin/mixers/:mixerId/presets — create with a captured payload snapshot
  router.post("/", adminOnly, (request: Request, response: Response): void => {
    const { mixerId } = request.params;
    const { name, payload } = request.body as { name?: unknown; payload?: unknown };

    if (!name || typeof name !== "string") {
      response.status(400).json({ error: "name is required" });
      return;
    }
    if (payload !== undefined && (typeof payload !== "object" || payload === null || Array.isArray(payload))) {
      response.status(400).json({ error: "payload must be an address→value object" });
      return;
    }

    const id = randomBytes(16).toString("hex");
    const maxOrder =
      (routerDatabase.prepare("SELECT MAX(sortOrder) as m FROM mixer_presets WHERE mixerId = ?").get(mixerId as string) as { m: number | null })?.m ?? -1;

    routerDatabase
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(id, mixerId as string, name, maxOrder + 1, JSON.stringify(payload ?? {}), new Date().toISOString());

    logger.info("Mixer preset created", { userId: request.jwtPayload!.sub, context: { mixerId, presetId: id } });
    emitChanged(mixerId as string);
    const row = routerDatabase.prepare("SELECT * FROM mixer_presets WHERE id = ?").get(id) as MixerPresetRow;
    response.status(201).json(toPublic(row));
  });

  // PUT /api/admin/mixers/:mixerId/presets/order — reorder
  router.put("/order", adminOnly, (request: Request, response: Response): void => {
    const { presetIds } = request.body as { presetIds?: string[] };
    if (!Array.isArray(presetIds)) {
      response.status(400).json({ error: "presetIds array is required" });
      return;
    }
    const stmt = routerDatabase.prepare("UPDATE mixer_presets SET sortOrder = ? WHERE id = ?");
    for (let index = 0; index < presetIds.length; index++) {
      stmt.run(index, presetIds[index]);
    }
    emitChanged(request.params["mixerId"] as string);
    response.json({ success: true });
  });

  // PUT /api/admin/mixers/:mixerId/presets/:presetId — rename / re-capture
  router.put("/:presetId", adminOnly, (request: Request, response: Response): void => {
    const { presetId } = request.params;
    const existing = routerDatabase.prepare("SELECT * FROM mixer_presets WHERE id = ?").get(presetId as string) as MixerPresetRow | undefined;
    if (!existing) {
      response.status(404).json({ error: "Preset not found" });
      return;
    }

    const { name, payload } = request.body as { name?: unknown; payload?: unknown };
    if (payload !== undefined && (typeof payload !== "object" || payload === null || Array.isArray(payload))) {
      response.status(400).json({ error: "payload must be an address→value object" });
      return;
    }

    routerDatabase
      .prepare("UPDATE mixer_presets SET name = ?, payload = ? WHERE id = ?")
      .run(typeof name === "string" ? name : existing.name, payload !== undefined ? JSON.stringify(payload) : existing.payload, presetId as string);

    logger.info("Mixer preset updated", { userId: request.jwtPayload!.sub, context: { presetId } });
    emitChanged(existing.mixerId);
    const updated = routerDatabase.prepare("SELECT * FROM mixer_presets WHERE id = ?").get(presetId as string) as MixerPresetRow;
    response.json(toPublic(updated));
  });

  // DELETE /api/admin/mixers/:mixerId/presets/:presetId
  router.delete("/:presetId", adminOnly, (request: Request, response: Response): void => {
    const { presetId } = request.params;
    const existing = routerDatabase.prepare("SELECT mixerId FROM mixer_presets WHERE id = ?").get(presetId as string) as { mixerId: string } | undefined;
    if (!existing) {
      response.status(404).json({ error: "Preset not found" });
      return;
    }
    routerDatabase.prepare("DELETE FROM mixer_presets WHERE id = ?").run(presetId as string);
    logger.info("Mixer preset deleted", { userId: request.jwtPayload!.sub, context: { presetId } });
    emitChanged(existing.mixerId);
    response.status(204).send();
  });

  return router;
}

/** List preset summaries for a mixer (used by MixerService to build MixerState). */
export function listMixerPresetSummaries(routerDatabase: Database, mixerId: string): MixerPresetSummary[] {
  const rows = routerDatabase.prepare("SELECT id, name, sortOrder FROM mixer_presets WHERE mixerId = ? ORDER BY sortOrder").all(mixerId) as Array<{
    id: string;
    name: string;
    sortOrder: number;
  }>;
  return rows.map((row) => ({ id: row.id, name: row.name, sortOrder: row.sortOrder }));
}
