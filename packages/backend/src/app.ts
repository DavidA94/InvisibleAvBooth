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
import { LowerThirdModule } from "./gateway/modules/lowerThird/lowerThirdModule.js";
import { registerOverlayNamespace } from "./gateway/overlayNamespace.js";
import { LowerThirdService } from "./services/lowerThirdService.js";
import { RelayService } from "./services/relayService.js";
import type { NmsFactory, SpawnFn } from "./services/relayService.js";
import { StreamingPlatformService } from "./services/streamingPlatformService.js";
import { VideoPreviewManager } from "./services/videoPreviewManager.js";
import type { SpawnFn as PreviewSpawnFn } from "./services/videoPreviewManager.js";
import { AudioPreviewManager } from "./services/audioPreviewManager.js";
import { PreviewUpgradeRouter } from "./services/previewUpgradeRouter.js";
import { AudioCaptureService } from "./mixer/AudioCaptureService.js";
import { MixerService } from "./mixer/MixerService.js";
import type { MixerDriverFactory } from "./mixer/MixerService.js";
import { MixerSocketModule } from "./gateway/modules/mixer/mixerModule.js";
import { CameraService } from "./camera/CameraService.js";
import { CameraSocketModule } from "./camera/CameraSocketModule.js";
import { ObsNdiPreviewSource } from "./camera/ObsNdiPreviewSource.js";
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
import { createPresetRouter } from "./routes/adminPresetRoutes.js";
import { createMixerPresetRouter } from "./routes/adminMixerPresetRoutes.js";
import { probeMixer } from "./mixer/osc/mixerProbe.js";
import { MetadataTemplateDao } from "./dao/metadataTemplateDao.js";
import { createPlatformRouter, cleanupStaleOAuthStates } from "./routes/platformRoutes.js";
import { createOverlayLogRouter } from "./routes/overlayLogRoutes.js";
import { authenticate, requirePasswordChanged, requireRole } from "./middleware/auth.js";

export interface AppDependencies {
  database: Database;
  nmsFactory: NmsFactory;
  spawnFn: SpawnFn;
  /** Injected OBSWebSocket instance (or fake). Omit to use the real one. */
  obsClient?: unknown;
  /** Pre-built platform clients keyed by platform ID. */
  platformClients?: Map<string, StreamingPlatformClient>;
  relayPort?: number;
  /** Override spawn for preview FFmpeg (for testing). */
  previewSpawnFn?: PreviewSpawnFn;
  /** Inject a fake mixer driver factory (tests). Omit to use the real OSC driver. */
  mixerDriverFactory?: MixerDriverFactory;
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
  lowerThirdService: LowerThirdService;
  cameraService: CameraService;
  videoPreviewManager: VideoPreviewManager;
  audioPreviewManager: AudioPreviewManager;
  previewUpgradeRouter: PreviewUpgradeRouter;
  audioCaptureService: AudioCaptureService;
  mixerService: MixerService;
  obsNdiPreviewSource: ObsNdiPreviewSource;
  gateway: SocketGateway;
}

