/**
 * Medium-priority backend integration tests.
 *
 * Covers: B14 (stream health polling), B17 (5s fallback timer),
 * B33 (lower-third templates excluded from GET /api/templates),
 * B35 (relay state broadcast to clients).
 *
 * B36 (verse text fetch) is already covered by B2 (manifest interpolation
 * tests verify {verseText} end-to-end).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_PLATFORM_COMMAND, STC_PLATFORM_HEALTH } from "@invisible-av-booth/shared";

// ── B14: Stream health polling ───────────────────────────────────────────────

describe("Stream health polling (B14)", () => {
  let s: TestServer;
  let token: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    s = await buildTestServer({ seedPlatform: true });
    s.ctx.database
      .prepare(
        "INSERT INTO device_connections (id, deviceType, label, host, port, encryptedPassword, metadata, features, enabled, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("obs-1", "obs", "OBS", "localhost", 4455, null, "{}", "{}", 1, new Date().toISOString());

    s.fakeObs.call.mockImplementation((method: string) => {
      if (method === "StartStream") {
        setTimeout(() => s.fakeNms.simulatePublish(), 10);
        return Promise.resolve({});
      }
      if (method === "GetStreamStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetRecordStatus") return Promise.resolve({ outputActive: false });
      if (method === "GetStreamServiceSettings") return Promise.resolve({ streamServiceSettings: { server: "rtmp://localhost:1935/live" } });
      if (method === "SetStreamServiceSettings") return Promise.resolve({});
      if (method === "StopStream") return Promise.resolve({});
      return Promise.resolve({});
    });
    await s.ctx.obsService.connect();

    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const match = cookie.match(/token=([^;]+)/);
    token = match?.[1] ?? "";
  });

  afterAll(() => destroyServer(s));
  beforeEach(() => {
    s.fakePlatformClient.reset();
    s.fakeNms.simulateUnpublish();
  });
  afterEach(async () => {
    while (clients.length) clients.pop()!.close();
    try {
      await s.ctx.platformService.stopAll();
    } catch {
      /* ignore */
    }
    s.ctx.platformService.reloadPlatforms();
  });

  function connectClient(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ioClient(`http://localhost:${s.port}`, { auth: { token } });
      clients.push(client);
      client.on("connect", () => resolve(client));
      client.on("connect_error", reject);
    });
  }

  it("broadcasts health updates to clients after startAll", async () => {
    const client = await connectClient();

    // Start streaming
    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Listen for health update (polling happens on HEALTH_POLL_INTERVAL_MS = 20s)
    // Trigger manually by calling the private pollHealth
    const healthReceived = new Promise<{ platformId: string; health: string }>((resolve) => {
      client.on(STC_PLATFORM_HEALTH, (data: { platformId: string; health: string }) => resolve(data));
    });

    // Invoke pollHealth directly since we can't wait 20s
    await (s.ctx.platformService as unknown as { pollHealth: () => Promise<void> }).pollHealth();

    const payload = await healthReceived;
    expect(payload.platformId).toBe("youtube");
    expect(payload.health).toBe("good");
  });

  it("health poll failure increments failure count and transitions to error after threshold", async () => {
    const client = await connectClient();

    await new Promise<void>((resolve) => {
      client.emit(CTS_PLATFORM_COMMAND, { type: "startAll" }, () => resolve());
    });

    // Make health poll fail 3 times (HEALTH_FAILURE_THRESHOLD = 3)
    s.fakePlatformClient.enqueue("pollHealth", new Error("API timeout"));
    s.fakePlatformClient.enqueue("pollHealth", new Error("API timeout"));
    s.fakePlatformClient.enqueue("pollHealth", new Error("API timeout"));

    await (s.ctx.platformService as unknown as { pollHealth: () => Promise<void> }).pollHealth();
    await (s.ctx.platformService as unknown as { pollHealth: () => Promise<void> }).pollHealth();
    await (s.ctx.platformService as unknown as { pollHealth: () => Promise<void> }).pollHealth();

    const states = s.ctx.platformService.getPlatformStates();
    expect([...states.values()][0]?.status).toBe("error");
  });
});

// ── B17: 5-second fallback timer ─────────────────────────────────────────────

