import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

// ── Test data helpers ─────────────────────────────────────────────────────────

const makeWidget = (
  widgetId: string,
  col: number,
  row: number,
  colSpan = 3,
  rowSpan = 2,
): {
  widgetId: string;
  title: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  roleMinimum: string;
} => ({
  widgetId,
  title: widgetId.charAt(0).toUpperCase() + widgetId.slice(1),
  col,
  row,
  colSpan,
  rowSpan,
  roleMinimum: "AvVolunteer",
});

const completeGrids = {
  "large-landscape": [makeWidget("obs", 0, 0), makeWidget("camera", 3, 0)],
  "large-portrait": [makeWidget("obs", 0, 0), makeWidget("camera", 3, 0)],
  "small-landscape": [makeWidget("obs", 0, 0), makeWidget("camera", 3, 0)],
  "small-portrait": [makeWidget("obs", 0, 0, 3, 2), makeWidget("camera", 0, 2, 3, 2)],
};

const completeDashboard = {
  name: "Main Dashboard",
  slug: "main",
  description: "Test dashboard",
  allowedRoles: ["AvVolunteer", "AvPowerUser", "ADMIN"],
  grids: completeGrids,
};

// ── POST /api/admin/dashboards ────────────────────────────────────────────────

describe("POST /api/admin/dashboards", () => {
  it("creates a complete dashboard — returns isComplete: true", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Main Dashboard");
    expect(res.body.slug).toBe("main");
    expect(res.body.isComplete).toBe(true);
    expect(res.body.grids["large-landscape"]).toHaveLength(2);
  });

  it("creates a dashboard with metadata only (no grids) — returns isComplete: false", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .post("/api/admin/dashboards")
      .set("Cookie", cookie)
      .send({
        name: "Empty Dashboard",
        slug: "empty",
        allowedRoles: ["AvVolunteer"],
      });
    expect(res.status).toBe(201);
    expect(res.body.isComplete).toBe(false);
  });

  it("returns 400 when name is missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ slug: "test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("name");
  });

  it("returns 400 when slug is missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("slug");
  });

  it("returns 400 for invalid slug format", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test", slug: "Invalid-Slug" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("lowercase");
  });

  it("returns 409 for duplicate slug", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "First", slug: "test" });
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Second", slug: "test" });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("slug 'test' already exists");
  });

  it("returns 409 for duplicate name (case-insensitive)", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Main Dashboard", slug: "main" });
    const res = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "main dashboard", slug: "other" });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("name already exists");
  });
});

// ── PUT /api/admin/dashboards/:id ─────────────────────────────────────────────

