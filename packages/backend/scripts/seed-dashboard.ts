// scripts/seed-dashboard.ts
// Run with: npx tsx scripts/seed-dashboard.ts
// Inserts the default dashboard and OBS widget configuration. Idempotent.

import { getDb, resetDb } from "../src/db/database.js";

const DASHBOARD_ID = "default";
const WIDGET_ID = "obs";

function seed(): void {
  const db = getDb();

  const existing = db.prepare("SELECT id FROM dashboards WHERE id = ?").get(DASHBOARD_ID);
  if (!existing) {
    db.prepare(
      "INSERT INTO dashboards (id, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?)",
    ).run(
      DASHBOARD_ID,
      "Main Dashboard",
      "Standard volunteer control surface",
      JSON.stringify(["AvVolunteer", "AvPowerUser", "ADMIN"]),
      new Date().toISOString(),
    );
    console.log("Created dashboard: Main Dashboard");
  } else {
    console.log("Dashboard already exists — skipping");
  }

  const existingWidget = db
    .prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?")
    .get(DASHBOARD_ID, WIDGET_ID);

  if (!existingWidget) {
    db.prepare(
      `INSERT INTO widget_configurations
       (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      `${DASHBOARD_ID}-${WIDGET_ID}`,
      DASHBOARD_ID,
      WIDGET_ID,
      "OBS",
      0, 0, 2, 2,
      "AvVolunteer",
      new Date().toISOString(),
    );
    console.log("Created widget: OBS");
  } else {
    console.log("OBS widget already exists — skipping");
  }
}

seed();
resetDb();
