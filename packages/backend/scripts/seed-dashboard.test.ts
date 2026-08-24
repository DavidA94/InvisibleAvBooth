import { describe, it, expect, vi, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../src/database/schema.js";
import { GRID_TYPES, GRID_DIMENSIONS, WIDGET_TYPE_REGISTRY } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";

// Mock getDatabase and resetDatabase to use our test database
let testDatabase: InstanceType<typeof Database>;

vi.mock("../src/database/database.js", () => ({
  getDatabase: () => testDatabase,
  resetDatabase: () => {},
}));

function makeDatabase(): InstanceType<typeof Database> {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  return database;
}

async function seed(): Promise<void> {
  // Dynamically import to pick up the mock
  const module = await import("./seed-dashboard.js");
  // The seed function is called on import (module-level execution), but we also export it
  if (module.seed) module.seed();
}

interface DashboardRow {
  id: string;
  slug: string;
  name: string;
  allowedRoles: string;
}

interface WidgetRow {
  widgetId: string;
  gridType: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
}

beforeEach(() => {
  testDatabase = makeDatabase();
  vi.resetModules();
});

describe("seed-dashboard", () => {
  it("creates dashboard with slug 'default'", async () => {
    await seed();
    const row = testDatabase.prepare("SELECT * FROM dashboards WHERE id = ?").get("default") as DashboardRow | undefined;
    expect(row).toBeDefined();
    expect(row!.slug).toBe("default");
    expect(row!.name).toBe("Main Dashboard");
  });

  it("populates all four grid types with widget configurations", async () => {
    await seed();
    for (const gridType of GRID_TYPES) {
      const widgets = testDatabase
        .prepare("SELECT * FROM widget_configurations WHERE dashboardId = ? AND gridType = ?")
        .all("default", gridType) as WidgetRow[];
      expect(widgets.length).toBeGreaterThan(0);
    }
  });

  it("each grid type contains all four widgets (obs, lower-thirds, obs-preview, camera)", async () => {
    await seed();
    const expectedWidgets = ["obs", "lower-thirds", "obs-preview", "camera"];
    for (const gridType of GRID_TYPES) {
      const widgets = testDatabase
        .prepare("SELECT widgetId FROM widget_configurations WHERE dashboardId = ? AND gridType = ?")
        .all("default", gridType) as Array<{ widgetId: string }>;
      const widgetIds = widgets.map((w) => w.widgetId).sort();
      expect(widgetIds).toEqual(expectedWidgets.sort());
    }
  });

  it("all placements are within grid column bounds for their grid type", async () => {
    await seed();
    const widgets = testDatabase.prepare("SELECT widgetId, gridType, col, colSpan FROM widget_configurations WHERE dashboardId = ?").all("default") as Array<{
      widgetId: string;
      gridType: string;
      col: number;
      colSpan: number;
    }>;

    for (const widget of widgets) {
      const gridDimensions = GRID_DIMENSIONS[widget.gridType as GridType];
      expect(widget.col + widget.colSpan).toBeLessThanOrEqual(gridDimensions.columns);
    }
  });

  it("all placements meet minimum size constraints from the registry", async () => {
    await seed();
    const widgets = testDatabase.prepare("SELECT widgetId, colSpan, rowSpan FROM widget_configurations WHERE dashboardId = ?").all("default") as Array<{
      widgetId: string;
      colSpan: number;
      rowSpan: number;
    }>;

    for (const widget of widgets) {
      const definition = WIDGET_TYPE_REGISTRY[widget.widgetId];
      expect(definition).toBeDefined();
      expect(widget.colSpan).toBeGreaterThanOrEqual(definition!.minColSpan);
      expect(widget.rowSpan).toBeGreaterThanOrEqual(definition!.minRowSpan);
    }
  });

  it("all placements respect maximum size constraints from the registry", async () => {
    await seed();
    const widgets = testDatabase.prepare("SELECT widgetId, colSpan, rowSpan FROM widget_configurations WHERE dashboardId = ?").all("default") as Array<{
      widgetId: string;
      colSpan: number;
      rowSpan: number;
    }>;

    for (const widget of widgets) {
      const definition = WIDGET_TYPE_REGISTRY[widget.widgetId];
      if (definition?.maxColSpan !== null && definition?.maxColSpan !== undefined) {
        expect(widget.colSpan).toBeLessThanOrEqual(definition.maxColSpan);
      }
      if (definition?.maxRowSpan !== null && definition?.maxRowSpan !== undefined) {
        expect(widget.rowSpan).toBeLessThanOrEqual(definition.maxRowSpan);
      }
    }
  });

  it("is idempotent — second run produces no duplicates", async () => {
    await seed();
    const countBefore = (testDatabase.prepare("SELECT COUNT(*) as count FROM widget_configurations WHERE dashboardId = ?").get("default") as { count: number })
      .count;

    // Reset modules and re-run
    vi.resetModules();
    await seed();

    const countAfter = (testDatabase.prepare("SELECT COUNT(*) as count FROM widget_configurations WHERE dashboardId = ?").get("default") as { count: number })
      .count;
    expect(countAfter).toBe(countBefore);
  });

  it("same widget set across all four grids", async () => {
    await seed();
    const gridWidgets: Record<string, string[]> = {};
    for (const gridType of GRID_TYPES) {
      const widgets = testDatabase
        .prepare("SELECT widgetId FROM widget_configurations WHERE dashboardId = ? AND gridType = ? ORDER BY widgetId")
        .all("default", gridType) as Array<{ widgetId: string }>;
      gridWidgets[gridType] = widgets.map((w) => w.widgetId);
    }

    // All grids should have the same set
    const reference = gridWidgets["large-landscape"]!;
    for (const gridType of GRID_TYPES) {
      expect(gridWidgets[gridType]).toEqual(reference);
    }
  });
});
