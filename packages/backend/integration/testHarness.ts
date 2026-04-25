/**
 * Test harness for integration tests.
 *
 * Creates a fully wired backend (Express + SocketGateway) with:
 *   - In-memory SQLite database (no file I/O)
 *   - Programmable mock OBS client (no real OBS needed)
 *
 * Usage:
 *   const harness = await createTestHarness();
 *   // ... run tests against harness.app, harness.port, harness.mockObs ...
 *   await harness.teardown();
 */
import { createServer } from "http";
import type { Server as HttpServer } from "http";
import express from "express";
import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import { vi } from "vitest";
import { applySchema } from "../src/database/schema.js";
import { AuthService } from "../src/services/authService.js";
import { ObsService } from "../src/services/obsService.js";
import { SessionManifestService } from "../src/services/sessionManifestService.js";
import { SocketGateway } from "../src/gateway/socketGateway.js";
import { ObsModule } from "../src/gateway/modules/obs/obsModule.js";
import { SessionManifestModule } from "../src/gateway/modules/sessionManifest/sessionManifestModule.js";
import { createAuthRouter } from "../src/routes/authRoutes.js";
import { createAdminUserRouter } from "../src/routes/adminUserRoutes.js";
import { createAdminDeviceRouter } from "../src/routes/adminDeviceRoutes.js";
import { createAdminDashboardRouter } from "../src/routes/adminDashboardRoutes.js";
import { createDashboardRouter } from "../src/routes/dashboardRoutes.js";
import { createSessionRouter } from "../src/routes/sessionRoutes.js";
import { createLogRouter } from "../src/routes/logRoutes.js";
import { createKjvRouter } from "../src/routes/kjvRoutes.js";
import { authenticate, requirePasswordChanged } from "../src/middleware/auth.js";
import request from "supertest";

// ── Mock OBS client ───────────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

export function makeMockObs() {
  const handlers: Record<string, EventHandler[]> = {};
  return {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    call: vi.fn().mockImplementation((method: string) => {
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      return Promise.resolve({});
    }),
    on: vi.fn().mockImplementation((event: string, handler: EventHandler) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event]!.push(handler);
    }),
    off: vi.fn(),
    removeAllListeners: vi.fn().mockImplementation((event?: string) => {
      if (event) {
        delete handlers[event];
      } else {
        Object.keys(handlers).forEach((key) => delete handlers[key]);
      }
    }),
    /** Fire a registered OBS event (e.g., StreamStateChanged, ConnectionClosed). */
    __emit(event: string, ...args: unknown[]) {
      handlers[event]?.forEach((h) => h(...args));
    },
  };
}

export type MockObs = ReturnType<typeof makeMockObs>;

// ── Harness ───────────────────────────────────────────────────────────────────

export interface TestHarness {
  app: express.Express;
  httpServer: HttpServer;
  port: number;
  database: BetterSqlite3.Database;
  authService: AuthService;
  obsService: ObsService;
  manifestService: SessionManifestService;
  mockObs: MockObs;
  /** Get a fully authenticated admin token (password already changed). */
  getAdminToken: () => Promise<string>;
  teardown: () => void;
}

export async function createTestHarness(): Promise<TestHarness> {
  process.env["DEVICE_SECRET_KEY"] = process.env["DEVICE_SECRET_KEY"] || "a".repeat(64);

  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);

  const authService = new AuthService(database);
  const manifestService = new SessionManifestService();
  const mockObs = makeMockObs();
  const obsService = new ObsService(
    database,
    { initialDelayMs: 10, maxDelayMs: 100, maxAttempts: 2, backoffFactor: 1, jitterMs: 0 },
    mockObs as never,
  );

  const app = express();
  app.use(express.json());

  app.use("/api/auth", createAuthRouter(authService));

  const mustBeAuthenticated = authenticate(authService);
  const mustHaveChangedPassword = requirePasswordChanged();
  app.use("/api/admin/users", mustBeAuthenticated, mustHaveChangedPassword, createAdminUserRouter(authService));
  app.use("/api/admin/devices", mustBeAuthenticated, mustHaveChangedPassword, createAdminDeviceRouter(database, authService));
  app.use("/api/admin/dashboards", mustBeAuthenticated, mustHaveChangedPassword, createAdminDashboardRouter(database, authService));
  app.use("/api/dashboards", mustBeAuthenticated, mustHaveChangedPassword, createDashboardRouter(database, authService));
  app.use("/api/session", mustBeAuthenticated, mustHaveChangedPassword, createSessionRouter(manifestService));
  app.use("/api/logs", mustBeAuthenticated, mustHaveChangedPassword, createLogRouter(authService));
  app.use("/api/kjv", mustBeAuthenticated, mustHaveChangedPassword, createKjvRouter(database, authService));

  const httpServer = createServer(app);
  new SocketGateway(httpServer, authService, [new ObsModule(obsService), new SessionManifestModule(manifestService)]);

  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;

  const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };
  let adminToken: string | null = null;

  async function getAdminToken(): Promise<string> {
    if (adminToken) return adminToken;

    await authService.createUser({ username: "testadmin", password: "testpass", role: "ADMIN" }, seedActor);
    const loginRes = await request(app).post("/api/auth/login").send({ username: "testadmin", password: "testpass" });
    const tempToken = (loginRes.body as { token: string }).token;

    const changeRes = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${tempToken}`)
      .send({ newPassword: "testpass" });
    adminToken = (changeRes.body as { token: string }).token || tempToken;
    return adminToken;
  }

  return {
    app,
    httpServer,
    port,
    database,
    authService,
    obsService,
    manifestService,
    mockObs,
    getAdminToken,
    teardown() {
      obsService.destroy();
      manifestService.destroy();
      httpServer.close();
      database.close();
    },
  };
}
