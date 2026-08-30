import "dotenv/config";
import type { NmsInstance } from "./services/relayService.js";
import { getDatabase } from "./database/database.js";
import { buildApp } from "./app.js";
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
const relayPort = parseInt(process.env["RELAY_PORT"] ?? "1935", 10);

logger.info("Opening database…");
const database = getDatabase();

// Bootstrap default metadata templates if none exist.
const templateCount = (database.prepare("SELECT COUNT(*) as cnt FROM metadata_templates").get() as { cnt: number }).cnt;
if (templateCount === 0) {
  const { createId } = await import("@paralleldrive/cuid2");
  const now = new Date().toISOString();
  database
    .prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(createId(), "Default", "title", "{Date} – {Speaker} – {Title}", "AvVolunteer", now);
  database
    .prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(createId(), "None", "description", "", "AvVolunteer", now);
  logger.info("Bootstrapped default metadata templates");
}

logger.info("Loading streaming modules…");
const { default: NodeMediaServer } = await import("node-media-server");
const { spawn } = await import("child_process");

logger.info("Building application…");
const {
  httpServer,
  authService,
  obsService,
  relayService,
  platformService,
  obsNdiPreviewSource,
  videoPreviewManager,
  audioPreviewManager,
  audioCaptureService,
  cameraService,
  mixerService,
} = buildApp({
  database,
  nmsFactory: () =>
    new NodeMediaServer({ rtmp: { port: relayPort, chunk_size: 60000, gop_cache: false, ping: 5, ping_timeout: 3 }, logType: 0 }) as unknown as NmsInstance,
  spawnFn: spawn,
  relayPort,
});

authService.bootstrapIfEmpty();

// Warn if no dashboards exist — operator needs to run the seed script.
const dashboardCount = (database.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
if (dashboardCount === 0) {
  logger.warn("No dashboards found. Run: npx tsx scripts/seed-dashboard.ts");
}

httpServer.listen(PORT, () => {
  logger.info(`Backend started on port ${PORT}`);
  void obsService.connect();
  void relayService.start().catch((error) => logger.warn("Relay start failed (FFmpeg may not be installed)", { error: String(error) }));
  void platformService.validateTokensOnStartup().catch((error) => logger.warn("Token validation failed", { error: String(error) }));
  void videoPreviewManager.initialize().then(() => {
    void obsNdiPreviewSource.initialize();
    void cameraService.initialize();
    void mixerService.initialize().catch((error) => logger.warn("Mixer service init failed", { error: String(error) }));
  });
});

// Graceful shutdown — tear down the preview transport router-first (stop
// accepting upgrades), then the managers and capture service, then the rest.
const shutdown = (): void => {
  logger.info("Shutting down...");
  audioPreviewManager.destroy();
  videoPreviewManager.destroy();
  mixerService.destroy();
  audioCaptureService.destroy();
  platformService.destroy();
  relayService.stop();
  httpServer.close();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
