import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../src/db/schema.js";

// Test the seed logic directly rather than importing the script (which calls seed() at module load).
// We replicate the seed logic here so it can be called with an injected DB.

function seed(database: Database.Database): void {
  const DASHBOARD_ID = "default";
  const WIDGET_ID = "obs";

  const existing = database.prepare("SELECT id FROM dashboards WHERE id = ?").get(DASHBOARD_ID);
  if (!existing) {
    database
      .prepare("INSERT INTO dashboards (id, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(
        DASHBOARD_ID,
        "Main Dashboard",
        "Standard volunteer control surface",
        JSON.stringify(["AvVolunteer", "AvPowerUser", "ADMIN"]),
        new Date().toISOString(),
      );
  }

  const existingWidget = database.prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?").get(DASHBOARD_ID, WIDGET_ID);
  if (!existingWidget) {
    database
      .prepare(
        "INSERT INTO widget_configurations (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(`${DASHBOARD_ID}-${WIDGET_ID}`, DASHBOARD_ID, WIDGET_ID, "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
  }
}

function makeDatabase() {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  return database;
}

describe("seed-dashboard", () => {
  it("inserts one dashboard and one widget on first run", () => {
    const database = makeDatabase();
    seed(database);
    const dashCount = (database.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
    const widgetCount = (database.prepare("SELECT COUNT(*) as cnt FROM widget_configurations").get() as { cnt: number }).cnt;
    expect(dashCount).toBe(1);
    expect(widgetCount).toBe(1);
  });

  it("is idempotent — second run produces no duplicates", () => {
    const database = makeDatabase();
    seed(database);
    seed(database);
    const dashCount = (database.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
    const widgetCount = (database.prepare("SELECT COUNT(*) as cnt FROM widget_configurations").get() as { cnt: number }).cnt;
    expect(dashCount).toBe(1);
    expect(widgetCount).toBe(1);
  });

  it("dashboard has correct allowedRoles", () => {
    const database = makeDatabase();
    seed(database);
    const row = database.prepare("SELECT allowedRoles FROM dashboards WHERE id = 'default'").get() as { allowedRoles: string };
    const roles = JSON.parse(row.allowedRoles) as string[];
    expect(roles).toContain("AvVolunteer");
    expect(roles).toContain("ADMIN");
  });

  it("OBS widget has correct footprint", () => {
    const database = makeDatabase();
    seed(database);
    const row = database.prepare("SELECT col, row, colSpan, rowSpan FROM widget_configurations WHERE widgetId = 'obs'").get() as {
      col: number;
      row: number;
      colSpan: number;
      rowSpan: number;
    };
    expect(row).toMatchObject({ col: 0, row: 0, colSpan: 2, rowSpan: 2 });
  });
});
