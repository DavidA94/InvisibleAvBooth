import { describe, it, expect } from "vitest";
import { applySchema } from "./schema.js";
import Database from "better-sqlite3";

describe("dashboard schema migration", () => {
  it("fresh install creates dashboards table with slug column", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const cols = (database.pragma("table_info(dashboards)") as Array<{ name: string }>).map((r) => r.name);
    expect(cols).toContain("slug");
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("description");
    expect(cols).toContain("allowedRoles");
    expect(cols).toContain("createdAt");
    database.close();
  });

  it("fresh install creates widget_configurations table with gridType column", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const cols = (database.pragma("table_info(widget_configurations)") as Array<{ name: string }>).map((r) => r.name);
    expect(cols).toContain("gridType");
    expect(cols).toContain("dashboardId");
    expect(cols).toContain("widgetId");
    expect(cols).toContain("col");
    expect(cols).toContain("row");
    expect(cols).toContain("colSpan");
    expect(cols).toContain("rowSpan");
    expect(cols).toContain("roleMinimum");
    database.close();
  });

  it("gridType CHECK constraint rejects invalid values", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = OFF"); // skip FK for isolated test
    applySchema(database);

    expect(() => {
      database
        .prepare(
          "INSERT INTO widget_configurations (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("w1", "d1", "obs", "invalid-type", "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
    }).toThrow();
    database.close();
  });

  it("gridType CHECK constraint accepts all four valid grid types", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = OFF");
    applySchema(database);

    const validTypes = ["large-landscape", "large-portrait", "small-landscape", "small-portrait"];
    for (const gridType of validTypes) {
      expect(() => {
        database
          .prepare(
            "INSERT INTO widget_configurations (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(`w-${gridType}`, "d1", "obs", gridType, "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
      }).not.toThrow();
    }
    database.close();
  });

  it("UNIQUE(dashboardId, widgetId, gridType) allows same widget on different grid types", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = OFF");
    applySchema(database);

    const insert = database.prepare(
      "INSERT INTO widget_configurations (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );

    expect(() => {
      insert.run("w1", "d1", "obs", "large-landscape", "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
      insert.run("w2", "d1", "obs", "large-portrait", "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
    }).not.toThrow();
    database.close();
  });

  it("UNIQUE(dashboardId, widgetId, gridType) rejects duplicate widget on same grid type", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = OFF");
    applySchema(database);

    const insert = database.prepare(
      "INSERT INTO widget_configurations (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    );

    insert.run("w1", "d1", "obs", "large-landscape", "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
    expect(() => {
      insert.run("w2", "d1", "obs", "large-landscape", "OBS", 1, 0, 2, 2, "AvVolunteer", new Date().toISOString());
    }).toThrow();
    database.close();
  });

  it("slug UNIQUE constraint rejects duplicate slugs", () => {
    const database = new Database(":memory:");
    applySchema(database);

    database
      .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("d1", "main", "Main Dashboard", "", "[]", new Date().toISOString());

    expect(() => {
      database
        .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run("d2", "main", "Another Dashboard", "", "[]", new Date().toISOString());
    }).toThrow();
    database.close();
  });

  it("case-insensitive name uniqueness via index", () => {
    const database = new Database(":memory:");
    applySchema(database);

    database
      .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("d1", "main", "Main Dashboard", "", "[]", new Date().toISOString());

    expect(() => {
      database
        .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run("d2", "other", "main dashboard", "", "[]", new Date().toISOString());
    }).toThrow();
    database.close();
  });

  it("migrates old schema (no gridType, no slug) preserving dashboard data", () => {
    const database = new Database(":memory:");

    // Create old-style dashboards table (no slug)
    database.exec(`
      CREATE TABLE dashboards (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        allowedRoles TEXT NOT NULL DEFAULT '[]',
        createdAt TEXT NOT NULL
      );
      CREATE TABLE widget_configurations (
        id TEXT PRIMARY KEY NOT NULL,
        dashboardId TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
        widgetId TEXT NOT NULL,
        title TEXT NOT NULL,
        col INTEGER NOT NULL,
        row INTEGER NOT NULL,
        colSpan INTEGER NOT NULL,
        rowSpan INTEGER NOT NULL,
        roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
        createdAt TEXT NOT NULL,
        UNIQUE(dashboardId, widgetId)
      );
    `);

    // Insert data in old schema
    database
      .prepare("INSERT INTO dashboards (id, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run("d1", "Main Dashboard", "Primary", '["AvVolunteer"]', "2025-01-01T00:00:00.000Z");

    database
      .prepare(
        "INSERT INTO widget_configurations (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("w1", "d1", "obs", "OBS", 0, 0, 3, 2, "AvVolunteer", "2025-01-01T00:00:00.000Z");

    // Run applySchema which should detect and migrate
    applySchema(database);

    // Dashboard should have slug derived from name
    const dashboard = database.prepare("SELECT * FROM dashboards WHERE id = ?").get("d1") as { slug: string; name: string };
    expect(dashboard.name).toBe("Main Dashboard");
    expect(dashboard.slug).toBe("main-dashboard");

    // Old widget data is lost (destructive migration) — but that's expected
    const widgets = database.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ?").all("d1");
    expect(widgets).toHaveLength(0);

    // New schema columns exist
    const widgetCols = (database.pragma("table_info(widget_configurations)") as Array<{ name: string }>).map((r) => r.name);
    expect(widgetCols).toContain("gridType");

    database.close();
  });

  it("migration is idempotent — running applySchema twice does not throw", () => {
    const database = new Database(":memory:");
    applySchema(database);
    expect(() => applySchema(database)).not.toThrow();
    database.close();
  });

  it("ON DELETE CASCADE removes widget_configurations when dashboard is deleted", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    database
      .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("d1", "main", "Main", "", "[]", new Date().toISOString());

    database
      .prepare(
        "INSERT INTO widget_configurations (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run("w1", "d1", "obs", "large-landscape", "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());

    database.prepare("DELETE FROM dashboards WHERE id = ?").run("d1");

    const remaining = database.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ?").all("d1");
    expect(remaining).toHaveLength(0);
    database.close();
  });
});
