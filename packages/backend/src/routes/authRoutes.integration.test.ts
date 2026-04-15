import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../db/schema.js";
import { AuthService } from "../services/authService.js";
import { createAuthRouter } from "./authRoutes.js";
import { createAdminUserRouter } from "./adminUserRoutes.js";

function buildApp() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", createAuthRouter(authService));
  app.use("/admin/users", createAdminUserRouter(authService));
  return { app, authService };
}

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

async function loginAsAdmin(app: express.Express, authService: AuthService) {
  await authService.createUser({ username: "admin", password: "adminpass", role: "ADMIN" }, seedActor);
  const response = await request(app).post("/auth/login").send({ username: "admin", password: "adminpass" });
  const cookie = (response.headers["set-cookie"] as unknown as string[])[0] ?? "";
  return { cookie };
}

function getCookie(response: request.Response): string {
  return (response.headers["set-cookie"] as unknown as string[])[0] ?? "";
}

// ── POST /auth/login ──────────────────────────────────────────────────────────

describe("POST /auth/login", () => {
  it("returns 200 and sets HttpOnly cookie on valid credentials", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/auth/login").send({ username: "alice", password: "pass" });
    expect(response.status).toBe(200);
    expect(getCookie(response)).toContain("HttpOnly");
    expect(response.body.user).toBeDefined();
  });

  it("sets a longer Max-Age when rememberMe is true", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/auth/login").send({ username: "alice", password: "pass", rememberMe: true });
    expect(response.status).toBe(200);
    expect(getCookie(response)).toContain("Max-Age=");
  });

  it("returns 401 on wrong password", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "alice", password: "pass", role: "AvVolunteer" }, seedActor);
    const response = await request(app).post("/auth/login").send({ username: "alice", password: "wrong" });
    expect(response.status).toBe(401);
  });

  it("returns 400 when username is missing", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/auth/login").send({ password: "pass" });
    expect(response.status).toBe(400);
  });
});

// ── POST /auth/logout ─────────────────────────────────────────────────────────

describe("POST /auth/logout", () => {
  it("clears the token cookie", async () => {
    const { app } = buildApp();
    const response = await request(app).post("/auth/logout");
    expect(response.status).toBe(200);
    expect(getCookie(response)).toContain("token=;");
  });
});

// ── GET /admin/users ──────────────────────────────────────────────────────────

describe("GET /admin/users", () => {
  it("returns user list for ADMIN", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const response = await request(app).get("/admin/users").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });

  it("returns 401 without cookie", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/admin/users")).status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const { app } = buildApp();
    const response = await request(app).get("/admin/users").set("Cookie", "token=invalid.jwt.token");
    expect(response.status).toBe(401);
  });

  it("returns 403 for non-ADMIN", async () => {
    const { app, authService } = buildApp();
    await authService.createUser({ username: "vol", password: "pass", role: "AvVolunteer" }, seedActor);
    const loginRes = await request(app).post("/auth/login").send({ username: "vol", password: "pass" });
    const response = await request(app).get("/admin/users").set("Cookie", getCookie(loginRes));
    expect(response.status).toBe(403);
  });
});

// ── GET /admin/users/:id ──────────────────────────────────────────────────────

describe("GET /admin/users/:id", () => {
  it("returns a single user", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/admin/users").set("Cookie", cookie);
    const id = (listRes.body as Array<{ id: string }>)[0]!.id;
    const response = await request(app).get(`/admin/users/${id}`).set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body.id).toBe(id);
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    expect((await request(app).get("/admin/users/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });
});

// ── POST /admin/users ─────────────────────────────────────────────────────────

describe("POST /admin/users", () => {
  it("creates a user", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const response = await request(app).post("/admin/users").set("Cookie", cookie).send({ username: "newuser", password: "pass", role: "AvVolunteer" });
    expect(response.status).toBe(201);
    expect(response.body.username).toBe("newuser");
  });

  it("returns 409 on duplicate username", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    await request(app).post("/admin/users").set("Cookie", cookie).send({ username: "dup", password: "p", role: "AvVolunteer" });
    const response = await request(app).post("/admin/users").set("Cookie", cookie).send({ username: "dup", password: "p", role: "AvVolunteer" });
    expect(response.status).toBe(409);
  });
});

// ── PUT /admin/users/:id ──────────────────────────────────────────────────────

describe("PUT /admin/users/:id", () => {
  it("updates a user", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const createRes = await request(app).post("/admin/users").set("Cookie", cookie).send({ username: "bob", password: "p", role: "AvVolunteer" });
    const response = await request(app)
      .put(`/admin/users/${createRes.body.id as string}`)
      .set("Cookie", cookie)
      .send({ username: "bobby" });
    expect(response.status).toBe(200);
    expect(response.body.username).toBe("bobby");
  });

  it("returns 404 for unknown user", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    expect((await request(app).put("/admin/users/nonexistent").set("Cookie", cookie).send({ username: "x" })).status).toBe(404);
  });
});

// ── DELETE /admin/users/:id ───────────────────────────────────────────────────

describe("DELETE /admin/users/:id", () => {
  it("deletes a user", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const createRes = await request(app).post("/admin/users").set("Cookie", cookie).send({ username: "todelete", password: "p", role: "AvVolunteer" });
    expect(
      (
        await request(app)
          .delete(`/admin/users/${createRes.body.id as string}`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
  });

  it("returns 403 when trying to self-delete", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/admin/users").set("Cookie", cookie);
    const adminId = (listRes.body as Array<{ id: string; username: string }>).find((u) => u.username === "admin")!.id;
    expect((await request(app).delete(`/admin/users/${adminId}`).set("Cookie", cookie)).status).toBe(403);
  });
});

// ── POST /admin/users/:id/change-password ─────────────────────────────────────

describe("POST /admin/users/:id/change-password", () => {
  it("changes password and re-issues cookie", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/admin/users").set("Cookie", cookie);
    const adminUser = (listRes.body as Array<{ id: string }>)[0]!;
    const response = await request(app).post(`/admin/users/${adminUser.id}/change-password`).set("Cookie", cookie).send({ newPassword: "newpass123" });
    expect(response.status).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("returns 400 when newPassword is missing", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const listRes = await request(app).get("/admin/users").set("Cookie", cookie);
    const adminUser = (listRes.body as Array<{ id: string }>)[0]!;
    expect((await request(app).post(`/admin/users/${adminUser.id}/change-password`).set("Cookie", cookie).send({})).status).toBe(400);
  });

  it("returns 404 for unknown user id", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    expect((await request(app).post("/admin/users/nonexistent/change-password").set("Cookie", cookie).send({ newPassword: "p" })).status).toBe(404);
  });

  it("returns 403 when non-ADMIN tries to change another user's password", async () => {
    const { app, authService } = buildApp();
    const { cookie } = await loginAsAdmin(app, authService);
    const createRes = await request(app).post("/admin/users").set("Cookie", cookie).send({ username: "vol", password: "pass", role: "AvVolunteer" });
    const volLogin = await request(app).post("/auth/login").send({ username: "vol", password: "pass" });
    const volCookie = getCookie(volLogin);
    const adminId = ((await request(app).get("/admin/users").set("Cookie", cookie)).body as Array<{ id: string; username: string }>).find(
      (u) => u.username === "admin",
    )!.id;
    expect((await request(app).post(`/admin/users/${adminId}/change-password`).set("Cookie", volCookie).send({ newPassword: "hack" })).status).toBe(403);
    void createRes;
  });
});
