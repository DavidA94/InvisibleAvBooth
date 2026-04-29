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
  return { app, authService, database };
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

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe("GET /api/admin/templates", () => {
  it("returns all templates", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).get("/api/admin/templates").set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);
  });
});

describe("POST /api/admin/templates", () => {
  it("creates a template", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Test",
      category: "title",
      formatString: "{Date} - {Title}",
      roleMinimum: "AvVolunteer",
    });
    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Test");
  });

  it("rejects when blockers exist", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Bad",
      category: "title",
      formatString: "{Unknown}",
      roleMinimum: "AvVolunteer",
    });
    expect(response.status).toBe(422);
    expect(response.body.blockers.length).toBeGreaterThan(0);
  });

  it("returns 400 when required fields are missing", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({ name: "X" });
    expect(response.status).toBe(400);
  });
});

describe("PUT /api/admin/templates/:id", () => {
  it("updates a template", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const createResponse = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Editable",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const id = createResponse.body.id as string;
    const response = await request(app).put(`/api/admin/templates/${id}`).set("Cookie", cookie).send({ name: "Renamed" });
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Renamed");
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).put("/api/admin/templates/nonexistent").set("Cookie", cookie).send({ name: "X" });
    expect(response.status).toBe(404);
  });

  it("rejects update with blockers", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    // Create two templates
    await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "First",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const second = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Second",
      category: "title",
      formatString: "{Title}",
      roleMinimum: "AvVolunteer",
    });
    // Try to rename Second to First (duplicate name)
    const response = await request(app)
      .put(`/api/admin/templates/${second.body.id as string}`)
      .set("Cookie", cookie)
      .send({ name: "First" });
    expect(response.status).toBe(422);
  });
});

describe("DELETE /api/admin/templates/:id", () => {
  it("deletes a template", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const createResponse = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "ToDelete",
      category: "description",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const response = await request(app)
      .delete(`/api/admin/templates/${createResponse.body.id as string}`)
      .set("Cookie", cookie);
    expect(response.status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).delete("/api/admin/templates/nonexistent").set("Cookie", cookie);
    expect(response.status).toBe(404);
  });

  it("guards against deleting the last title template", async () => {
    const { app, authService, database } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    // Seed a single title template
    const createResponse = await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Only",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const response = await request(app)
      .delete(`/api/admin/templates/${createResponse.body.id as string}`)
      .set("Cookie", cookie);
    expect(response.status).toBe(400);
    expect(response.body.error).toContain("last title template");
    void database;
  });
});

// ── Validation endpoint ───────────────────────────────────────────────────────

describe("POST /api/admin/templates/validate", () => {
  it("returns blockers and warnings without persisting", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    const response = await request(app).post("/api/admin/templates/validate").set("Cookie", cookie).send({
      name: "Test",
      category: "title",
      formatString: "{Unknown}",
      roleMinimum: "AvVolunteer",
    });
    expect(response.status).toBe(200);
    expect(response.body.blockers.length).toBeGreaterThan(0);
    // Verify nothing was persisted
    const list = await request(app).get("/api/admin/templates").set("Cookie", cookie);
    expect((list.body as unknown[]).length).toBe(0);
  });

  it("returns warnings for AvVolunteer with multiple templates", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "ADMIN");
    // Create an existing title template
    await request(app).post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Existing",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const response = await request(app).post("/api/admin/templates/validate").set("Cookie", cookie).send({
      name: "New",
      category: "title",
      formatString: "{Title}",
      roleMinimum: "AvVolunteer",
    });
    expect(response.status).toBe(200);
    expect(response.body.warnings.length).toBeGreaterThan(0);
  });
});

// ── ADMIN-only access ─────────────────────────────────────────────────────────

describe("ADMIN-only access", () => {
  it("returns 401 without cookie", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/admin/templates")).status).toBe(401);
  });

  it("returns 403 for AvVolunteer", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "vol", "AvVolunteer");
    expect((await request(app).get("/api/admin/templates").set("Cookie", cookie)).status).toBe(403);
  });

  it("returns 403 for AvPowerUser", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "power", "AvPowerUser");
    expect((await request(app).get("/api/admin/templates").set("Cookie", cookie)).status).toBe(403);
  });
});
