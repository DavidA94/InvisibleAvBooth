/**
 * Integration test harness.
 *
 * Builds a full server with fakes, provides login helpers, and a reset
 * function that truncates all tables and re-bootstraps between tests.
 */
import Database from "better-sqlite3";
import request from "supertest";
import { applySchema } from "../../src/database/schema.js";
import { seedKjv } from "../../src/database/database.js";
import { buildApp } from "../../src/app.js";
import type { AppContext } from "../../src/app.js";
import { eventBus } from "../../src/eventBus/eventBus.js";
import { createFakeObs, createFakeNmsFactory, createFakeSpawn, FakePlatformClient } from "./fakes.js";
import type { FakeObs, FakeNmsInstance } from "./fakes.js";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KJV_SQL_PATH = join(__dirname, "..", "..", "..", "..", "bibledb_kjv.sql");

export interface TestServer {
  ctx: AppContext;
  fakeObs: FakeObs;
  fakeNms: FakeNmsInstance;
  fakePlatformClient: FakePlatformClient;
  port: number;
  /** Supertest agent bound to the app */
  agent: ReturnType<typeof request>;
}

const TABLES = [
  "users",
  "device_connections",
  "dashboards",
  "widget_configurations",
  "metadata_templates",
  "streaming_platforms",
  "oauth_states",
  "camera_presets",
];

export async function buildTestServer(opts?: { seedKjv?: boolean; seedPlatform?: boolean }): Promise<TestServer> {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);

  if (opts?.seedKjv) {
    seedKjv(database, KJV_SQL_PATH);
  }

  // Seed a platform config BEFORE buildApp so loadPlatforms() picks it up
  if (opts?.seedPlatform) {
    const { encrypt } = await import("../../src/crypto.js");
    database
      .prepare("INSERT INTO streaming_platforms (id, platformType, label, enabled, encryptedAccessToken, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("yt-1", "youtube", "Test YouTube", 1, encrypt("fake-token"), '{"privacy":"unlisted"}', new Date().toISOString());
  }

  const fakeObs = createFakeObs();
  const fakePlatformClient = new FakePlatformClient();
  const nmsFactory = createFakeNmsFactory();
  const fakeNms = (nmsFactory as unknown as { instance: FakeNmsInstance }).instance;

  const fakeSpawn = createFakeSpawn();

  const ctx = buildApp({
    database,
    nmsFactory,
    spawnFn: fakeSpawn,
    obsClient: fakeObs,
    platformClients: new Map([["youtube", fakePlatformClient]]),
    relayPort: 0,
    previewSpawnFn: fakeSpawn as unknown as import("../../src/services/previewStreamManager.js").SpawnFn,
  });

  await new Promise<void>((resolve) => ctx.httpServer.listen(0, resolve));
  const port = (ctx.httpServer.address() as { port: number }).port;

  // Start relay (mirrors index.ts behavior)
  await ctx.relayService.start().catch(() => {});

  return { ctx, fakeObs, fakeNms, fakePlatformClient, port, agent: request(ctx.app) };
}

export function resetServer(server: TestServer): void {
  const { database } = server.ctx;
  for (const table of TABLES) {
    database.exec(`DELETE FROM "${table}"`);
  }
  // Don't use bootstrapIfEmpty — it generates a random password we can't use.
  // Tests create their own users via loginAs/loginAsAdmin with known passwords.
  // Don't clear eventBus listeners — gateway modules register once at startup.
  server.fakePlatformClient.reset();
  server.ctx.manifestService.clear({ sub: "reset", username: "reset", role: "ADMIN", iat: 0, exp: 0 });
}

export function destroyServer(server: TestServer): void {
  server.ctx.obsService.destroy();
  server.ctx.manifestService.destroy();
  server.ctx.platformService.destroy();
  server.ctx.lowerThirdService.destroy();
  server.ctx.cameraService.destroy();
  server.ctx.obsNdiPreviewSource.destroy();
  server.ctx.previewManager.destroy();
  server.ctx.relayService.stop();
  server.ctx.httpServer.close();
  eventBus.removeAllListeners();
}

// ── Login helpers ────────────────────────────────────────────────────────────

function getCookie(res: request.Response): string {
  return (res.headers["set-cookie"] as unknown as string[])?.[0] ?? "";
}

export async function loginAs(
  agent: ReturnType<typeof request>,
  authService: AppContext["authService"],
  username: string,
  password: string,
  role: "ADMIN" | "AvPowerUser" | "AvVolunteer",
): Promise<string> {
  const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };
  await authService.createUser({ username, password, role }, seedActor);
  const loginRes = await agent.post("/api/auth/login").send({ username, password });
  const tempCookie = getCookie(loginRes);
  const changeRes = await agent.post("/api/auth/change-password").set("Cookie", tempCookie).send({ newPassword: password });
  return getCookie(changeRes);
}

export async function loginAsAdmin(agent: ReturnType<typeof request>, authService: AppContext["authService"]): Promise<string> {
  return loginAs(agent, authService, "admin", "adminpass", "ADMIN");
}

/** Login without changing password — returns a cookie with requiresPasswordChange still set. */
export async function loginRaw(
  agent: ReturnType<typeof request>,
  authService: AppContext["authService"],
  username: string,
  password: string,
  role: "ADMIN" | "AvPowerUser" | "AvVolunteer",
): Promise<string> {
  const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };
  await authService.createUser({ username, password, role }, seedActor);
  const loginRes = await agent.post("/api/auth/login").send({ username, password });
  return getCookie(loginRes);
}
