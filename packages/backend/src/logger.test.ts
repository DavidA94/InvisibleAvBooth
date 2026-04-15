import { describe, it, expect } from "vitest";
import { logger } from "./logger.js";

// Logger is a singleton initialised once at module load time.
// We test its observable properties — methods, transport count, level, and
// defaultMeta — without re-importing or touching the file system.

describe("logger", () => {
  it("exports debug, info, warn, and error methods", () => {
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("has two transports configured (file + console)", () => {
    expect(logger.transports).toHaveLength(2);
  });

  it("includes source: backend in defaultMeta", () => {
    expect((logger as unknown as { defaultMeta: Record<string, unknown> }).defaultMeta).toMatchObject({
      source: "backend",
    });
  });

  it("level is a recognised log level", () => {
    expect(["debug", "info", "warn", "error"]).toContain(logger.level);
  });

  it("defaults to info level when LOG_LEVEL env var is not set to debug or warn", () => {
    // In the test environment LOG_LEVEL is not set, so the logger should be at info.
    // If someone runs tests with LOG_LEVEL=debug this assertion is intentionally skipped.
    if (!process.env["LOG_LEVEL"]) {
      expect(logger.level).toBe("info");
    }
  });

  it("does not throw when logging with extra context fields", () => {
    expect(() => logger.info("test message", { userId: "u1", context: { action: "test" } })).not.toThrow();
  });

  it("does not throw when logging without extra context fields", () => {
    expect(() => logger.info("plain message")).not.toThrow();
  });
});
