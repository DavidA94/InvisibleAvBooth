// scripts/seed-dashboard.ts
// Run with: npx tsx scripts/seed-dashboard.ts
// Inserts the default dashboard with widget configurations for all four grid types. Idempotent.

import { getDatabase, resetDatabase } from "../src/database/database.js";
import type { GridType } from "@invisible-av-booth/shared";

const DASHBOARD_ID = "default";
const DASHBOARD_SLUG = "default";
const DASHBOARD_NAME = "Main Dashboard";

/**
 * Widget placements per grid type — validated to fit within bounds and constraints.
 *
 * Constraint reference (from widgetTypeRegistry):
 * - obs: min 2×2, max 5×4
 * - lower-thirds: min 2×2, no max
 * - obs-preview: min 2×2, no max
 * - camera: min 3×2, no max
 *
 * Grid column counts:
 * - large-landscape: 11 cols, 7 default rows
 * - large-portrait: 7 cols, 11 default rows
 * - small-landscape: 7 cols, 3 default rows
 * - small-portrait: 3 cols, 7 default rows
 */
const PLACEMENTS: Record<GridType, Array<{ widgetId: string; title: string; col: number; row: number; colSpan: number; rowSpan: number }>> = {
  "large-landscape": [
    // 11 columns — uses 7 rows (fits within default)
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 3, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 6, row: 0, colSpan: 3, rowSpan: 3 },
    { widgetId: "camera", title: "Camera", col: 0, row: 2, colSpan: 6, rowSpan: 5 },
  ],
  "large-portrait": [
    // 7 columns — uses 7 rows (fits within default 11)
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 3, row: 0, colSpan: 4, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 0, row: 2, colSpan: 3, rowSpan: 3 },
    { widgetId: "camera", title: "Camera", col: 3, row: 2, colSpan: 4, rowSpan: 5 },
  ],
  "small-landscape": [
    // 7 columns — uses 4 rows (exceeds default 3 — scrolls on phone viewports)
    { widgetId: "camera", title: "Camera", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "obs", title: "OBS", col: 3, row: 0, colSpan: 2, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 5, row: 0, colSpan: 2, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 2, colSpan: 7, rowSpan: 2 },
  ],
  "small-portrait": [
    // 3 columns — uses 8 rows (exceeds default 7 — scrolls on phone viewports)
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 0, row: 2, colSpan: 3, rowSpan: 2 },
    { widgetId: "camera", title: "Camera", col: 0, row: 4, colSpan: 3, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 6, colSpan: 3, rowSpan: 2 },
  ],
};

export function seed(): void {
  const database = getDatabase();

  const existing = database.prepare("SELECT id FROM dashboards WHERE id = ?").get(DASHBOARD_ID) as { id: string } | undefined;
  if (!existing) {
    database
      .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(
        DASHBOARD_ID,
        DASHBOARD_SLUG,
        DASHBOARD_NAME,
        "Standard volunteer control surface",
        JSON.stringify(["AvVolunteer", "AvPowerUser", "ADMIN"]),
        new Date().toISOString(),
      );
    console.log("Created dashboard: Main Dashboard");
  } else {
    console.log("Dashboard already exists — skipping");
  }

  // Check if widgets already exist for this dashboard
  const existingWidgets = database.prepare("SELECT COUNT(*) as count FROM widget_configurations WHERE dashboardId = ?").get(DASHBOARD_ID) as { count: number };

  if (existingWidgets.count > 0) {
    console.log("Widget configurations already exist — skipping");
    return;
  }

  const insert = database.prepare(
    `INSERT INTO widget_configurations
     (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const createdAt = new Date().toISOString();

  for (const [gridType, widgets] of Object.entries(PLACEMENTS)) {
    for (const widget of widgets) {
      const widgetConfigId = `${DASHBOARD_ID}-${gridType}-${widget.widgetId}`;
      insert.run(
        widgetConfigId,
        DASHBOARD_ID,
        widget.widgetId,
        gridType,
        widget.title,
        widget.col,
        widget.row,
        widget.colSpan,
        widget.rowSpan,
        "AvVolunteer",
        createdAt,
      );
    }
  }

  console.log("Created widget configurations for all four grid types (16 entries)");
}

seed();
resetDatabase();
