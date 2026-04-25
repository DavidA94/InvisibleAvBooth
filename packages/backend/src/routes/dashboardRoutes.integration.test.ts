import { describe, it, expect } from "vitest";
import express from "express";

import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { SessionManifestService } from "../services/sessionManifestService.js";
import { authenticate, requirePasswordChanged } from "../middleware/auth.js";
import { createAuthRouter } from "./authRoutes.js";
import { createAdminDashboardRouter } from "./adminDashboardRoutes.js";
import { createDashboardRouter } from "./dashboardRoutes.js";
import { createSessionRouter } from "./sessionRoutes.js";

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

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
  app.use("/api/admin/dashboards", mustBeAuthenticated, mustHaveChangedPassword, createAdminDashboardRouter(database, authService));
  app.use("/api/dashboards", mustBeAuthenticated, mustHaveChangedPassword, createDashboardRouter(database, authService));
  app.use("/api/session", mustBeAuthenticated, mustHaveChangedPassword, createSessionRouter(new SessionManifestService()));
  return { app, database, authService };
}

async function loginAs(app: express.Express, authService: AuthService, username: string, password: string, role: "ADMIN" | "AvPowerUser" | "AvVolunteer") {
  await authService.createUser({ username, password, role }, seedActor);
  const loginResponse = await request(app).post("/api/auth/login").send({ username, password });
  const tempToken = (loginResponse.body as { token?: string }).token ?? "";
  const changeResponse = await request(app).post("/api/auth/change-password").set("Authorization", `Bearer ${tempToken}`).send({ newPassword: password });
  return (changeResponse.body as { token?: string }).token || tempToken;
}

const baseDashboard = { name: "Main Dashboard", description: "Test", allowedRoles: ["AvVolunteer", "AvPowerUser"] };
const baseWidget = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" };

// ── Admin dashboard CRUD ──────────────────────────────────────────────────────

describe("POST /api/admin/dashboards", () => {
  it("creates a dashboard", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const response = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    expect(response.status).toBe(201);
    expect(response.body.name).toBe("Main Dashboard");
    expect(Array.isArray(response.body.allowedRoles)).toBe(true);
  });

  it("returns 400 when name is missing", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send({})).status).toBe(400);
  });
});

describe("GET /api/admin/dashboards", () => {
  it("returns all dashboards for ADMIN", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    const response = await request(app).get("/api/admin/dashboards").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
  });
});

describe("PUT /api/admin/dashboards/:id", () => {
  it("updates a dashboard", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const created = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    const response = await request(app)
      .put(`/api/admin/dashboards/${created.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Updated" });
    expect(response.status).toBe(200);
    expect(response.body.name).toBe("Updated");
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).put("/api/admin/dashboards/nonexistent").set("Authorization", `Bearer ${token}`).send({ name: "x" })).status).toBe(404);
  });
});

describe("DELETE /api/admin/dashboards/:id", () => {
  it("deletes a dashboard", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const created = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    expect(
      (
        await request(app)
          .delete(`/api/admin/dashboards/${created.body.id as string}`)
          .set("Authorization", `Bearer ${token}`)
      ).status,
    ).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).delete("/api/admin/dashboards/nonexistent").set("Authorization", `Bearer ${token}`)).status).toBe(404);
  });
});

// ── Widget CRUD ───────────────────────────────────────────────────────────────

describe("POST /api/admin/dashboards/:id/widgets", () => {
  it("creates a widget", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    const response = await request(app)
      .post(`/api/admin/dashboards/${dash.body.id as string}/widgets`)
      .set("Authorization", `Bearer ${token}`)
      .send(baseWidget);
    expect(response.status).toBe(201);
    expect(response.body.widgetId).toBe("obs");
  });

  it("returns 409 on duplicate widgetId", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    const id = dash.body.id as string;
    await request(app).post(`/api/admin/dashboards/${id}/widgets`).set("Authorization", `Bearer ${token}`).send(baseWidget);
    expect((await request(app).post(`/api/admin/dashboards/${id}/widgets`).set("Authorization", `Bearer ${token}`).send(baseWidget)).status).toBe(409);
  });

  it("returns 400 when required fields are missing", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    expect(
      (
        await request(app)
          .post(`/api/admin/dashboards/${dash.body.id as string}/widgets`)
          .set("Authorization", `Bearer ${token}`)
          .send({ widgetId: "obs" })
      ).status,
    ).toBe(400);
  });
});

describe("PUT /api/admin/dashboards/:id/widgets/:widgetId", () => {
  it("updates a widget", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    const dashId = dash.body.id as string;
    const widget = await request(app).post(`/api/admin/dashboards/${dashId}/widgets`).set("Authorization", `Bearer ${token}`).send(baseWidget);
    const response = await request(app)
      .put(`/api/admin/dashboards/${dashId}/widgets/${widget.body.id as string}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ title: "Updated OBS" });
    expect(response.status).toBe(200);
    expect(response.body.title).toBe("Updated OBS");
  });
});

