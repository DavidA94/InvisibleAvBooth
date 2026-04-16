import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDatabase, resetDatabase, seedKjv } from "./database.js";
import { applySchema } from "./schema.js";
import Database from "better-sqlite3";
import { logger } from "../logger.js";

beforeEach(() => {
  resetDatabase();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applySchema", () => {
  it("creates all four application tables", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: unknown) => (r as { name: string }).name);

    expect(tables).toContain("users");
    expect(tables).toContain("device_connections");
    expect(tables).toContain("dashboards");
    expect(tables).toContain("widget_configurations");
    database.close();
  });

  it("is idempotent — running twice does not throw", () => {
    const database = new Database(":memory:");
    expect(() => {
      applySchema(database);
      applySchema(database);
    }).not.toThrow();
    database.close();
  });

  it("users table has expected columns", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const cols = database
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((r: unknown) => (r as { name: string }).name);

    expect(cols).toEqual(expect.arrayContaining(["id", "username", "passwordHash", "role", "requiresPasswordChange", "createdAt"]));
    database.close();
  });

  it("widget_configurations has a foreign key to dashboards", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    expect(() => {
      database
        .prepare(
          `INSERT INTO widget_configurations
         (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
         VALUES ('w1', 'nonexistent', 'obs', 'OBS', 0, 0, 2, 2, 'AvVolunteer', '2024-01-01')`,
        )
        .run();
    }).toThrow();
    database.close();
  });
});

describe("getDatabase", () => {
  it("returns a database with all schema tables applied", () => {
    const database = getDatabase(":memory:");

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: unknown) => (r as { name: string }).name);

    expect(tables).toContain("users");
    expect(tables).toContain("device_connections");
    expect(tables).toContain("dashboards");
    expect(tables).toContain("widget_configurations");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getDatabase(":memory:");
    const b = getDatabase(":memory:");
    expect(a).toBe(b);
  });

  it("creates the kjv table", () => {
    const database = getDatabase(":memory:");

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'").all();

    expect(tables).toHaveLength(1);
  });

  it("does not duplicate kjv table on second getDb call after reset", () => {
    getDatabase(":memory:");
    resetDatabase();
    const database = getDatabase(":memory:");

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'").all();

    expect(tables).toHaveLength(1);
  });
});

describe("resetDatabase", () => {
  it("allows a fresh DB to be created after reset", () => {
    const a = getDatabase(":memory:");
    resetDatabase();
    const b = getDatabase(":memory:");
    expect(a).not.toBe(b);
  });
});

describe("seedKjv — idempotency", () => {
  it("does not throw when called twice on the same DB (tableExists early return)", () => {
    const database = new Database(":memory:");
    // First call: creates kjv table (empty, since path is nonexistent)
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);
    seedKjv(database, "/nonexistent/bibledb_kjv.sql");
    // Second call: kjv table already exists — hits the early return branch
    expect(() => seedKjv(database, "/nonexistent/bibledb_kjv.sql")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1); // only warned once, not twice
    warnSpy.mockRestore();
    database.close();
  });
});

describe("seedKjv — missing SQL file", () => {
  it("warns and leaves kjv table empty when sql path does not exist", () => {
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => logger);

    const database = getDatabase(":memory:", "/nonexistent/bibledb_kjv.sql");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("bibledb_kjv.sql not found"));

    const tables = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'").all();
    expect(tables).toHaveLength(1);

    const rows = database.prepare("SELECT COUNT(*) as cnt FROM kjv").get() as { cnt: number };
    expect(rows.cnt).toBe(0);
  });
});
