import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

// ── CRUD ──────────────────────────────────────────────────────────────────────

describe("GET /api/admin/templates", () => {
  it("returns all templates", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/admin/templates").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe("POST /api/admin/templates", () => {
  it("creates a template", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Test",
      category: "title",
      formatString: "{Date} - {Title}",
      roleMinimum: "AvVolunteer",
    });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Test");
  });

  it("rejects when blockers exist", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Bad",
      category: "title",
      formatString: "{Unknown}",
      roleMinimum: "AvVolunteer",
    });
    expect(res.status).toBe(422);
    expect(res.body.blockers.length).toBeGreaterThan(0);
  });

  it("returns 400 when required fields are missing", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({ name: "X" });
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/admin/templates/:id", () => {
  it("updates a template", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Editable",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const res = await s.agent
      .put(`/api/admin/templates/${created.body.id as string}`)
      .set("Cookie", cookie)
      .send({ name: "Renamed" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Renamed");
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.put("/api/admin/templates/nonexistent").set("Cookie", cookie).send({ name: "X" })).status).toBe(404);
  });

  it("rejects update with blockers (duplicate name)", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "First",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const second = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Second",
      category: "title",
      formatString: "{Title}",
      roleMinimum: "AvVolunteer",
    });
    const res = await s.agent
      .put(`/api/admin/templates/${second.body.id as string}`)
      .set("Cookie", cookie)
      .send({ name: "First" });
    expect(res.status).toBe(422);
  });
});

describe("DELETE /api/admin/templates/:id", () => {
  it("deletes a template", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "ToDelete",
      category: "description",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    expect((await s.agent.delete(`/api/admin/templates/${created.body.id as string}`).set("Cookie", cookie)).status).toBe(204);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.delete("/api/admin/templates/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });

  it("guards against deleting the last title template", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Only",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const res = await s.agent.delete(`/api/admin/templates/${created.body.id as string}`).set("Cookie", cookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("last title template");
  });
});

// ── Validation endpoint ───────────────────────────────────────────────────────

describe("POST /api/admin/templates/validate", () => {
  it("returns blockers and warnings without persisting", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates/validate").set("Cookie", cookie).send({
      name: "Test",
      category: "title",
      formatString: "{Unknown}",
      roleMinimum: "AvVolunteer",
    });
    expect(res.status).toBe(200);
    expect(res.body.blockers.length).toBeGreaterThan(0);
    const list = await s.agent.get("/api/admin/templates").set("Cookie", cookie);
    expect((list.body as unknown[]).length).toBe(0);
  });

  it("returns warnings for AvVolunteer with multiple templates", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Existing",
      category: "title",
      formatString: "{Date}",
      roleMinimum: "AvVolunteer",
    });
    const res = await s.agent.post("/api/admin/templates/validate").set("Cookie", cookie).send({
      name: "New",
      category: "title",
      formatString: "{Title}",
      roleMinimum: "AvVolunteer",
    });
    expect(res.status).toBe(200);
    expect(res.body.warnings.length).toBeGreaterThan(0);
  });
});

// ── ADMIN-only access ─────────────────────────────────────────────────────────

describe("ADMIN-only access", () => {
  it("returns 401 without cookie", async () => {
    expect((await s.agent.get("/api/admin/templates")).status).toBe(401);
  });

  it("returns 403 for AvVolunteer", async () => {
    const cookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    expect((await s.agent.get("/api/admin/templates").set("Cookie", cookie)).status).toBe(403);
  });

  it("returns 403 for AvPowerUser", async () => {
    const cookie = await loginAs(s.agent, s.ctx.authService, "power", "pass", "AvPowerUser");
    expect((await s.agent.get("/api/admin/templates").set("Cookie", cookie)).status).toBe(403);
  });
});

// ── Lower-Third Templates ─────────────────────────────────────────────────────

describe("POST /api/admin/templates — lower_third", () => {
  it("creates a lower-third template with lowerThirdType and autoDismissMs", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Speaker LT",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
      autoDismissMs: 5000,
    });
    expect(res.status).toBe(201);
    expect(res.body.category).toBe("lower_third");
    expect(res.body.lowerThirdType).toBe("Title");
    expect(res.body.autoDismissMs).toBe(5000);
  });

  it("returns 400 when lowerThirdType is missing for lower_third category", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Bad LT",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("lowerThirdType");
  });

  it("allows null autoDismissMs (no auto-dismiss)", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Scripture LT",
      category: "lower_third",
      formatString: '{"title":"{Scripture}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Scripture",
    });
    expect(res.status).toBe(201);
    expect(res.body.autoDismissMs).toBeNull();
  });

  it("rejects unknown tokens in JSON formatString", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Bad Tokens",
      category: "lower_third",
      formatString: '{"title":"{BadToken}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
    });
    expect(res.status).toBe(422);
    expect(res.body.blockers[0]).toContain("{BadToken}");
  });

  it("detects duplicate formatString via canonical JSON comparison", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "First",
      category: "lower_third",
      formatString: '{"title":"{Speaker}","subtitle":"{Title}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "TitleSubtitle",
    });
    // Same content, different key order
    const res = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Second",
      category: "lower_third",
      formatString: '{"subtitle":"{Title}","title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "TitleSubtitle",
    });
    expect(res.status).toBe(422);
    expect(res.body.blockers[0]).toContain("Duplicate format string");
  });
});

describe("PUT /api/admin/templates/:id — lower_third", () => {
  it("updates autoDismissMs on a lower-third template", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({
      name: "Updatable",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
      autoDismissMs: 5000,
    });
    const res = await s.agent
      .put(`/api/admin/templates/${created.body.id as string}`)
      .set("Cookie", cookie)
      .send({ autoDismissMs: 10000 });
    expect(res.status).toBe(200);
    expect(res.body.autoDismissMs).toBe(10000);
  });
});