export function buildApp(deps: AppDependencies): AppContext {
  const { database, nmsFactory, spawnFn, obsClient, platformClients, relayPort = 1935, previewSpawnFn, mixerDriverFactory } = deps;

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

  // Overlay log route — unauthenticated, rate-limited
  app.use("/api/overlay/logs", createOverlayLogRouter());

  // Lazy reference — platformService is created later but the callback is only invoked at runtime
  let platformServiceRef: { reloadPlatforms: () => void } | null = null;
  const onPlatformChangedLazy = (): void => platformServiceRef?.reloadPlatforms();

  const platformRouter = createPlatformRouter(database, authService, onPlatformChangedLazy);
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

  const httpServer = createServer(app);

  const relayService = new RelayService(nmsFactory, spawnFn, relayPort);

  const platformConfigDao = new PlatformConfigDao(database);
  const platformService = new StreamingPlatformService(platformClients ?? new Map(), relayService, obsService, manifestService, platformConfigDao);
  platformServiceRef = platformService;

  const templateDao = new MetadataTemplateDao(database);
  const lowerThirdService = new LowerThirdService(templateDao, database, manifestService);

  const onPlatformChanged = (): void => platformServiceRef?.reloadPlatforms();
  app.use("/api", mustBeAuthenticated, mustHaveChangedPassword, createPlatformRouter(database, authService, onPlatformChanged));

  // ── Preview transport + audio capture ───────────────────────────────────────
  //
  // The USB-slot resolver and channel validator read mixer config from the DB.
  // A MixerService (added in a later phase) may supply richer runtime state, but
  // resolving from device_connections keeps the capture layer self-contained.
  const usbSlotResolver = (mixerId: string, channel: number): number => {
    const row = database.prepare("SELECT metadata FROM device_connections WHERE id = ? AND deviceType = 'soundboard'").get(mixerId) as
      { metadata: string } | undefined;
    if (!row) return channel; // identity fallback
    try {
      const metadata = JSON.parse(row.metadata) as { usbSlotMap?: Record<string, number> };
      const slot = metadata.usbSlotMap?.[String(channel)];
      return typeof slot === "number" ? slot : channel;
    } catch {
      return channel;
    }
  };
  const isValidMixerChannel = (mixerId: string, channel: number): boolean => {
    const row = database.prepare("SELECT metadata FROM device_connections WHERE id = ? AND deviceType = 'soundboard'").get(mixerId) as
      { metadata: string } | undefined;
    if (!row) return false;
    try {
      const metadata = JSON.parse(row.metadata) as { channelCount?: number };
      const count = typeof metadata.channelCount === "number" ? metadata.channelCount : 0;
      return channel >= 1 && channel <= count;
    } catch {
      return false;
    }
  };

  const audioCaptureService = new AudioCaptureService(usbSlotResolver, previewSpawnFn);
  const videoPreviewManager = new VideoPreviewManager(previewSpawnFn);
  const audioPreviewManager = new AudioPreviewManager(audioCaptureService, isValidMixerChannel);
  const previewUpgradeRouter = new PreviewUpgradeRouter(authService, videoPreviewManager, audioPreviewManager);
  const obsNdiPreviewSource = new ObsNdiPreviewSource(database, videoPreviewManager);
  const cameraService = new CameraService(database, videoPreviewManager);
  const mixerService = new MixerService(database, audioCaptureService, mixerDriverFactory);

  // Preset routes need cameraService for position capture
  app.use("/api/admin/cameras/:cameraId/presets", mustBeAuthenticated, mustHaveChangedPassword, createPresetRouter(database, authService, cameraService));

  // Discover endpoint — ad-hoc VISCA connection for range discovery
  app.get("/api/admin/cameras/discover/:axis", mustBeAuthenticated, mustHaveChangedPassword, async (req, res) => {
    const axis = req.params.axis as string;
    const ip = req.query.ip as string | undefined;
    const port = req.query.port as string | undefined;
    if (!["pan", "tilt", "zoom", "focus"].includes(axis)) {
      res.status(400).json({ error: "Invalid axis. Must be pan, tilt, zoom, or focus." });
      return;
    }
    if (!ip || !port) {
      res.status(400).json({ error: "Query params ip and port are required." });
      return;
    }
    const result = await cameraService.discoverRange(ip, Number(port), axis as "pan" | "tilt" | "zoom" | "focus");
    if (!result.success) {
      res.status(result.status ?? 500).json({ error: result.error });
      return;
    }
    res.json(result.value);
  });

  // ── Mixer (Sound Board) admin routes ────────────────────────────────────────
  //
  // Probe is an inline route on the /api/admin/mixers mount (mirrors camera
  // `discover`), registered before the :mixerId preset router so the literal
  // `probe` segment is never captured as a :mixerId.
  const mixerAdminOnly = requireRole(authService, "ADMIN");
  app.post("/api/admin/mixers/probe", mustBeAuthenticated, mustHaveChangedPassword, mixerAdminOnly, async (req, res) => {
    const { host, port } = req.body as { host?: string; port?: number };
    // eslint-disable-next-line eqeqeq -- catch null/undefined but not 0
    if (!host || port == null) {
      res.status(400).json({ error: "host and port are required" });
      return;
    }
    const result = await probeMixer(host, Number(port));
    res.json(result);
  });

  // Capture the current board → MixerPresetPayload (ADMIN-only). Inline on the
  // /api/admin/mixers mount, registered before the :mixerId preset router.
  app.post("/api/admin/mixers/:mixerId/capture-preset", mustBeAuthenticated, mustHaveChangedPassword, mixerAdminOnly, async (req, res) => {
    const mixerId = req.params["mixerId"] as string;
    try {
      const payload = await mixerService.capturePreset(mixerId);
      res.json({ ok: true, payload });
    } catch (error) {
      res.status(409).json({ ok: false, error: (error as Error).message });
    }
  });

  app.use("/api/admin/mixers/:mixerId/presets", mustBeAuthenticated, mustHaveChangedPassword, createMixerPresetRouter(database, authService));

  const gateway = new SocketGateway(httpServer, authService, [
    new ObsModule(
      obsService,
      () => !!obsNdiPreviewSource.getNdiOutputName(),
      () => videoPreviewManager.isLevelAvailable(),
    ),
    new SessionManifestModule(manifestService),
    new StreamingPlatformModule(platformService, relayService),
    new LowerThirdModule(lowerThirdService),
    new CameraSocketModule(cameraService),
    new MixerSocketModule(mixerService),
  ]);

  registerOverlayNamespace(gateway.getIo(), lowerThirdService);

  // The router owns the /preview/* upgrade + cookie-JWT auth, dispatching to the
  // video or audio manager by path (steering §2/§8 — adding a transport is a new
  // dispatch line, not a manager change).
  previewUpgradeRouter.registerUpgrade(httpServer);

  return {
    httpServer,
    app,
    database,
    authService,
    obsService,
    relayService,
    platformService,
    manifestService,
    lowerThirdService,
    cameraService,
    videoPreviewManager,
    audioPreviewManager,
    previewUpgradeRouter,
    audioCaptureService,
    mixerService,
    obsNdiPreviewSource,
    gateway,
  };
}