describe("5-second fallback timer (B17)", () => {
  let s: TestServer;

  beforeAll(async () => {
    s = await buildTestServer({ seedKjv: true });
  });
  afterAll(() => destroyServer(s));
  beforeEach(() => resetServer(s));

  it("fallback timer advances phase from showing to visible after 5 seconds", async () => {
    const service = s.ctx.lowerThirdService;

    service.addToLibrary({ type: "Title", content: { title: "Test" } });
    const itemId = service.getFullState().library[0]!.id;

    // Activate — enters "showing" phase
    service.activate(itemId);
    expect(service.getAnimationPhase()).toBe("showing");

    // Wait for fallback timer (5s + buffer)
    await new Promise((r) => setTimeout(r, 5200));

    // Should have force-advanced to "visible"
    expect(service.getAnimationPhase()).toBe("visible");
  }, 10000);

  it("fallback timer advances phase from dismissing to hidden after 5 seconds", async () => {
    const service = s.ctx.lowerThirdService;

    service.addToLibrary({ type: "Title", content: { title: "Test" } });
    const itemId = service.getFullState().library[0]!.id;

    // Activate and immediately make visible
    service.activate(itemId);
    service.reportPhase("visible");

    // Dismiss — enters "dismissing" phase
    service.dismissActive();
    expect(service.getAnimationPhase()).toBe("dismissing");

    // Wait for fallback timer
    await new Promise((r) => setTimeout(r, 5200));

    // Should have force-advanced to "hidden" and cleared active
    expect(service.getAnimationPhase()).toBe("hidden");
    expect(service.getActive()).toBeNull();
  }, 10000);

  it("reportPhase cancels the fallback timer (no force-advance)", async () => {
    const service = s.ctx.lowerThirdService;

    service.addToLibrary({ type: "Title", content: { title: "Test" } });
    const itemId = service.getFullState().library[0]!.id;

    service.activate(itemId);
    expect(service.getAnimationPhase()).toBe("showing");

    // Report visible before fallback fires — cancels the timer
    service.reportPhase("visible");
    expect(service.getAnimationPhase()).toBe("visible");

    // Wait past the 5s — should stay visible (timer was cancelled)
    await new Promise((r) => setTimeout(r, 5500));
    expect(service.getAnimationPhase()).toBe("visible");

    service.forceClear();
  }, 10000);
});

// ── B33: Lower-third templates excluded from GET /api/templates ──────────────

describe("Lower-third templates excluded from GET /api/templates (B33)", () => {
  let s: TestServer;

  beforeAll(async () => {
    s = await buildTestServer();
  });
  afterAll(() => destroyServer(s));
  beforeEach(() => resetServer(s));

  it("GET /api/templates does not include lower_third category templates", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);

    // Seed a title template, a description template, and a lower_third template
    await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Title Tmpl",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Desc Tmpl",
      category: "description",
      formatString: "{Speaker}",
      roleMinimum: "AvVolunteer",
    });
    await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "LT Tmpl",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
    });

    // Public endpoint should only return title and description
    const res = await s.agent.get("/api/templates").set("Cookie", cookie);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string; category: string }>).map((t) => t.name);
    expect(names).toContain("Title Tmpl");
    expect(names).toContain("Desc Tmpl");
    expect(names).not.toContain("LT Tmpl");

    // Verify no lower_third category in results
    const categories = (res.body as Array<{ category: string }>).map((t) => t.category);
    expect(categories).not.toContain("lower_third");
  });

  it("GET /api/templates respects role filtering", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);

    await s.agent.post("/api/admin/templates").set("Cookie", adminCookie).send({
      name: "Admin Only",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "ADMIN",
    });
    await s.agent.post("/api/admin/templates").set("Cookie", adminCookie).send({
      name: "For Volunteers",
      category: "title",
      formatString: "{Speaker}",
      roleMinimum: "AvVolunteer",
    });

    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/templates").set("Cookie", volCookie);
    const names = (res.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("For Volunteers");
    expect(names).not.toContain("Admin Only");
  });
});

// ── B35: Relay state broadcast to clients ────────────────────────────────────

describe("Relay state broadcast (B35)", () => {
  let s: TestServer;
  let token: string;
  const clients: ClientSocket[] = [];

  beforeAll(async () => {
    s = await buildTestServer();
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const match = cookie.match(/token=([^;]+)/);
    token = match?.[1] ?? "";
  });
  afterAll(() => destroyServer(s));
  beforeEach(() => resetServer(s));
  afterEach(() => {
    while (clients.length) clients.pop()!.close();
  });

  function connectClient(): Promise<ClientSocket> {
    return new Promise((resolve, reject) => {
      const client = ioClient(`http://localhost:${s.port}`, { auth: { token } });
      clients.push(client);
      client.on("connect", () => resolve(client));
      client.on("connect_error", reject);
    });
  }

  it("client receives relay state on initial state request", async () => {
    const client = await connectClient();

    const relayState = await new Promise<{ running: boolean; obsConnected: boolean }>((resolve) => {
      client.on("stc:relay:state", (data: { running: boolean; obsConnected: boolean }) => resolve(data));
      client.emit("cts:request:initial:state");
    });

    expect(relayState).toHaveProperty("running");
    expect(relayState).toHaveProperty("obsConnected");
  });

  it("relay state broadcast when OBS connects to relay", async () => {
    const client = await connectClient();
    // Request initial state first to clear the initial emit
    client.emit("cts:request:initial:state");
    await new Promise((r) => setTimeout(r, 50));

    const stateReceived = new Promise<{ running: boolean; obsConnected: boolean }>((resolve) => {
      client.on("stc:relay:state", (data: { running: boolean; obsConnected: boolean }) => {
        if (data.obsConnected) resolve(data);
      });
    });

    // Simulate OBS connecting to relay
    s.fakeNms.simulatePublish();

    const payload = await stateReceived;
    expect(payload.obsConnected).toBe(true);
  });
});
