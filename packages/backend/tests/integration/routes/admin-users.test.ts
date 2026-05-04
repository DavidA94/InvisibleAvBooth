import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

describe("GET /api/admin/users", () => {
  it("returns user list for ADMIN", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("returns 401 without cookie", async () => {
    expect((await s.agent.get("/api/admin/users")).status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await s.agent.get("/api/admin/users").set("Cookie", "token=invalid.jwt.token");
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-ADMIN", async () => {
    const cookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    expect(res.status).toBe(403);
  });
});

describe("GET /api/admin/users/:id", () => {
  it("returns a single user", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const listRes = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    const id = (listRes.body as Array<{ id: string }>)[0]!.id;
    const res = await s.agent.get(`/api/admin/users/${id}`).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
  });

  it("returns 404 for unknown id", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.get("/api/admin/users/nonexistent").set("Cookie", cookie)).status).toBe(404);
  });
});

describe("POST /api/admin/users", () => {
  it("creates a user", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/users").set("Cookie", cookie).send({ username: "newuser", password: "pass", role: "AvVolunteer" });
    expect(res.status).toBe(201);
    expect(res.body.username).toBe("newuser");
  });

  it("returns 409 on duplicate username", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await s.agent.post("/api/admin/users").set("Cookie", cookie).send({ username: "dup", password: "p", role: "AvVolunteer" });
    const res = await s.agent.post("/api/admin/users").set("Cookie", cookie).send({ username: "dup", password: "p", role: "AvVolunteer" });
    expect(res.status).toBe(409);
  });
});

describe("PUT /api/admin/users/:id", () => {
  it("updates a user", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const createRes = await s.agent.post("/api/admin/users").set("Cookie", cookie).send({ username: "bob", password: "p", role: "AvVolunteer" });
    const res = await s.agent
      .put(`/api/admin/users/${createRes.body.id as string}`)
      .set("Cookie", cookie)
      .send({ username: "bobby" });
    expect(res.status).toBe(200);
    expect(res.body.username).toBe("bobby");
  });

  it("returns 404 for unknown user", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.put("/api/admin/users/nonexistent").set("Cookie", cookie).send({ username: "x" })).status).toBe(404);
  });

  it("returns 403 when admin tries to change own role", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const listRes = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    const adminId = (listRes.body as Array<{ id: string; username: string }>).find((u) => u.username === "admin")!.id;
    const res = await s.agent.put(`/api/admin/users/${adminId}`).set("Cookie", cookie).send({ role: "AvVolunteer" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Cannot change your own role");
  });
});

describe("DELETE /api/admin/users/:id", () => {
  it("deletes a user", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const createRes = await s.agent.post("/api/admin/users").set("Cookie", cookie).send({ username: "todelete", password: "p", role: "AvVolunteer" });
    expect((await s.agent.delete(`/api/admin/users/${createRes.body.id as string}`).set("Cookie", cookie)).status).toBe(204);
  });

  it("returns 403 when trying to self-delete", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const listRes = await s.agent.get("/api/admin/users").set("Cookie", cookie);
    const adminId = (listRes.body as Array<{ id: string; username: string }>).find((u) => u.username === "admin")!.id;
    expect((await s.agent.delete(`/api/admin/users/${adminId}`).set("Cookie", cookie)).status).toBe(403);
  });
});
