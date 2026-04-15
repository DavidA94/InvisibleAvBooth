import { describe, it, expect } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import Database from "better-sqlite3";
import { applySchema } from "../db/schema.js";
import { AuthService } from "../services/authService.js";
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
  app.use(cookieParser());
  app.use("/auth", createAuthRouter(authService));
  app.use("/admin/dashboards", createAdminDashboardRouter(database, authService));
  app.use("/api/dashboards", createDashboardRouter(database, authService));
  app.use("/api/session", createSessionRouter(authService));
  return { app, database, authService };
}

async function loginAs(app: express.Express, authService: AuthService, username: string, password: string, role: "ADMIN" | "AvPowerUser" | "AvVolunteer") {
  await authService.createUser({ username, password, role }, seedActor);
  const res = await request(app).post("/auth/login").send({ username, password });
  return (res.headers["set-cookie"] as unknown as string[])[0] ?? "";
}

const baseDashboard = { name: "Main Dashboard", description: "Test", allowedRoles: ["AvVolunteer", "AvPowerUser"] };
const baseWidget = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" };

// ── Admin dashboard CRUD ──────────────────────────────────────────────────────

describe("POST /admin/dashboards", () => {
  it("creates a dashboard", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const res = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Main Dashboard");
    expect(Array.isArray(res.body.allowedRoles)).toBe(true);
  });

  it("returns 400 when name is missing", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).post("/admin/dashboards").set("Cookie", cookie).send({})).status).toBe(400);
  });
});

describe("GET /admin/dashboards", () => {
  it("returns all dashboards for ADMIN", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const res = await request(app).get("/admin/dashboards").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("PUT /admin/dashboards/:id", () => {
  it("updates a dashboard", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const created = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const res = await request(app)
      .put(`/admin/dashboards/${created.body.id as string}`)
      .set("Cookie", cookie)
      .send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).put("/admin/dashboards/nonexistent").set("Cookie", cookie).send({ name: "x" })).status).toBe(404);
  });
});

describe("DELETE /admin/dashboards/:id", () => {
  it("deletes a dashboard", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const created = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    expect(
      (
        await request(app)
          .delete(`/admin/dashboards/${created.body.id as string}`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).delete("/admin/dashboards/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });
});

// ── Widget CRUD ───────────────────────────────────────────────────────────────

describe("POST /admin/dashboards/:id/widgets", () => {
  it("creates a widget", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const res = await request(app)
      .post(`/admin/dashboards/${dash.body.id as string}/widgets`)
      .set("Cookie", cookie)
      .send(baseWidget);
    expect(res.status).toBe(201);
    expect(res.body.widgetId).toBe("obs");
  });

  it("returns 409 on duplicate widgetId", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const id = dash.body.id as string;
    await request(app).post(`/admin/dashboards/${id}/widgets`).set("Cookie", cookie).send(baseWidget);
    expect((await request(app).post(`/admin/dashboards/${id}/widgets`).set("Cookie", cookie).send(baseWidget)).status).toBe(409);
  });

  it("returns 400 when required fields are missing", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    expect(
      (
        await request(app)
          .post(`/admin/dashboards/${dash.body.id as string}/widgets`)
          .set("Cookie", cookie)
          .send({ widgetId: "obs" })
      ).status,
    ).toBe(400);
  });
});

describe("PUT /admin/dashboards/:id/widgets/:widgetId", () => {
  it("updates a widget", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const dashId = dash.body.id as string;
    const widget = await request(app).post(`/admin/dashboards/${dashId}/widgets`).set("Cookie", cookie).send(baseWidget);
    const res = await request(app)
      .put(`/admin/dashboards/${dashId}/widgets/${widget.body.id as string}`)
      .set("Cookie", cookie)
      .send({ title: "Updated OBS" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated OBS");
  });
});

describe("DELETE /admin/dashboards/:id/widgets/:widgetId", () => {
  it("deletes a widget", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const dashId = dash.body.id as string;
    const widget = await request(app).post(`/admin/dashboards/${dashId}/widgets`).set("Cookie", cookie).send(baseWidget);
    expect(
      (
        await request(app)
          .delete(`/admin/dashboards/${dashId}/widgets/${widget.body.id as string}`)
          .set("Cookie", cookie)
      ).status,
    ).toBe(204);
  });
});

// ── GET /api/dashboards — role filtering ──────────────────────────────────────

describe("GET /api/dashboards", () => {
  it("ADMIN sees all dashboards", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    await request(app)
      .post("/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({ name: "A", allowedRoles: ["AvVolunteer"] });
    await request(app)
      .post("/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({ name: "B", allowedRoles: ["ADMIN"] });
    const res = await request(app).get("/api/dashboards").set("Cookie", adminCookie);
    expect(res.body).toHaveLength(2);
  });

  it("AvVolunteer sees only matching dashboards", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    await request(app)
      .post("/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({ name: "Volunteer", allowedRoles: ["AvVolunteer"] });
    await request(app)
      .post("/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({ name: "Admin Only", allowedRoles: ["ADMIN"] });
    const volCookie = await loginAs(app, authService, "vol", "pass", "AvVolunteer");
    const res = await request(app).get("/api/dashboards").set("Cookie", volCookie);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Volunteer");
  });
});

// ── GET /api/dashboards/:id/layout ────────────────────────────────────────────

describe("GET /api/dashboards/:id/layout", () => {
  it("returns GridManifest with version and cells", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app).post("/admin/dashboards").set("Cookie", adminCookie).send(baseDashboard);
    const dashId = dash.body.id as string;
    await request(app).post(`/admin/dashboards/${dashId}/widgets`).set("Cookie", adminCookie).send(baseWidget);
    const res = await request(app).get(`/api/dashboards/${dashId}/layout`).set("Cookie", adminCookie);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cells).toHaveLength(1);
    expect(res.body.cells[0].widgetId).toBe("obs");
  });

  it("returns 403 when user role is not in allowedRoles", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const dash = await request(app)
      .post("/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({ name: "Admin Only", allowedRoles: ["ADMIN"] });
    const volCookie = await loginAs(app, authService, "vol", "pass", "AvVolunteer");
    expect(
      (
        await request(app)
          .get(`/api/dashboards/${dash.body.id as string}/layout`)
          .set("Cookie", volCookie)
      ).status,
    ).toBe(403);
  });

  it("returns 404 for unknown dashboard", async () => {
    const { app, authService } = buildApp();
    const adminCookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    expect((await request(app).get("/api/dashboards/nonexistent/layout").set("Cookie", adminCookie)).status).toBe(404);
  });
});

// ── GET /api/session/manifest ─────────────────────────────────────────────────

describe("GET /api/session/manifest", () => {
  it("returns empty manifest initially", async () => {
    const { app, authService } = buildApp();
    const cookie = await loginAs(app, authService, "admin", "pass", "ADMIN");
    const res = await request(app).get("/api/session/manifest").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("returns 401 without auth", async () => {
    const { app } = buildApp();
    expect((await request(app).get("/api/session/manifest")).status).toBe(401);
  });
});