describe("DELETE /api/admin/dashboards/:id/widgets/:widgetId", () => {
  it("deletes a widget", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${token}`).send(baseDashboard);
    const dashId = dash.body.id as string;
    const widget = await request(app).post(`/api/admin/dashboards/${dashId}/widgets`).set("Authorization", `Bearer ${token}`).send(baseWidget);
    expect(
      (
        await request(app)
          .delete(`/api/admin/dashboards/${dashId}/widgets/${widget.body.id as string}`)
          .set("Authorization", `Bearer ${token}`)
      ).status,
    ).toBe(204);
  });
});

// ── GET /api/dashboards — role filtering ──────────────────────────────────────

describe("GET /api/dashboards", () => {
  it("ADMIN sees all dashboards", async () => {
    const { app, authService } = buildApp();
    const adminToken = await loginAs(app, authService, "admin", "pass", "ADMIN");
    await request(app)
      .post("/api/admin/dashboards")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "A", allowedRoles: ["AvVolunteer"] });
    await request(app)
      .post("/api/admin/dashboards")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "B", allowedRoles: ["ADMIN"] });
    const response = await request(app).get("/api/dashboards").set("Authorization", `Bearer ${adminToken}`);
    expect(response.body).toHaveLength(2);
  });

  it("AvVolunteer sees only matching dashboards", async () => {
    const { app, authService } = buildApp();
    const adminToken = await loginAs(app, authService, "admin", "pass", "ADMIN");
    await request(app)
      .post("/api/admin/dashboards")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Volunteer", allowedRoles: ["AvVolunteer"] });
    await request(app)
      .post("/api/admin/dashboards")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Only", allowedRoles: ["ADMIN"] });
    const volToken = await loginAs(app, authService, "vol", "pass", "AvVolunteer");
    const response = await request(app).get("/api/dashboards").set("Authorization", `Bearer ${volToken}`);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].name).toBe("Volunteer");
  });
});

// ── GET /api/dashboards/:id/layout ────────────────────────────────────────────

describe("GET /api/dashboards/:id/layout", () => {
  it("returns GridManifest with version and cells", async () => {
    const { app, authService } = buildApp();
    const adminToken = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/api/admin/dashboards").set("Authorization", `Bearer ${adminToken}`).send(baseDashboard);
    const dashId = dash.body.id as string;
    await request(app).post(`/api/admin/dashboards/${dashId}/widgets`).set("Authorization", `Bearer ${adminToken}`).send(baseWidget);
    const response = await request(app).get(`/api/dashboards/${dashId}/layout`).set("Authorization", `Bearer ${adminToken}`);
    expect(response.status).toBe(200);
    expect(response.body.version).toBe(1);
    expect(response.body.cells).toHaveLength(1);
    expect(response.body.cells[0].widgetId).toBe("obs");
  });

  it("returns 403 when user role is not in allowedRoles", async () => {
    const { app, authService } = buildApp();
    const adminToken = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app)
      .post("/api/admin/dashboards")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ name: "Admin Only", allowedRoles: ["ADMIN"] });
    const volToken = await loginAs(app, authService, "vol", "pass", "AvVolunteer");
    expect(
      (
        await request(app)
          .get(`/api/dashboards/${dash.body.id as string}/layout`)
          .set("Authorization", `Bearer ${volToken}`)
      ).status,
    ).toBe(403);
  });

  it("returns 404 for unknown dashboard", async () => {
    const { app, authService } = buildApp();
    const adminToken = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).get("/api/dashboards/nonexistent/layout").set("Authorization", `Bearer ${adminToken}`)).status).toBe(404);
  });
});

// ── GET /api/session/manifest ─────────────────────────────────────────────────

describe("GET /api/session/manifest", () => {
  it("returns empty manifest initially", async () => {
    const { app, authService } = buildApp();
    const token = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const response = await request(app).get("/api/session/manifest").set("Authorization", `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({});
  });

  it("returns 401 without auth", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/session/manifest")).status).toBe(401);
  });
});
