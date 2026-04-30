import "dotenv/config";
import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { getDatabase } from "./database/database.js";
import { AuthService } from "./services/authService.js";
import { ObsService } from "./services/obsService.js";
import { SessionManifestService } from "./services/sessionManifestService.js";
import { SocketGateway } from "./gateway/socketGateway.js";
import { ObsModule } from "./gateway/modules/obs/obsModule.js";
import { SessionManifestModule } from "./gateway/modules/sessionManifest/sessionManifestModule.js";
import { RelayService } from "./services/relayService.js";
import { StreamingPlatformService } from "./services/streamingPlatformService.js";
import { PlatformConfigDao } from "./platforms/platformConfigDao.js";
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
import { StreamingPlatformModule } from "./gateway/modules/platform/streamingPlatformModule.js";
import { logger } from "./logger.js";

// Validate DEVICE_SECRET_KEY before doing anything else.
const secretKey = process.env["DEVICE_SECRET_KEY"] ?? "";
if (!/^[0-9a-f]{64}$/.test(secretKey)) {
  logger.error(
    "DEVICE_SECRET_KEY must be a 64-character hex string (32 bytes). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}

const PORT = parseInt(process.env["PORT"] ?? "3001", 10);

const database = getDatabase();
const authService = new AuthService(database);
authService.bootstrapIfEmpty();

// Bootstrap default metadata templates if none exist.
const templateCount = (database.prepare("SELECT COUNT(*) as cnt FROM metadata_templates").get() as { cnt: number }).cnt;
if (templateCount === 0) {
  const { createId } = await import("@paralleldrive/cuid2");
  const now = new Date().toISOString();
  database.prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(createId(), "Default", "title", "{Date} – {Speaker} – {Title}", "AvVolunteer", now);
  database.prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(createId(), "None", "description", "", "AvVolunteer", now);
  logger.info("Bootstrapped default metadata templates");
}

// Cleanup stale OAuth states from previous runs.
cleanupStaleOAuthStates(database);

const manifestService = new SessionManifestService(database);
const obsService = new ObsService(database);

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/api/auth", createAuthRouter(authService));

// OAuth callbacks must be before auth middleware — they're redirected from providers without cookies.
const platformRouter = createPlatformRouter(database, authService);
app.use("/api/auth", platformRouter); // Mounts /callback/youtube and /callback/facebook under /api/auth

// All routes below require a valid JWT AND a completed password change.
// authenticate() sets request.jwtPayload; requirePasswordChanged() checks it.
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

// Initialize relay and platform services
const relayPort = parseInt(process.env["RELAY_PORT"] ?? "1935", 10);
const { default: NodeMediaServer } = await import("node-media-server");
const { spawn } = await import("child_process");
const relayService = new RelayService(
  () => new NodeMediaServer({ rtmp: { port: relayPort, chunk_size: 60000, gop_cache: false, ping: 5, ping_timeout: 3 }, logType: 0 }) as unknown as import("./services/relayService.js").NmsInstance,
  spawn,
  relayPort,
);

const platformConfigDao = new PlatformConfigDao(database);
const platformService = new StreamingPlatformService(
  new Map(), // Platform clients are populated after OAuth token exchange
  relayService,
  obsService,
  manifestService,
  platformConfigDao,
);

new SocketGateway(httpServer, authService, [
  new ObsModule(obsService),
  new SessionManifestModule(manifestService),
  new StreamingPlatformModule(platformService, relayService),
]);

// Warn if no dashboards exist — operator needs to run the seed script.
const dashboardCount = (database.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
if (dashboardCount === 0) {
  logger.warn("No dashboards found. Run: npx tsx scripts/seed-dashboard.ts");
}

httpServer.listen(PORT, () => {
  logger.info(`Backend started on port ${PORT}`);
  void obsService.connect();
  void relayService.start().catch((err) => logger.warn("Relay start failed (FFmpeg may not be installed)", { error: String(err) }));
  void platformService.validateTokensOnStartup().catch((err) => logger.warn("Token validation failed", { error: String(err) }));
});

// Graceful shutdown
const shutdown = () => {
  logger.info("Shutting down...");
  platformService.destroy();
  relayService.stop();
  httpServer.close();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
