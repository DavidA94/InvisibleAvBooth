import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from "vitest";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { logger } from "../../../src/logger.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));
afterEach(() => vi.restoreAllMocks());

describe("POST /api/logs", () => {
  it("writes entries to logger with source: frontend", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const infoSpy = vi.spyOn(logger, "info");
    const res = await s.agent
      .post("/api/logs")
      .set("Cookie", cookie)
      .send([{ level: "info", message: "page loaded", userId: "u1" }]);
    expect(res.status).toBe(204);
    expect(infoSpy).toHaveBeenCalledWith("page loaded", expect.objectContaining({ source: "frontend", userId: "u1" }));
  });

  it("handles multiple entries in one batch", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");
    await s.agent
      .post("/api/logs")
      .set("Cookie", cookie)
      .send([
        { level: "info", message: "first" },
        { level: "warn", message: "second" },
      ]);
    expect(infoSpy).toHaveBeenCalledWith("first", expect.objectContaining({ source: "frontend" }));
    expect(warnSpy).toHaveBeenCalledWith("second", expect.objectContaining({ source: "frontend" }));
  });

  it("returns 401 without auth", async () => {
    expect((await s.agent.post("/api/logs").send([{ level: "info", message: "x" }])).status).toBe(401);
  });

  it("returns 400 when body is not an array", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    expect((await s.agent.post("/api/logs").set("Cookie", cookie).send({ level: "info", message: "x" })).status).toBe(400);
  });

  it("includes context and timestamp when provided", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const infoSpy = vi.spyOn(logger, "info");
    await s.agent
      .post("/api/logs")
      .set("Cookie", cookie)
      .send([{ level: "info", message: "click", context: { page: "home" }, timestamp: "2026-01-01T00:00:00Z" }]);
    expect(infoSpy).toHaveBeenCalledWith("click", expect.objectContaining({ context: { page: "home" }, clientTimestamp: "2026-01-01T00:00:00Z" }));
  });
});
