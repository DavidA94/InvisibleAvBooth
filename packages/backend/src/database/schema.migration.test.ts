import { describe, it, expect } from "vitest";
import { applySchema } from "./schema.js";
import Database from "better-sqlite3";

describe("metadata_templates migration", () => {
  it("fresh install creates table with lowerThirdType and autoDismissMs columns", () => {
    const db = new Database(":memory:");
    applySchema(db);

    const cols = (db.pragma("table_info(metadata_templates)") as Array<{ name: string }>).map((r) => r.name);

    expect(cols).toContain("lowerThirdType");
    expect(cols).toContain("autoDismissMs");
    db.close();
  });

  it("category CHECK constraint accepts lower_third", () => {
    const db = new Database(":memory:");
    applySchema(db);

    expect(() => {
      db.prepare(
        "INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, lowerThirdType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("lt1", "Speaker", "lower_third", '{"title":"{Speaker}"}', "AvVolunteer", "Title", new Date().toISOString());
    }).not.toThrow();
    db.close();
  });

  it("lowerThirdType CHECK constraint rejects invalid values", () => {
    const db = new Database(":memory:");
    applySchema(db);

    expect(() => {
      db.prepare(
        "INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, lowerThirdType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("lt1", "Bad", "lower_third", '{"title":"x"}', "AvVolunteer", "Invalid", new Date().toISOString());
    }).toThrow();
    db.close();
  });

  it("lowerThirdType and autoDismissMs are nullable (existing title/description templates unaffected)", () => {
    const db = new Database(":memory:");
    applySchema(db);

    expect(() => {
      db.prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
        "t1",
        "Standard",
        "title",
        "{Date} – {Speaker}",
        "AvVolunteer",
        new Date().toISOString(),
      );
    }).not.toThrow();

    const row = db.prepare("SELECT lowerThirdType, autoDismissMs FROM metadata_templates WHERE id = ?").get("t1") as {
      lowerThirdType: string | null;
      autoDismissMs: number | null;
    };
    expect(row.lowerThirdType).toBeNull();
    expect(row.autoDismissMs).toBeNull();
    db.close();
  });

  it("migrates existing table preserving data", () => {
    const db = new Database(":memory:");

    // Create old schema (without lowerThirdType/autoDismissMs)
    db.exec(`
      CREATE TABLE metadata_templates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('title', 'description')),
        formatString TEXT NOT NULL,
        roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
        createdAt TEXT NOT NULL
      );
    `);

    // Insert data in old schema
    db.prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
      "existing1",
      "Speaker and Title",
      "title",
      "{Date} – {Speaker} – {Title}",
      "AvVolunteer",
      "2025-01-01T00:00:00.000Z",
    );

    // Run applySchema which should detect and migrate
    applySchema(db);

    // Verify data survived
    const row = db.prepare("SELECT * FROM metadata_templates WHERE id = ?").get("existing1") as {
      id: string;
      name: string;
      category: string;
      formatString: string;
      roleMinimum: string;
      lowerThirdType: string | null;
      autoDismissMs: number | null;
    };
    expect(row.name).toBe("Speaker and Title");
    expect(row.category).toBe("title");
    expect(row.formatString).toBe("{Date} – {Speaker} – {Title}");
    expect(row.lowerThirdType).toBeNull();
    expect(row.autoDismissMs).toBeNull();

    // Verify new category works after migration
    expect(() => {
      db.prepare(
        "INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, lowerThirdType, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run("lt1", "Speaker LT", "lower_third", '{"title":"{Speaker}"}', "AvVolunteer", "Title", new Date().toISOString());
    }).not.toThrow();

    db.close();
  });

  it("migration is idempotent — running applySchema twice after migration does not throw", () => {
    const db = new Database(":memory:");

    // Create old schema
    db.exec(`
      CREATE TABLE metadata_templates (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('title', 'description')),
        formatString TEXT NOT NULL,
        roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
        createdAt TEXT NOT NULL
      );
    `);

    // First call migrates
    applySchema(db);
    // Second call should be a no-op
    expect(() => applySchema(db)).not.toThrow();

    db.close();
  });
});