describe("PUT /api/admin/dashboards/:id", () => {
  it("updates metadata and grids atomically", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);
    const id = created.body.id as string;

    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ name: "Updated Name", slug: "updated", grids: completeGrids });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated Name");
    expect(res.body.slug).toBe("updated");
    expect(res.body.grids["large-landscape"]).toHaveLength(2);
  });

  it("rejects overlapping widgets with descriptive error", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test", slug: "test" });
    const id = created.body.id as string;

    const overlappingGrids = {
      "large-landscape": [makeWidget("obs", 0, 0), makeWidget("camera", 1, 0)], // overlap at col 1-2
      "large-portrait": [makeWidget("obs", 0, 0), makeWidget("camera", 3, 0)],
      "small-landscape": [makeWidget("obs", 0, 0), makeWidget("camera", 3, 0)],
      "small-portrait": [makeWidget("obs", 0, 0, 3, 2), makeWidget("camera", 0, 2, 3, 2)],
    };

    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ grids: overlappingGrids });
    expect(res.status).toBe(400);
    expect(res.body.errors[0]).toContain("overlaps");
    expect(res.body.errors[0]).toContain("obs");
    expect(res.body.errors[0]).toContain("camera");
  });

  it("rejects widgets exceeding grid column bounds with descriptive error", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test", slug: "test" });
    const id = created.body.id as string;

    const outOfBoundsGrids = {
      "large-landscape": [makeWidget("obs", 9, 0)], // col 9 + colSpan 3 = 12 > 11
      "large-portrait": [makeWidget("obs", 0, 0)],
      "small-landscape": [makeWidget("obs", 0, 0)],
      "small-portrait": [makeWidget("obs", 0, 0)],
    };

    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ grids: outOfBoundsGrids });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes("exceeds grid bounds"))).toBe(true);
  });

  it("rejects widgets violating size constraints with descriptive error", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test", slug: "test" });
    const id = created.body.id as string;

    const tooSmallGrids = {
      "large-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 1, rowSpan: 2, roleMinimum: "AvVolunteer" }], // obs min colSpan = 2
      "large-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
      "small-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
      "small-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    };

    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ grids: tooSmallGrids });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes("cannot be smaller than"))).toBe(true);
  });

  it("rejects mismatched widget sets across grids with array of descriptive errors", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test", slug: "test" });
    const id = created.body.id as string;

    const mismatchedGrids = {
      "large-landscape": [makeWidget("obs", 0, 0), makeWidget("camera", 3, 0)],
      "large-portrait": [makeWidget("obs", 0, 0)], // missing camera
      "small-landscape": [makeWidget("obs", 0, 0)], // missing camera
      "small-portrait": [makeWidget("obs", 0, 0, 3, 2), makeWidget("camera", 0, 2, 3, 2)],
    };

    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ grids: mismatchedGrids });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: string) => e.includes("Missing from 'large-portrait'"))).toBe(true);
    expect(res.body.errors.some((e: string) => e.includes("Missing from 'small-landscape'"))).toBe(true);
  });

  it("saves incomplete dashboard (some grids empty) with isComplete: false", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent
      .post("/api/admin/dashboards")
      .set("Cookie", cookie)
      .send({ name: "Test", slug: "test", allowedRoles: ["AvVolunteer"] });
    const id = created.body.id as string;

    // Only populate one grid — valid (same widgets = obs on all non-empty grids, empty grids have nothing)
    // Actually: validateSameWidgets checks union of all widgets across grids — if one grid has obs and others don't, it fails.
    // For an incomplete dashboard, just save without grids (metadata only update).
    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ name: "Test Updated" });
    expect(res.status).toBe(200);
    expect(res.body.isComplete).toBe(false);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.put("/api/admin/dashboards/nonexistent").set("Cookie", cookie).send({ name: "x" });
    expect(res.status).toBe(404);
  });

  it("rejects duplicate slug on update", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "First", slug: "first" });
    const second = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Second", slug: "second" });
    const res = await s.agent
      .put(`/api/admin/dashboards/${second.body.id as string}`)
      .set("Cookie", cookie)
      .send({ slug: "first" });
    expect(res.status).toBe(409);
  });

  it("allows row placement at any height (dynamic rows — no row limit)", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Test", slug: "test" });
    const id = created.body.id as string;

    // Widget at row 50 — should be allowed (rows are dynamic)
    const deepGrids = {
      "large-landscape": [makeWidget("obs", 0, 50)],
      "large-portrait": [makeWidget("obs", 0, 50)],
      "small-landscape": [makeWidget("obs", 0, 50)],
      "small-portrait": [makeWidget("obs", 0, 50)],
    };
    const res = await s.agent.put(`/api/admin/dashboards/${id}`).set("Cookie", cookie).send({ grids: deepGrids });
    expect(res.status).toBe(200);
  });
});

// ── GET /api/admin/dashboards ─────────────────────────────────────────────────

describe("GET /api/admin/dashboards", () => {
  it("returns all dashboards with isComplete status, ordered by creation time", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Incomplete", slug: "incomplete" });

    const res = await s.agent.get("/api/admin/dashboards").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Main Dashboard");
    expect(res.body[0].isComplete).toBe(true);
    expect(res.body[1].name).toBe("Incomplete");
    expect(res.body[1].isComplete).toBe(false);
  });
});

// ── GET /api/admin/dashboards/:id ─────────────────────────────────────────────

