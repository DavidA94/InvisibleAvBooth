import { Router } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import { PlatformConfigDao } from "../platforms/platformConfigDao.js";
import { logger } from "../logger.js";

const OAUTH_STATE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function createPlatformRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  const dao = new PlatformConfigDao(database);

  // ── OAuth callbacks (no auth required — redirected from provider) ──────────

  router.get("/callback/youtube", (req, res) => {
    handleOAuthCallback(database, "youtube", req.query["state"] as string | undefined, req.query["code"] as string | undefined, res);
  });

  router.get("/callback/facebook", (req, res) => {
    handleOAuthCallback(database, "facebook", req.query["state"] as string | undefined, req.query["code"] as string | undefined, res);
  });

  // ── Admin platform CRUD (ADMIN only) ──────────────────────────────────────

  router.get("/admin/platforms", requireRole(authService, "ADMIN"), (_req, res) => {
    res.json(dao.getAll().map(sanitize));
  });

  router.get("/admin/platforms/:platformType", requireRole(authService, "ADMIN"), (req, res) => {
    const configs = dao.getByType(req.params["platformType"] as "youtube" | "facebook");
    if (configs.length === 0) { res.status(404).json({ error: "Not found" }); return; }
    res.json(sanitize(configs[0]!));
  });

  router.put("/admin/platforms/:platformType", requireRole(authService, "ADMIN"), (req, res) => {
    try {
      const result = dao.upsert({ ...req.body, platformType: req.params["platformType"] });
      res.json(sanitize(result));
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  router.delete("/admin/platforms/:platformType", requireRole(authService, "ADMIN"), (req, res) => {
    const configs = dao.getByType(req.params["platformType"] as "youtube" | "facebook");
    for (const c of configs) dao.delete(c.id);
    res.status(204).end();
  });

  // ── Platform health (any authenticated role) ──────────────────────────────

  router.get("/platforms/health", (_req, res) => {
    const platforms = dao.getAll();
    res.json(platforms.map((p) => ({ platformType: p.platformType, enabled: p.enabled, healthy: !!p.accessToken })));
  });

  // ── OAuth state management helpers ────────────────────────────────────────

  router.post("/admin/platforms/:platformType/oauth-start", requireRole(authService, "ADMIN"), (req, res) => {
    const state = randomBytes(32).toString("hex");
    database.prepare("INSERT INTO oauth_states (state, platformType, createdAt) VALUES (?, ?, ?)").run(state, req.params["platformType"], new Date().toISOString());
    res.json({ state });
  });

  return router;
}

function handleOAuthCallback(database: Database, platformType: string, state: string | undefined, code: string | undefined, res: { status: (n: number) => { json: (o: object) => void; end: () => void }; redirect: (url: string) => void }): void {
  // Cleanup stale states
  const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString();
  database.prepare("DELETE FROM oauth_states WHERE createdAt < ?").run(cutoff);

  if (!state || !code) {
    res.status(400).json({ error: "Missing state or code parameter" });
    return;
  }

  const row = database.prepare("SELECT * FROM oauth_states WHERE state = ? AND platformType = ?").get(state, platformType) as { state: string; createdAt: string } | undefined;
  if (!row) {
    res.status(400).json({ error: "Invalid or expired OAuth state" });
    return;
  }

  // Check TTL
  if (new Date(row.createdAt).getTime() < Date.now() - OAUTH_STATE_TTL_MS) {
    database.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
    res.status(400).json({ error: "OAuth state expired" });
    return;
  }

  // Consume the state
  database.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);

  logger.info(`OAuth callback received for ${platformType}`, { context: { code: code.slice(0, 8) + "..." } });

  // In a full implementation, exchange code for tokens here.
  // For now, return success — token exchange will be implemented with the platform clients.
  res.status(200).json({ success: true, platformType, message: "OAuth callback received. Token exchange pending." });
}

// Strip sensitive fields from platform config before sending to client
function sanitize(config: { accessToken?: string; refreshToken?: string; [key: string]: unknown }): Record<string, unknown> {
  const { accessToken: _a, refreshToken: _r, ...safe } = config;
  return { ...safe, hasToken: !!_a };
}

// Cleanup stale OAuth states on startup
export function cleanupStaleOAuthStates(database: Database): void {
  const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString();
  const result = database.prepare("DELETE FROM oauth_states WHERE createdAt < ?").run(cutoff);
  if (result.changes > 0) {
    logger.info(`Cleaned up ${result.changes} stale OAuth state(s)`);
  }
}
