import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { createAuthRouter } from "./authRoutes.js";
import { createAdminTemplateRouter } from "./adminTemplateRoutes.js";
import { createTemplateRouter } from "./templateRoutes.js";
import { authenticate, requirePasswordChanged } from "../middleware/auth.js";

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
  const auth = authenticate(authService);
  const pwChanged = requirePasswordChanged();
  app.use("/api/admin/templates", auth, pwChanged, createAdminTemplateRouter(database, authService));
  app.use("/api/templates", auth, pwChanged, createTemplateRouter(database, authService));
  return { app, authService };
}

function getCookie(response: request.Response): string {
  return (response.headers["set-cookie"] as unknown as string[])[0] ?? "";
}

async function loginAs(app: express.Express, authService: AuthService, username: string, role: "ADMIN" | "AvPowerUser" | "AvVolunteer") {
  await authService.createUser({ username, password: "pass", role }, seedActor);
  const loginResponse = await request(app).post("/api/auth/login").send({ username, password: "pass" });
  const tempCookie = getCookie(loginResponse);
  const changeResponse = await request(app).post("/api/auth/change-password").set("Cookie", tempCookie).send({ newPassword: "pass" });
  return getCookie(changeResponse);
}

async function seedTemplates(app: express.Express, cookie: string) {
  // Title templates at different role levels
  await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
    name: "Admin Title",
    category: "title",
    formatString: "{Date} - {Speaker} - {Title}",
    roleMinimum: "ADMIN",
  });
  await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
    name: "Power Title",
    category: "title",
    formatString: "{Date} - {Title}",
    roleMinimum: "AvPowerUser",
  });
  await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
    name: "Vol Title",
    category: "title",
    formatString: "{Date}",
    roleMinimum: "AvVolunteer",
  });
  // Description template at volunteer level
  await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
    name: "Vol Desc",
    category: "description",
    formatString: "{Speaker}",
    roleMinimum: "AvVolunteer",
  });
}

describe("GET /api/templates (role filtering)", () => {
  it("ADMIN sees all templates", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    await seedTemplates(app, cookie);
    const response = await request(app).get("/api/templates").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(4);
  });

  it("AvPowerUser sees AvPowerUser and AvVolunteer templates", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "ADMIN");
    await seedTemplates(app, adminCookie);
    const powerCookie = await loginAs(app, authService, "power", "AvPowerUser");
    const response = await request(app).get("/api/templates").set("Cookie", powerCookie);
    expect(response.status).toBe(200);
    const names = (response.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("Power Title");
    expect(names).toContain("Vol Title");
    expect(names).toContain("Vol Desc");
    expect(names).not.toContain("Admin Title");
  });

  it("AvVolunteer sees only AvVolunteer templates", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "ADMIN");
    await seedTemplates(app, adminCookie);
    const volCookie = await loginAs(app, authService, "vol", "AvVolunteer");
    const response = await request(app).get("/api/templates").set("Cookie", volCookie);
    expect(response.status).toBe(200);
    const names = (response.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("Vol Title");
    expect(names).toContain("Vol Desc");
    expect(names).not.toContain("Power Title");
    expect(names).not.toContain("Admin Title");
  });

  it("returns 401 without cookie", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/templates")).status).toBe(401);
  });
});
