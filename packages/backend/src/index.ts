import { createServer } from "http";
import express from "express";
import cookieParser from "cookie-parser";
import { getDb } from "./db/database.js";
import { AuthService } from "./services/authService.js";
import { ObsService } from "./services/obsService.js";
import { SessionManifestService } from "./services/sessionManifestService.js";
import { SocketGateway } from "./gateway/socketGateway.js";
import { createAuthRouter } from "./routes/authRoutes.js";
import { createAdminUserRouter } from "./routes/adminUserRoutes.js";
import { createAdminDeviceRouter } from "./routes/adminDeviceRoutes.js";
import { createAdminDashboardRouter } from "./routes/adminDashboardRoutes.js";
import { createDashboardRouter } from "./routes/dashboardRoutes.js";
import { createSessionRouter } from "./routes/sessionRoutes.js";
import { createLogRouter } from "./routes/logRoutes.js";
import { createKjvRouter } from "./routes/kjvRoutes.js";
import { logger } from "./logger.js";

// Validate DEVICE_SECRET_KEY before doing anything else.
const secretKey = process.env["DEVICE_SECRET_KEY"] ?? "";
if (!/^[0-9a-f]{64}$/.test(secretKey)) {
  logger.error(
    "DEVICE_SECRET_KEY must be a 64-character hex string (32 bytes). Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
  );
  process.exit(1);
}

const PORT = parseInt(process.env["PORT"] ?? "3000", 10);

const database = getDb();
const authService = new AuthService(database);
authService.bootstrapIfEmpty();

const manifestService = new SessionManifestService();
const obsService = new ObsService(database);

const app = express();
app.use(express.json());
app.use(cookieParser());

app.use("/auth", createAuthRouter(authService));
app.use("/admin/users", createAdminUserRouter(authService));
app.use("/admin/devices", createAdminDeviceRouter(database, authService));
app.use("/admin/dashboards", createAdminDashboardRouter(database, authService));
app.use("/api/dashboards", createDashboardRouter(database, authService));
app.use("/api/session", createSessionRouter(authService));
app.use("/api/logs", createLogRouter(authService));
app.use("/api/kjv", createKjvRouter(database, authService));

const httpServer = createServer(app);
new SocketGateway(httpServer, authService, obsService, manifestService);

// Warn if no dashboards exist — operator needs to run the seed script.
const dashboardCount = (database.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
if (dashboardCount === 0) {
  logger.warn("No dashboards found. Run: npx tsx scripts/seed-dashboard.ts");
}

httpServer.listen(PORT, () => {
  logger.info(`Backend started on port ${PORT}`);
  void obsService.connect();
});
