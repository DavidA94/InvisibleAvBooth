import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;

beforeAll(async () => { s = await buildTestServer(); });
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

async function seedTemplates(cookie: string) {
  await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({ name: "Admin Title", category: "title", formatString: "{Date} - {Speaker} - {Title}", roleMinimum: "ADMIN" });
  await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({ name: "Power Title", category: "title", formatString: "{Date} - {Title}", roleMinimum: "AvPowerUser" });
  await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({ name: "Vol Title", category: "title", formatString: "{Date}", roleMinimum: "AvVolunteer" });
  await s.agent.post("/api/admin/templates").set("Cookie", cookie).send({ name: "Vol Desc", category: "description", formatString: "{Speaker}", roleMinimum: "AvVolunteer" });
}

describe("GET /api/templates (role filtering)", () => {
  it("ADMIN sees all templates", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await seedTemplates(cookie);
    const res = await s.agent.get("/api/templates").set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });

  it("AvPowerUser sees AvPowerUser and AvVolunteer templates", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await seedTemplates(adminCookie);
    const powerCookie = await loginAs(s.agent, s.ctx.authService, "power", "pass", "AvPowerUser");
    const res = await s.agent.get("/api/templates").set("Cookie", powerCookie);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("Power Title");
    expect(names).toContain("Vol Title");
    expect(names).toContain("Vol Desc");
    expect(names).not.toContain("Admin Title");
  });

  it("AvVolunteer sees only AvVolunteer templates", async () => {
    const adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    await seedTemplates(adminCookie);
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol", "pass", "AvVolunteer");
    const res = await s.agent.get("/api/templates").set("Cookie", volCookie);
    expect(res.status).toBe(200);
    const names = (res.body as Array<{ name: string }>).map((t) => t.name);
    expect(names).toContain("Vol Title");
    expect(names).toContain("Vol Desc");
    expect(names).not.toContain("Power Title");
    expect(names).not.toContain("Admin Title");
  });

  it("returns 401 without cookie", async () => {
    expect((await s.agent.get("/api/templates")).status).toBe(401);
  });
});
