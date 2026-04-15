import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { encrypt, decrypt } from "../crypto.js";
import { logger } from "../logger.js";

interface DeviceRow {
  id: string;
  deviceType: string;
  label: string;
  host: string;
  port: number;
  encryptedPassword: string | null;
  metadata: string;
  features: string;
  enabled: number;
  createdAt: string;
}

// Strip the encrypted password before returning to the client — passwords are write-only.
function toPublic(row: DeviceRow) {
  return {
    id: row.id,
    deviceType: row.deviceType,
    label: row.label,
    host: row.host,
    port: row.port,
    metadata: JSON.parse(row.metadata) as Record<string, string>,
    features: JSON.parse(row.features) as Record<string, boolean>,
    enabled: !!row.enabled,
    createdAt: row.createdAt,
  };
}

export function createAdminDeviceRouter(db: Database, authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /admin/devices
  router.get("/", auth, adminOnly, (_req: Request, res: Response): void => {
    const rows = db.prepare("SELECT * FROM device_connections ORDER BY createdAt").all() as DeviceRow[];
    res.json(rows.map(toPublic));
  });

  // POST /admin/devices
  router.post("/", auth, adminOnly, (req: Request, res: Response): void => {
    const { deviceType, label, host, port, password, metadata = {}, features = {}, enabled = true } = req.body as {
      deviceType?: string;
      label?: string;
      host?: string;
      port?: number;
      password?: string;
      metadata?: Record<string, string>;
      features?: Record<string, boolean>;
      enabled?: boolean;
    };

    if (!deviceType || !label || !host || port == null) {
      res.status(400).json({ error: "deviceType, label, host, and port are required" });
      return;
    }

    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();
    const encryptedPassword = password ? encrypt(password) : null;

    db.prepare(
      "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(id, deviceType, label, host, port, encryptedPassword, JSON.stringify(metadata), JSON.stringify(features), enabled ? 1 : 0, createdAt);

    logger.info("Device connection created", { userId: req.jwtPayload!.sub, context: { deviceId: id } });

    const row = db.prepare("SELECT * FROM device_connections WHERE id = ?").get(id) as DeviceRow;
    res.status(201).json(toPublic(row));
  });

  // GET /admin/devices/:id
  router.get("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM device_connections WHERE id = ?").get(req.params["id"]) as DeviceRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    res.json(toPublic(row));
  });

  // PUT /admin/devices/:id
  router.put("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM device_connections WHERE id = ?").get(req.params["id"]) as DeviceRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Device not found" });
      return;
    }

    const { deviceType, label, host, port, password, metadata, features, enabled } = req.body as {
      deviceType?: string;
      label?: string;
      host?: string;
      port?: number;
      password?: string;
      metadata?: Record<string, string>;
      features?: Record<string, boolean>;
      enabled?: boolean;
    };

    const encryptedPassword = password ? encrypt(password) : row.encryptedPassword;

    db.prepare(
      "UPDATE device_connections SET deviceType=?, label=?, host=?, port=?, encryptedPassword=?, metadata=?, features=?, enabled=? WHERE id=?",
    ).run(
      deviceType ?? row.deviceType,
      label ?? row.label,
      host ?? row.host,
      port ?? row.port,
      encryptedPassword,
      JSON.stringify(metadata ?? (JSON.parse(row.metadata) as Record<string, string>)),
      JSON.stringify(features ?? (JSON.parse(row.features) as Record<string, boolean>)),
      enabled != null ? (enabled ? 1 : 0) : row.enabled,
      row.id,
    );

    logger.info("Device connection updated", { userId: req.jwtPayload!.sub, context: { deviceId: row.id } });

    const updated = db.prepare("SELECT * FROM device_connections WHERE id = ?").get(row.id) as DeviceRow;
    res.json(toPublic(updated));
  });

  // DELETE /admin/devices/:id
  router.delete("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT id FROM device_connections WHERE id = ?").get(req.params["id"]);
    if (!row) {
      res.status(404).json({ error: "Device not found" });
      return;
    }
    db.prepare("DELETE FROM device_connections WHERE id = ?").run(req.params["id"]);
    logger.info("Device connection deleted", { userId: req.jwtPayload!.sub, context: { deviceId: req.params["id"] } });
    res.status(204).send();
  });

  return router;
}

// Exported for use by ObsService — decrypts a stored password for internal use only.
export { decrypt as decryptDevicePassword };
