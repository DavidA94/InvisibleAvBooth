import { Router } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import type { PlatformConfig } from "../gateway/modules/platform/types.js";
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
    if (configs.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
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
    const platformType = req.params["platformType"]!;
    const state = randomBytes(32).toString("hex");
    database.prepare("INSERT INTO oauth_states (state, platformType, createdAt) VALUES (?, ?, ?)").run(state, platformType, new Date().toISOString());

    let authUrl: string;
    if (platformType === "youtube") {
      const clientId = process.env["YOUTUBE_CLIENT_ID"] ?? "";
      const redirectUri = encodeURIComponent("https://localhost/api/auth/callback/youtube");
      authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=https://www.googleapis.com/auth/youtube&state=${state}&access_type=offline&prompt=consent`;
    } else {
      const appId = process.env["FACEBOOK_APP_ID"] ?? "";
      const redirectUri = encodeURIComponent("https://localhost/api/auth/callback/facebook");
      authUrl = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${appId}&redirect_uri=${redirectUri}&state=${state}&scope=pages_manage_posts,pages_read_engagement`;
    }

    if (!authUrl.includes("client_id=&") && authUrl.includes("client_id=")) {
      res.json({ state, authUrl });
    } else {
      res.status(400).json({ error: `${platformType === "youtube" ? "YOUTUBE_CLIENT_ID" : "FACEBOOK_APP_ID"} not configured in .env` });
    }
  });

  return router;
}

function handleOAuthCallback(
  database: Database,
  platformType: string,
  state: string | undefined,
  code: string | undefined,
  res: { status: (n: number) => { json: (o: object) => void; end: () => void }; redirect: (url: string) => void },
): void {
  if (!state || !code) {
    res.redirect(`/admin/platforms/${platformType}?error=missing_params`);
    return;
  }

  const row = database.prepare("SELECT * FROM oauth_states WHERE state = ? AND platformType = ?").get(state, platformType) as
    | { state: string; createdAt: string }
    | undefined;

  // Cleanup stale states
  const cutoff = new Date(Date.now() - OAUTH_STATE_TTL_MS).toISOString();
  database.prepare("DELETE FROM oauth_states WHERE createdAt < ?").run(cutoff);

  if (!row) {
    res.redirect(`/admin/platforms/${platformType}?error=invalid_state`);
    return;
  }

  if (new Date(row.createdAt).getTime() < Date.now() - OAUTH_STATE_TTL_MS) {
    database.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);
    res.redirect(`/admin/platforms/${platformType}?error=expired`);
    return;
  }

  // Consume the state
  database.prepare("DELETE FROM oauth_states WHERE state = ?").run(state);

  logger.info(`OAuth callback received for ${platformType}`, { context: { code: code.slice(0, 8) + "..." } });

  // Exchange code for tokens
  void exchangeCodeForTokens(database, platformType, code).then((success) => {
    if (success) {
      res.redirect(`/admin/platforms/${platformType}?connected=true`);
    } else {
      res.redirect(`/admin/platforms/${platformType}?error=token_exchange_failed`);
    }
  });
}

async function exchangeCodeForTokens(database: Database, platformType: string, code: string): Promise<boolean> {
  try {
    const dao = new PlatformConfigDao(database);
    let accessToken: string;
    let refreshToken: string | undefined;
    let tokenExpiresAt: string | undefined;
    let label: string;
    let metadata: Record<string, unknown> = {};

    if (platformType === "youtube") {
      const clientId = process.env["YOUTUBE_CLIENT_ID"] ?? "";
      const clientSecret = process.env["YOUTUBE_CLIENT_SECRET"] ?? "";
      const redirectUri = "https://localhost/api/auth/callback/youtube";

      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
      });

      if (!tokenRes.ok) {
        logger.error("YouTube token exchange failed", { context: { status: tokenRes.status } });
        return false;
      }

      const tokenData = (await tokenRes.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined;
      label = "YouTube";
      metadata = { privacy: "unlisted" };
    } else {
      const appId = process.env["FACEBOOK_APP_ID"] ?? "";
      const appSecret = process.env["FACEBOOK_APP_SECRET"] ?? "";
      const redirectUri = "https://localhost/api/auth/callback/facebook";

      const tokenRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`,
      );

      if (!tokenRes.ok) {
        logger.error("Facebook token exchange failed", { context: { status: tokenRes.status } });
        return false;
      }

      const tokenData = (await tokenRes.json()) as { access_token: string; expires_in?: number };
      accessToken = tokenData.access_token;
      tokenExpiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : undefined;
      label = "Facebook";
    }

    dao.upsert({
      platformType: platformType as "youtube" | "facebook",
      label,
      accessToken,
      ...(refreshToken !== undefined && { refreshToken }),
      ...(tokenExpiresAt !== undefined && { tokenExpiresAt }),
      metadata,
      enabled: true,
    });
    logger.info(`${platformType} OAuth tokens saved successfully`);
    return true;
  } catch (err) {
    logger.error(`${platformType} token exchange error`, { context: { error: String(err) } });
    return false;
  }
}

// Strip sensitive fields from platform config before sending to client
function sanitize(config: PlatformConfig): Record<string, unknown> {
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
