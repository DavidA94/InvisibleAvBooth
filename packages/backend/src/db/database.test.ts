import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDb, resetDb, seedKjv } from "./database.js";
import { applySchema } from "./schema.js";
import Database from "better-sqlite3";

beforeEach(() => {
  resetDb();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("applySchema", () => {
  it("creates all four application tables", () => {
    const db = new Database(":memory:");
    applySchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: unknown) => (r as { name: string }).name);

    expect(tables).toContain("users");
    expect(tables).toContain("device_connections");
    expect(tables).toContain("dashboards");
    expect(tables).toContain("widget_configurations");
    db.close();
  });

  it("is idempotent — running twice does not throw", () => {
    const db = new Database(":memory:");
    expect(() => {
      applySchema(db);
      applySchema(db);
    }).not.toThrow();
    db.close();
  });

  it("users table has expected columns", () => {
    const db = new Database(":memory:");
    applySchema(db);

    const cols = db
      .prepare("PRAGMA table_info(users)")
      .all()
      .map((r: unknown) => (r as { name: string }).name);

    expect(cols).toEqual(
      expect.arrayContaining(["id", "username", "passwordHash", "role", "requiresPasswordChange", "createdAt"]),
    );
    db.close();
  });

  it("widget_configurations has a foreign key to dashboards", () => {
    const db = new Database(":memory:");
    db.pragma("foreign_keys = ON");
    applySchema(db);

    expect(() => {
      db.prepare(
        `INSERT INTO widget_configurations
         (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
         VALUES ('w1', 'nonexistent', 'obs', 'OBS', 0, 0, 2, 2, 'AvVolunteer', '2024-01-01')`,
      ).run();
    }).toThrow();
    db.close();
  });
});

describe("getDb", () => {
  it("returns a database with all schema tables applied", () => {
    const db = getDb(":memory:");

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map((r: unknown) => (r as { name: string }).name);

    expect(tables).toContain("users");
    expect(tables).toContain("device_connections");
    expect(tables).toContain("dashboards");
    expect(tables).toContain("widget_configurations");
  });

  it("returns the same instance on repeated calls (singleton)", () => {
    const a = getDb(":memory:");
    const b = getDb(":memory:");
    expect(a).toBe(b);
  });

  it("creates the kjv table", () => {
    const db = getDb(":memory:");

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'")
      .all();

    expect(tables).toHaveLength(1);
  });

  it("does not duplicate kjv table on second getDb call after reset", () => {
    getDb(":memory:");
    resetDb();
    const db = getDb(":memory:");

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'")
      .all();

    expect(tables).toHaveLength(1);
  });
});

describe("resetDb", () => {
  it("allows a fresh DB to be created after reset", () => {
    const a = getDb(":memory:");
    resetDb();
    const b = getDb(":memory:");
    expect(a).not.toBe(b);
  });
});

describe("seedKjv — idempotency", () => {
  it("does not throw when called twice on the same DB (tableExists early return)", () => {
    const db = new Database(":memory:");
    // First call: creates kjv table (empty, since path is nonexistent)
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    seedKjv(db, "/nonexistent/bibledb_kjv.sql");
    // Second call: kjv table already exists — hits the early return branch
    expect(() => seedKjv(db, "/nonexistent/bibledb_kjv.sql")).not.toThrow();
    expect(warnSpy).toHaveBeenCalledTimes(1); // only warned once, not twice
    warnSpy.mockRestore();
    db.close();
  });
});

describe("seedKjv — missing SQL file", () => {
  it("warns and leaves kjv table empty when sql path does not exist", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const db = getDb(":memory:", "/nonexistent/bibledb_kjv.sql");

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("bibledb_kjv.sql not found"));

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'")
      .all();
    expect(tables).toHaveLength(1);

    const rows = db.prepare("SELECT COUNT(*) as cnt FROM kjv").get() as { cnt: number };
    expect(rows.cnt).toBe(0);
  });
});
