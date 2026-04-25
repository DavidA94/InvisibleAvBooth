import { describe, it, expect, vi, afterEach } from "vitest";
import express from "express";

import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { authenticate, requirePasswordChanged } from "../middleware/auth.js";
import { createAuthRouter } from "./authRoutes.js";
import { createLogRouter } from "./logRoutes.js";
import { logger } from "../logger.js";

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

function buildApp() {
  const database = new Database(":memory:");
  applySchema(database);
  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());

  app.use("/api/auth", createAuthRouter(authService));
  const mustBeAuthenticated = authenticate(authService);
  const mustHaveChangedPassword = requirePasswordChanged();
  app.use("/api/logs", mustBeAuthenticated, mustHaveChangedPassword, createLogRouter(authService));
  return { app, authService };
}

async function loginAsAdmin(app: express.Express, authService: AuthService) {
  await authService.createUser({ username: "admin", password: "pass", role: "ADMIN" }, seedActor);
  const loginResponse = await request(app).post("/api/auth/login").send({ username: "admin", password: "pass" });
  const tempToken = (loginResponse.body as { token?: string }).token ?? "";
  const changeResponse = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${tempToken}`).send({ newPassword: "pass" });
  const finalToken = (changeResponse.body as { token?: string }).token || tempToken;
  return finalToken;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/logs", () => {
  it("writes entries to logger with source: frontend", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const infoSpy = vi.spyOn(logger, "info");

    const response = await request(app)
      .post("/api/logs")
      .set("Authorization", `Bearer ${token}`)
      .send([{ level: "info", message: "page loaded", userId: "u1" }]);

    expect(response.status).toBe(204);
    expect(infoSpy).toHaveBeenCalledWith("page loaded", expect.objectContaining({ source: "frontend", userId: "u1" }));
  });

  it("handles multiple entries in one batch", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");

    await request(app)
      .post("/api/logs")
      .set("Authorization", `Bearer ${token}`)
      .send([
        { level: "info", message: "first" },
        { level: "warn", message: "second" },
      ]);

    expect(infoSpy).toHaveBeenCalledWith("first", expect.objectContaining({ source: "frontend" }));
    expect(warnSpy).toHaveBeenCalledWith("second", expect.objectContaining({ source: "frontend" }));
  });

  it("returns 401 without auth", async () => {
    const { app } = buildApp();
    expect(
      (
        await request(app)
          .post("/api/logs")
          .send([{ level: "info", message: "x" }])
      ).status,
    ).toBe(401);
  });

  it("returns 400 when body is not an array", async () => {
    const { app, authService } = buildApp();
    const token = await loginAsAdmin(app, authService);
    expect((await request(app).post("/api/logs").set("Authorization", `Bearer ${token}`).send({ level: "info", message: "x" })).status).toBe(400);
  });
});
