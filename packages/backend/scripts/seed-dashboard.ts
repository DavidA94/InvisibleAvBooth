// scripts/seed-dashboard.ts
// Run with: npx tsx scripts/seed-dashboard.ts
// Inserts the default dashboard and OBS widget configuration. Idempotent.

import { getDatabase, resetDatabase } from "../src/database/database.js";

const DASHBOARD_ID = "default";
const WIDGET_ID = "obs";
const LT_WIDGET_ID = "lower-thirds";
const OBS_PREVIEW_WIDGET_ID = "obs-preview";
const CAMERA_WIDGET_ID = "camera";

function seed(): void {
  const database = getDatabase();

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
    console.log("Created dashboard: Main Dashboard");
  } else {
    console.log("Dashboard already exists — skipping");
  }

  const existingWidget = database.prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?").get(DASHBOARD_ID, WIDGET_ID);

  if (!existingWidget) {
    database
      .prepare(
        `INSERT INTO widget_configurations
       (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(`${DASHBOARD_ID}-${WIDGET_ID}`, DASHBOARD_ID, WIDGET_ID, "OBS", 0, 0, 3, 2, "AvVolunteer", new Date().toISOString());
    console.log("Created widget: OBS");
  } else {
    console.log("OBS widget already exists — skipping");
  }

  const existingLtWidget = database.prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?").get(DASHBOARD_ID, LT_WIDGET_ID);

  if (!existingLtWidget) {
    database
      .prepare(
        `INSERT INTO widget_configurations
       (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(`${DASHBOARD_ID}-${LT_WIDGET_ID}`, DASHBOARD_ID, LT_WIDGET_ID, "Lower Thirds", 3, 0, 3, 2, "AvVolunteer", new Date().toISOString());
    console.log("Created widget: Lower Thirds");
  } else {
    console.log("Lower Thirds widget already exists — skipping");
  }

  const existingObsPreview = database
    .prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?")
    .get(DASHBOARD_ID, OBS_PREVIEW_WIDGET_ID);

  if (!existingObsPreview) {
    database
      .prepare(
        `INSERT INTO widget_configurations
       (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(`${DASHBOARD_ID}-${OBS_PREVIEW_WIDGET_ID}`, DASHBOARD_ID, OBS_PREVIEW_WIDGET_ID, "OBS Preview", 6, 0, 2, 2, "AvVolunteer", new Date().toISOString());
    console.log("Created widget: OBS Preview");
  } else {
    console.log("OBS Preview widget already exists — skipping");
  }

  const existingCameraWidget = database
    .prepare("SELECT id FROM widget_configurations WHERE dashboardId = ? AND widgetId = ?")
    .get(DASHBOARD_ID, CAMERA_WIDGET_ID);

  if (!existingCameraWidget) {
    database
      .prepare(
        `INSERT INTO widget_configurations
       (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(`${DASHBOARD_ID}-${CAMERA_WIDGET_ID}`, DASHBOARD_ID, CAMERA_WIDGET_ID, "Camera", 0, 2, 6, 4, "AvVolunteer", new Date().toISOString());
    console.log("Created widget: Camera");
  } else {
    console.log("Camera widget already exists — skipping");
  }
}

seed();
resetDatabase();
