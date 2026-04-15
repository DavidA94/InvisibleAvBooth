import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../src/db/schema.js";

// Test the seed logic directly rather than importing the script (which calls seed() at module load).
// We replicate the seed logic here so it can be called with an injected DB.

function seed(db: Database.Database): void {
  const DASHBOARD_ID = "default";
  const WIDGET_ID = "obs";

  const existing = db.prepare("SELECT id FROM dashboards WHERE id = ?").get(DASHBOARD_ID);
  if (!existing) {
    db.prepare(
      "INSERT INTO dashboards (id, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?)",
    ).run(DASHBOARD_ID, "Main Dashboard", "Standard volunteer control surface", JSON.stringify(["AvVolunteer", "AvPowerUser", "ADMIN"]), new Date().toISOString());
  }

  const existingWidget = db.prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?").get(DASHBOARD_ID, WIDGET_ID);
  if (!existingWidget) {
    db.prepare(
      "INSERT INTO widget_configurations (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(`${DASHBOARD_ID}-${WIDGET_ID}`, DASHBOARD_ID, WIDGET_ID, "OBS", 0, 0, 2, 2, "AvVolunteer", new Date().toISOString());
  }
}

function makeDb() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

describe("seed-dashboard", () => {
  it("inserts one dashboard and one widget on first run", () => {
    const db = makeDb();
    seed(db);
    const dashCount = (db.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
    const widgetCount = (db.prepare("SELECT COUNT(*) as cnt FROM widget_configurations").get() as { cnt: number }).cnt;
    expect(dashCount).toBe(1);
    expect(widgetCount).toBe(1);
  });

  it("is idempotent — second run produces no duplicates", () => {
    const db = makeDb();
    seed(db);
    seed(db);
    const dashCount = (db.prepare("SELECT COUNT(*) as cnt FROM dashboards").get() as { cnt: number }).cnt;
    const widgetCount = (db.prepare("SELECT COUNT(*) as cnt FROM widget_configurations").get() as { cnt: number }).cnt;
    expect(dashCount).toBe(1);
    expect(widgetCount).toBe(1);
  });

  it("dashboard has correct allowedRoles", () => {
    const db = makeDb();
    seed(db);
    const row = db.prepare("SELECT allowedRoles FROM dashboards WHERE id = 'default'").get() as { allowedRoles: string };
    const roles = JSON.parse(row.allowedRoles) as string[];
    expect(roles).toContain("AvVolunteer");
    expect(roles).toContain("ADMIN");
  });

  it("OBS widget has correct footprint", () => {
    const db = makeDb();
    seed(db);
    const row = db.prepare("SELECT col, row, colSpan, rowSpan FROM widget_configurations WHERE widgetId = 'obs'").get() as { col: number; row: number; colSpan: number; rowSpan: number };
    expect(row).toMatchObject({ col: 0, row: 0, colSpan: 2, rowSpan: 2 });
  });
});
