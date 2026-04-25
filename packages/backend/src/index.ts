import "dotenv/config";
import { createServer } from "http";
import express from "express";
import { getDatabase } from "./database/database.js";
import { AuthService } from "./services/authService.js";
import { ObsService } from "./services/obsService.js";
import { SessionManifestService } from "./services/sessionManifestService.js";
import { SocketGateway } from "./gateway/socketGateway.js";
import { ObsModule } from "./gateway/modules/obs/obsModule.js";
import { SessionManifestModule } from "./gateway/modules/sessionManifest/sessionManifestModule.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createAdminUserRouter } from "./routes/adminUserRoutes.js";
import { createAdminDeviceRouter } from "./routes/adminDeviceRoutes.js";
import { createAdminDashboardRouter } from "./routes/adminDashboardRoutes.js";
import { createDashboardRouter } from "./routes/dashboardRoutes.js";
import { createSessionRouter } from "./routes/sessionRoutes.js";
import { createLogRouter } from "./routes/logRoutes.js";
import { createKjvRouter } from "./routes/kjvRoutes.js";
import { authenticate, requirePasswordChanged } from "./middleware/auth.js";
import { logger } from "./logger.js";

import cors from "cors";

// Validate DEVICE_SECRET_KEY before doing anything else.
const secretKey = process.env["DEVICE_SECRET_KEY"] ?? "";
if (!/^[0-9a-f]{64}$/.test(secretKey)) {
  logger.error(
    "DEVICE_SECRET_KEY must be a 64-character hex string (32 bytes). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

const database = getDatabase();
const authService = new AuthService(database);
authService.bootstrapIfEmpty();

const manifestService = new SessionManifestService();
const obsService = new ObsService(database);

const app = express();
app.use(express.json());

const allowedOrigin = process.env["FRONTEND_URL"] ?? "http://localhost:5173";
app.use(cors({ origin: allowedOrigin }));

app.use("/api/auth", createAuthRouter(authService));

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

const httpServer = createServer(app);
new SocketGateway(httpServer, authService, [new ObsModule(obsService), new SessionManifestModule(manifestService)]);

// Warn if no dashboards exist — operator needs to run the seed script.
const dashboardCount = (database.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
if (dashboardCount === 0) {
  logger.warn("No dashboards found. Run: npx tsx scripts/seed-dashboard.ts");
}

httpServer.listen(PORT, () => {
  logger.info(`Backend started on port ${PORT}`);
  void obsService.connect();
});
