/**
 * buildApp — assembles the full Express + Socket.io application.
 *
 * Extracted from index.ts so both production and integration tests share
 * identical wiring. Production calls this from index.ts; tests inject fakes
 * for OBS, relay, and platform clients.
 */
import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import type { Database } from "better-sqlite3";
import { AuthService } from "./services/authService.js";
import { ObsService } from "./services/obsService.js";
import { SessionManifestService } from "./services/sessionManifestService.js";
import { SocketGateway } from "./gateway/socketGateway.js";
import { ObsModule } from "./gateway/modules/obs/obsModule.js";
import { SessionManifestModule } from "./gateway/modules/sessionManifest/sessionManifestModule.js";
import { StreamingPlatformModule } from "./gateway/modules/platform/streamingPlatformModule.js";
import { RelayService } from "./services/relayService.js";
import type { NmsFactory, SpawnFn } from "./services/relayService.js";
import { StreamingPlatformService } from "./services/streamingPlatformService.js";
import { PlatformConfigDao } from "./platforms/platformConfigDao.js";
import type { StreamingPlatformClient } from "./platforms/platformClient.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createAdminUserRouter } from "./routes/adminUserRoutes.js";
import { createAdminDeviceRouter } from "./routes/adminDeviceRoutes.js";
import { createAdminDashboardRouter } from "./routes/adminDashboardRoutes.js";
import { createDashboardRouter } from "./routes/dashboardRoutes.js";
import { createSessionRouter } from "./routes/sessionRoutes.js";
import { createLogRouter } from "./routes/logRoutes.js";
import { createKjvRouter } from "./routes/kjvRoutes.js";
import { createAdminTemplateRouter } from "./routes/adminTemplateRoutes.js";
import { createTemplateRouter } from "./routes/templateRoutes.js";
import { createPlatformRouter, cleanupStaleOAuthStates } from "./routes/platformRoutes.js";
import { authenticate, requirePasswordChanged } from "./middleware/auth.js";

export interface AppDependencies {
  database: Database;
  nmsFactory: NmsFactory;
  spawnFn: SpawnFn;
  /** Injected OBSWebSocket instance (or fake). Omit to use the real one. */
  obsClient?: unknown;
  /** Pre-built platform clients keyed by platform ID. */
  platformClients?: Map<string, StreamingPlatformClient>;
  relayPort?: number;
}

export interface AppContext {
  httpServer: ReturnType<typeof createServer>;
  app: ReturnType<typeof express>;
  database: Database;
  authService: AuthService;
  obsService: ObsService;
  relayService: RelayService;
  platformService: StreamingPlatformService;
  manifestService: SessionManifestService;
  gateway: SocketGateway;
}

export function buildApp(deps: AppDependencies): AppContext {
  const { database, nmsFactory, spawnFn, obsClient, platformClients, relayPort = 1935 } = deps;

  const authService = new AuthService(database);

  cleanupStaleOAuthStates(database);

  const manifestService = new SessionManifestService(database);
  const obsService = new ObsService(
    database,
    { initialDelayMs: 1000, maxDelayMs: 30000, maxAttempts: 10, backoffFactor: 2, jitterMs: 500 },
    obsClient as never,
  );

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/auth", createAuthRouter(authService));

  const platformRouter = createPlatformRouter(database, authService);
  app.use("/api/auth", platformRouter);

  const mustBeAuthenticated = authenticate(authService);
  const mustHaveChangedPassword = requirePasswordChanged();
  app.use("/api/admin/users", mustBeAuthenticated, mustHaveChangedPassword, createAdminUserRouter(authService));
  app.use("/api/admin/devices", mustBeAuthenticated, mustHaveChangedPassword, createAdminDeviceRouter(database, authService));
  app.use("/api/admin/dashboards", mustBeAuthenticated, mustHaveChangedPassword, createAdminDashboardRouter(database, authService));
  app.use("/api/dashboards", mustBeAuthenticated, mustHaveChangedPassword, createDashboardRouter(database, authService));
  app.use("/api/session", mustBeAuthenticated, mustHaveChangedPassword, createSessionRouter(manifestService));
  app.use("/api/logs", mustBeAuthenticated, mustHaveChangedPassword, createLogRouter(authService));
  app.use("/api/kjv", mustBeAuthenticated, mustHaveChangedPassword, createKjvRouter(database, authService));
  app.use("/api/admin/templates", mustBeAuthenticated, mustHaveChangedPassword, createAdminTemplateRouter(database, authService));
  app.use("/api/templates", mustBeAuthenticated, mustHaveChangedPassword, createTemplateRouter(database, authService));
  app.use("/api", mustBeAuthenticated, mustHaveChangedPassword, createPlatformRouter(database, authService));

  const httpServer = createServer(app);

  const relayService = new RelayService(nmsFactory, spawnFn, relayPort);

  const platformConfigDao = new PlatformConfigDao(database);
  const platformService = new StreamingPlatformService(platformClients ?? new Map(), relayService, obsService, manifestService, platformConfigDao);

  const gateway = new SocketGateway(httpServer, authService, [
    new ObsModule(obsService),
    new SessionManifestModule(manifestService),
    new StreamingPlatformModule(platformService, relayService),
  ]);

  return { httpServer, app, database, authService, obsService, relayService, platformService, manifestService, gateway };
}
