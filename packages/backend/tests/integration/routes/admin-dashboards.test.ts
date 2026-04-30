import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => { s = await buildTestServer(); });
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

const baseDashboard = { name: "Main Dashboard", description: "Test", allowedRoles: ["AvVolunteer", "AvPowerUser"] };
const baseWidget = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" };

// ── Admin dashboard CRUD ──────────────────────────────────────────────────────

describe("POST /api/admin/dashboards", () => {
  it("creates a dashboard", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Main Dashboard");
    expect(Array.isArray(res.body.allowedRoles)).toBe(true);
  });

  it("returns 400 when name is missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({})).status).toBe(400);
  });
});

describe("GET /api/admin/dashboards", () => {
  it("returns all dashboards for ADMIN", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const res = await s.agent.get("/api/admin/dashboards").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("PUT /api/admin/dashboards/:id", () => {
  it("updates a dashboard", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const res = await s.agent.put(`/api/admin/dashboards/${created.body.id as string}`).set("Cookie", cookie).send({ name: "Updated" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated");
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.put("/api/admin/dashboards/nonexistent").set("Cookie", cookie).send({ name: "x" })).status).toBe(404);
  });
});

describe("DELETE /api/admin/dashboards/:id", () => {
  it("deletes a dashboard", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    expect((await s.agent.delete(`/api/admin/dashboards/${created.body.id as string}`).set("Cookie", cookie)).status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.delete("/api/admin/dashboards/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });
});

// ── Widget CRUD ───────────────────────────────────────────────────────────────

describe("POST /api/admin/dashboards/:id/widgets", () => {
  it("creates a widget", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const res = await s.agent.post(`/api/admin/dashboards/${dash.body.id as string}/widgets`).set("Cookie", cookie).send(baseWidget);
    expect(res.status).toBe(201);
    expect(res.body.widgetId).toBe("obs");
  });

  it("returns 409 on duplicate widgetId", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const id = dash.body.id as string;
    await s.agent.post(`/api/admin/dashboards/${id}/widgets`).set("Cookie", cookie).send(baseWidget);
    expect((await s.agent.post(`/api/admin/dashboards/${id}/widgets`).set("Cookie", cookie).send(baseWidget)).status).toBe(409);
  });

  it("returns 400 when required fields are missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    expect((await s.agent.post(`/api/admin/dashboards/${dash.body.id as string}/widgets`).set("Cookie", cookie).send({ widgetId: "obs" })).status).toBe(400);
  });
});

describe("PUT /api/admin/dashboards/:id/widgets/:widgetId", () => {
  it("updates a widget", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const dashId = dash.body.id as string;
    const widget = await s.agent.post(`/api/admin/dashboards/${dashId}/widgets`).set("Cookie", cookie).send(baseWidget);
    const res = await s.agent.put(`/api/admin/dashboards/${dashId}/widgets/${widget.body.id as string}`).set("Cookie", cookie).send({ title: "Updated OBS" });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe("Updated OBS");
  });
});

describe("DELETE /api/admin/dashboards/:id/widgets/:widgetId", () => {
  it("deletes a widget", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const dashId = dash.body.id as string;
    const widget = await s.agent.post(`/api/admin/dashboards/${dashId}/widgets`).set("Cookie", cookie).send(baseWidget);
    expect((await s.agent.delete(`/api/admin/dashboards/${dashId}/widgets/${widget.body.id as string}`).set("Cookie", cookie)).status).toBe(204);
  });
});

// ── Public dashboard routes (role filtering) ─────────────────────────────────

describe("GET /api/dashboards", () => {
  it("ADMIN sees all dashboards", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "A", allowedRoles: ["AvVolunteer"] });
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "B", allowedRoles: ["ADMIN"] });
    const res = await s.agent.get("/api/dashboards").set("Cookie", cookie);
    expect(res.body).toHaveLength(2);
  });

  it("AvVolunteer sees only matching dashboards", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", adminCookie).send({ name: "Volunteer", allowedRoles: ["AvVolunteer"] });
    await s.agent.post("/api/admin/dashboards").set("Cookie", adminCookie).send({ name: "Admin Only", allowedRoles: ["ADMIN"] });
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/dashboards").set("Cookie", volCookie);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Volunteer");
  });
});

describe("GET /api/dashboards/:id/layout", () => {
  it("returns GridManifest with version and cells", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(baseDashboard);
    const dashId = dash.body.id as string;
    await s.agent.post(`/api/admin/dashboards/${dashId}/widgets`).set("Cookie", cookie).send(baseWidget);
    const res = await s.agent.get(`/api/dashboards/${dashId}/layout`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(1);
    expect(res.body.cells).toHaveLength(1);
    expect(res.body.cells[0].widgetId).toBe("obs");
  });

  it("returns 403 when user role is not in allowedRoles", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const dash = await s.agent.post("/api/admin/dashboards").set("Cookie", adminCookie).send({ name: "Admin Only", allowedRoles: ["ADMIN"] });
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    expect((await s.agent.get(`/api/dashboards/${dash.body.id as string}/layout`).set("Cookie", volCookie)).status).toBe(403);
  });

  it("returns 404 for unknown dashboard", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.get("/api/dashboards/nonexistent/layout").set("Cookie", cookie)).status).toBe(404);
  });
});

// ── GET /api/session/manifest ─────────────────────────────────────────────────

describe("GET /api/session/manifest", () => {
  it("returns empty manifest initially", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/session/manifest").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  it("returns 401 without auth", async () => {
    expect((await s.agent.get("/api/session/manifest")).status).toBe(401);
  });
});