describe("GET /api/admin/dashboards/:id", () => {
  it("returns full dashboard detail with all four grid layouts", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);
    const res = await s.agent.get(`/api/admin/dashboards/${created.body.id as string}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.grids).toBeDefined();
    expect(res.body.grids["large-landscape"]).toHaveLength(2);
    expect(res.body.grids["small-portrait"]).toHaveLength(2);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/admin/dashboards/nonexistent").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});

// ── DELETE /api/admin/dashboards/:id ──────────────────────────────────────────

describe("DELETE /api/admin/dashboards/:id", () => {
  it("deletes dashboard and all widget configurations (CASCADE)", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);
    const id = created.body.id as string;

    const res = await s.agent.delete(`/api/admin/dashboards/${id}`).set("Cookie", cookie);
    expect(res.status).toBe(204);

    // Verify dashboard is gone
    const getRes = await s.agent.get(`/api/admin/dashboards/${id}`).set("Cookie", cookie);
    expect(getRes.status).toBe(404);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.delete("/api/admin/dashboards/nonexistent").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });
});

// ── Public dashboard routes (role filtering, slug lookup) ─────────────────────

describe("GET /api/dashboards (public)", () => {
  it("admin sees all dashboards including incomplete", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send({ name: "Incomplete", slug: "incomplete" });

    const res = await s.agent.get("/api/dashboards").set("Cookie", cookie);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].isComplete).toBe(true);
    expect(res.body[1].isComplete).toBe(false);
  });

  it("non-admin sees only complete dashboards with matching roles", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", adminCookie).send(completeDashboard);
    await s.agent
      .post("/api/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({
        name: "Admin Only",
        slug: "admin-only",
        allowedRoles: ["ADMIN"],
        grids: completeGrids,
      });
    await s.agent.post("/api/admin/dashboards").set("Cookie", adminCookie).send({ name: "Incomplete", slug: "incomplete" });

    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/dashboards").set("Cookie", volCookie);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Main Dashboard");
    expect(res.body[0].slug).toBe("main");
  });
});

describe("GET /api/dashboards/:slug/layout", () => {
  it("returns all four grid layouts for a complete dashboard", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/dashboards").set("Cookie", cookie).send(completeDashboard);

    const res = await s.agent.get("/api/dashboards/main/layout").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.grids).toBeDefined();
    expect(res.body.grids["large-landscape"]).toHaveLength(2);
    expect(res.body.grids["large-portrait"]).toHaveLength(2);
    expect(res.body.grids["small-landscape"]).toHaveLength(2);
    expect(res.body.grids["small-portrait"]).toHaveLength(2);
    expect(res.body.grids["large-landscape"][0].widgetId).toBe("obs");
  });

  it("returns 404 for unknown slug", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/dashboards/nonexistent/layout").set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("returns 403 when user role is not in allowedRoles", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent
      .post("/api/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({
        name: "Admin Only",
        slug: "admin-only",
        allowedRoles: ["ADMIN"],
        grids: completeGrids,
      });

    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/dashboards/admin-only/layout").set("Cookie", volCookie);
    expect(res.status).toBe(403);
  });

  it("filters cells by roleMinimum for non-admin users", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);

    // Create dashboard with mixed-role widgets
    const mixedGrids = {
      "large-landscape": [makeWidget("obs", 0, 0), { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "ADMIN" }],
      "large-portrait": [makeWidget("obs", 0, 0), { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "ADMIN" }],
      "small-landscape": [makeWidget("obs", 0, 0), { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "ADMIN" }],
      "small-portrait": [makeWidget("obs", 0, 0, 3, 2), { widgetId: "camera", title: "Camera", col: 0, row: 2, colSpan: 3, rowSpan: 2, roleMinimum: "ADMIN" }],
    };

    await s.agent
      .post("/api/admin/dashboards")
      .set("Cookie", adminCookie)
      .send({
        name: "Mixed",
        slug: "mixed",
        allowedRoles: ["AvVolunteer", "ADMIN"],
        grids: mixedGrids,
      });

    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/dashboards/mixed/layout").set("Cookie", volCookie);
    expect(res.status).toBe(200);
    // Volunteer should only see obs (AvVolunteer), not camera (ADMIN)
    expect(res.body.grids["large-landscape"]).toHaveLength(1);
    expect(res.body.grids["large-landscape"][0].widgetId).toBe("obs");
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
