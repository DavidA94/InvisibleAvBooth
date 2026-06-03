import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, afterEach } from "vitest";
import { buildTestServer, resetServer, destroyServer } from "../harness.js";
import type { TestServer } from "../harness.js";
import { logger } from "../../../src/logger.js";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));
afterEach(() => vi.restoreAllMocks());

describe("POST /api/overlay/logs", () => {
  it("returns 204 on success", async () => {
    const res = await s.agent.post("/api/overlay/logs").send([{ level: "info", message: "test" }]);
    expect(res.status).toBe(204);
  });

  it("logs valid entries with correct levels and source: overlay", async () => {
    const infoSpy = vi.spyOn(logger, "info");
    const warnSpy = vi.spyOn(logger, "warn");
    const errorSpy = vi.spyOn(logger, "error");
    const debugSpy = vi.spyOn(logger, "debug");

    await s.agent.post("/api/overlay/logs").send([
      { level: "info", message: "info msg" },
      { level: "warn", message: "warn msg" },
      { level: "error", message: "error msg" },
      { level: "debug", message: "debug msg" },
    ]);

    expect(infoSpy).toHaveBeenCalledWith("info msg", expect.objectContaining({ source: "overlay" }));
    expect(warnSpy).toHaveBeenCalledWith("warn msg", expect.objectContaining({ source: "overlay" }));
    expect(errorSpy).toHaveBeenCalledWith("error msg", expect.objectContaining({ source: "overlay" }));
    expect(debugSpy).toHaveBeenCalledWith("debug msg", expect.objectContaining({ source: "overlay" }));
  });

  it("skips entries without a message", async () => {
    const infoSpy = vi.spyOn(logger, "info");

    await s.agent.post("/api/overlay/logs").send([{ level: "info" }, { level: "warn", message: "" }, { level: "info", message: "kept" }]);

    expect(infoSpy).toHaveBeenCalledTimes(1);
    expect(infoSpy).toHaveBeenCalledWith("kept", expect.objectContaining({ source: "overlay" }));
  });

  it("defaults to info level when level is invalid or missing", async () => {
    const infoSpy = vi.spyOn(logger, "info");

    await s.agent.post("/api/overlay/logs").send([{ message: "no level" }, { level: "critical", message: "bad level" }]);

    expect(infoSpy).toHaveBeenCalledWith("no level", expect.objectContaining({ source: "overlay" }));
    expect(infoSpy).toHaveBeenCalledWith("bad level", expect.objectContaining({ source: "overlay" }));
  });

  it("returns 400 when body is not an array", async () => {
    const res = await s.agent.post("/api/overlay/logs").send({ level: "info", message: "x" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when more than 10 entries are sent", async () => {
    const entries = Array.from({ length: 11 }, (_, i) => ({ level: "info", message: `msg ${i}` }));
    const res = await s.agent.post("/api/overlay/logs").send(entries);
    expect(res.status).toBe(400);
  });

  it("returns 413 when an entry exceeds 1KB", async () => {
    const oversized = { level: "info", message: "x".repeat(1100) };
    const res = await s.agent.post("/api/overlay/logs").send([oversized]);
    expect(res.status).toBe(413);
  });

  it("passes context field through to the logger", async () => {
    const infoSpy = vi.spyOn(logger, "info");

    await s.agent.post("/api/overlay/logs").send([{ level: "info", message: "with ctx", context: { phase: "animate-in" } }]);

    expect(infoSpy).toHaveBeenCalledWith("with ctx", expect.objectContaining({ source: "overlay", context: { phase: "animate-in" } }));
  });

  it("rate-limits after 10 requests per minute from same IP", async () => {
    // Mock Date.now to jump past the 60s rate-limit window, clearing any prior state
    const realNow = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(realNow + 120000);

    for (let i = 0; i < 10; i++) {
      const res = await s.agent.post("/api/overlay/logs").send([{ level: "info", message: `msg ${i}` }]);
      expect(res.status).toBe(204);
    }
    const limited = await s.agent.post("/api/overlay/logs").send([{ level: "info", message: "should be limited" }]);
    expect(limited.status).toBe(429);
  });
});
