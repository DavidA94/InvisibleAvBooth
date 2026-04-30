import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { createAuthRouter } from "./authRoutes.js";
import { createPlatformRouter } from "./platformRoutes.js";
import { authenticate, requirePasswordChanged } from "../middleware/auth.js";

// Crypto requires a valid key for encrypt/decrypt
process.env["DEVICE_SECRET_KEY"] = "a".repeat(64);

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

function buildApp() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api/auth", createAuthRouter(authService));
  // OAuth callbacks before auth middleware
  const platformRouter = createPlatformRouter(database, authService);
  app.use("/api/auth", platformRouter);
  const auth = authenticate(authService);
  const pwd = requirePasswordChanged();
  app.use("/api", auth, pwd, platformRouter);
  return { app, authService, database };
}

function getCookie(response: request.Response): string {
  return (response.headers["set-cookie"] as unknown as string[])[0] ?? "";
}

async function loginAsAdmin(app: express.Express, authService: AuthService) {
  await authService.createUser({ username: "admin", password: "adminpass", role: "ADMIN" }, seedActor);
  const loginRes = await request(app).post("/api/auth/login").send({ username: "admin", password: "adminpass" });
  const tempCookie = getCookie(loginRes);
  const changeRes = await request(app).post("/api/auth/change-password").set("Cookie", tempCookie).send({ newPassword: "adminpass" });
  return { cookie: getCookie(changeRes) };
}

async function loginAsVolunteer(app: express.Express, authService: AuthService) {
  await authService.createUser({ username: "vol", password: "volpass", role: "AvVolunteer" }, seedActor);
  const loginRes = await request(app).post("/api/auth/login").send({ username: "vol", password: "volpass" });
  const tempCookie = getCookie(loginRes);
  const changeRes = await request(app).post("/api/auth/change-password").set("Cookie", tempCookie).send({ newPassword: "volpass" });
  return { cookie: getCookie(changeRes) };
}

describe("GET /api/admin/platforms", () => {
  it("returns empty list initially", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const res = await request(app).get("/api/admin/platforms").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 without auth", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/admin/platforms");
    expect(res.status).toBe(401);
  });
});

describe("PUT /api/admin/platforms/:platformType", () => {
  it("creates a platform config", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const res = await request(app).put("/api/admin/platforms/youtube").set("Cookie", cookie).send({ enabled: true, metadata: { privacy: "unlisted" }, label: "My YouTube", accessToken: "test-token" });
    expect(res.status).toBe(200);
    expect(res.body.platformType).toBe("youtube");
    expect(res.body.hasToken).toBe(true); // we sent accessToken
    expect(res.body.accessToken).toBeUndefined(); // sanitized
  });
});

describe("DELETE /api/admin/platforms/:platformType", () => {
  it("deletes a platform config", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    await request(app).put("/api/admin/platforms/youtube").set("Cookie", cookie).send({ enabled: true, label: "YT", accessToken: "tok" });
    const res = await request(app).delete("/api/admin/platforms/youtube").set("Cookie", cookie);
    expect(res.status).toBe(204);
  });
});

describe("GET /api/platforms/health", () => {
  it("returns health for any authenticated role", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsVolunteer(app, authService);
    const res = await request(app).get("/api/platforms/health").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("OAuth callbacks", () => {
  it("rejects callback without state parameter", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/auth/callback/youtube");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing");
  });

  it("rejects callback with invalid state", async () => {
    const { app } = buildApp();
    const res = await request(app).get("/api/auth/callback/youtube?state=invalid&code=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid");
  });

  it("accepts callback with valid state", async () => {
    const { app, authService, database } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);

    // Generate OAuth state
    const stateRes = await request(app).post("/api/admin/platforms/youtube/oauth-start").set("Cookie", cookie);
    expect(stateRes.status).toBe(200);
    const { state } = stateRes.body;

    // Simulate callback (no auth needed)
    const res = await request(app).get(`/api/auth/callback/youtube?state=${state}&code=test-code`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // State should be consumed
    const row = database.prepare("SELECT * FROM oauth_states WHERE state = ?").get(state);
    expect(row).toBeUndefined();
  });

  it("rejects expired state", async () => {
    const { app, database } = buildApp();
    database.prepare("INSERT INTO oauth_states (state, platformType, createdAt) VALUES (?, ?, ?)").run("old-state", "youtube", new Date(Date.now() - 10 * 60 * 1000).toISOString());

    const res = await request(app).get("/api/auth/callback/youtube?state=old-state&code=abc");
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("expired");
  });
});
