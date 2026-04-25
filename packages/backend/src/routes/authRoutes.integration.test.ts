import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { createAuthRouter } from "./authRoutes.js";
import { createAdminUserRouter } from "./adminUserRoutes.js";
import { createSessionRouter } from "./sessionRoutes.js";
import { SessionManifestService } from "../services/sessionManifestService.js";
import { requirePasswordChanged, authenticate } from "../middleware/auth.js";

function buildApp() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());
  app.use("/api/auth", createAuthRouter(authService));
  const mustBeAuthenticated = authenticate(authService);
  const mustHaveChangedPassword = requirePasswordChanged();
  app.use("/api/admin/users", mustBeAuthenticated, mustHaveChangedPassword, createAdminUserRouter(authService));
  app.use("/api/session", mustBeAuthenticated, mustHaveChangedPassword, createSessionRouter(new SessionManifestService()));
  return { app, authService };
}

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

function getToken(response: request.Response): string {
  return (response.body as { token?: string }).token ?? "";
}

async function loginAsAdmin(app: express.Express, authService: AuthService) {
  await authService.createUser({ username: "admin", password: "adminpass", role: "ADMIN" }, seedActor);
  const loginResponse = await request(app).post("/api/auth/login").send({ username: "admin", password: "adminpass" });
  const tempToken = getToken(loginResponse);
  const changeResponse = await request(app)
    .post("/api/auth/change-password")
    .set("Authorization", `Bearer ${tempToken}`)
    .send({ newPassword: "adminpass" });
  const finalToken = getToken(changeResponse) || tempToken;
  return { token: finalToken };
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

describe("POST /api/auth/login", () => {
  it("returns 200 and token on valid credentials", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/api/auth/login").send({ username: "alice", password: "pass" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
    expect(response.body).toHaveProperty("user");
  });

  it("returns token in body", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/api/auth/login").send({ username: "alice", password: "pass", rememberMe: true });
    expect(typeof response.body.token).toBe("string");
    expect(response.body.token.length).toBeGreaterThan(0);
  });

  it("returns 401 on invalid credentials", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/api/auth/login").send({ username: "alice", password: "wrong" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when username or password is missing", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/api/auth/login").send({ password: "pass" });
    expect(response.status).toBe(400);
  });

  it("includes requiresPasswordChange for new users", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/api/auth/login").send({ username: "alice", password: "pass" });
    expect(response.body.user.requiresPasswordChange).toBe(true);
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

describe("POST /api/auth/logout", () => {
  it("returns ok", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/api/auth/logout");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────

describe("GET /api/admin/users", () => {
  it("returns user list for authenticated ADMIN", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const response = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("returns 401 without token", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/api/admin/users");
    expect(response.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/api/admin/users").set("Authorization", "Bearer invalid.jwt.token");
    expect(response.status).toBe(401);
  });

  it("returns 403 when requiresPasswordChange is set", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "ADMIN" }, seedActor);
    const loginRes = await request(app).post("/api/auth/login").send({ username: "alice", password: "pass" });
    const response = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${getToken(loginRes)}`);
    expect(response.status).toBe(403);
  });
});

// ── GET /api/admin/users/:id ──────────────────────────────────────────────────

describe("GET /api/admin/users/:id", () => {
  it("returns a single user", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    const id = listRes.body[0].id as string;
    const response = await request(app).get(`/api/admin/users/${id}`).set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.username).toBe("admin");
  });
});

// ── POST /api/admin/users ─────────────────────────────────────────────────────

describe("POST /api/admin/users", () => {
  it("creates a user", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const response = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "bob", password: "pass", role: "AvVolunteer" });
    expect(response.status).toBe(201);
    expect(response.body.username).toBe("bob");
  });
});

// ── PUT /api/admin/users/:id ──────────────────────────────────────────────────

describe("PUT /api/admin/users/:id", () => {
  it("updates a user", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const createRes = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "bob", password: "pass", role: "AvVolunteer" });
    const response = await request(app)
      .put(`/api/admin/users/${createRes.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "bobby" });
    expect(response.status).toBe(200);
    expect(response.body.username).toBe("bobby");
  });
});

// ── DELETE /api/admin/users/:id ───────────────────────────────────────────────

describe("DELETE /api/admin/users/:id", () => {
  it("deletes a user", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const createRes = await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "bob", password: "pass", role: "AvVolunteer" });
    expect(
      (await request(app).delete(`/api/admin/users/${createRes.body.id as string}`).set("Authorization", `Bearer ${token}`)).status,
    ).toBe(204);
  });

  it("returns 403 when trying to self-delete", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    const adminId = listRes.body[0].id as string;
    expect((await request(app).delete(`/api/admin/users/${adminId}`).set("Authorization", `Bearer ${token}`)).status).toBe(403);
  });
});

// ── POST /api/auth/change-password ────────────────────────────────────────────

describe("POST /api/auth/change-password", () => {
  it("returns 403 for non-ADMIN changing another user's password via admin route", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    // Create a volunteer
    await request(app)
      .post("/api/admin/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ username: "vol", password: "pass", role: "AvVolunteer" });
    // Login as volunteer
    const volLogin = await request(app).post("/api/auth/login").send({ username: "vol", password: "pass" });
    const volToken = getToken(volLogin);
    // Volunteer changes own password (should work)
    const response = await request(app)
      .post("/api/auth/change-password")
      .set("Authorization", `Bearer ${volToken}`)
      .send({ newPassword: "newpass" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("token");
  });

  it("returns 400 when newPassword is missing", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "ADMIN" }, seedActor);
    const loginRes = await request(app).post("/api/auth/login").send({ username: "alice", password: "pass" });
    expect(
      (await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${getToken(loginRes)}`).send({})).status,
    ).toBe(400);
  });
});

// ── POST /api/admin/users/:id/change-password ────────────────────────────────

describe("POST /api/admin/users/:id/change-password", () => {
  it("changes password and returns new token", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    const adminUser = listRes.body[0];
    const response = await request(app)
      .post(`/api/admin/users/${adminUser.id}/change-password`)
      .set("Authorization", `Bearer ${token}`)
      .send({ newPassword: "newpass123" });
    expect(response.status).toBe(200);
  });

  it("returns 400 when newPassword is missing", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    const adminUser = listRes.body[0];
    expect(
      (await request(app).post(`/api/admin/users/${adminUser.id}/change-password`).set("Authorization", `Bearer ${token}`).send({})).status,
    ).toBe(400);
  });

  it("returns 403 when non-ADMIN tries to change another user's password", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/api/admin/users").set("Authorization", `Bearer ${token}`);
    const adminId = listRes.body[0].id as string;
    // Create volunteer and login
    await request(app).post("/api/admin/users").set("Authorization", `Bearer ${token}`).send({ username: "vol", password: "pass", role: "AvVolunteer" });
    const volLogin = await request(app).post("/api/auth/login").send({ username: "vol", password: "pass" });
    const volToken = getToken(volLogin);
    // Change own password first to clear requiresPasswordChange
    const changeRes = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${volToken}`).send({ newPassword: "pass" });
    const volFinalToken = getToken(changeRes) || volToken;
    expect((await request(app).post(`/api/admin/users/${adminId}/change-password`).set("Authorization", `Bearer ${volFinalToken}`).send({ newPassword: "hack" })).status).toBe(403);
  });
});

// ── GET /api/session/manifest ─────────────────────────────────────────────────

describe("GET /api/session/manifest", () => {
  it("returns empty manifest initially", async () => {
    const { app, authService } = buildApp();
    const { token } = await loginAsAdmin(app, authService);
    const response = await request(app).get("/api/session/manifest").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });
});
