import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeSnapPosition, computeSnapResize, wouldOverlap, rectanglesOverlap, findFirstAvailablePosition } from "./snapLogic";
import type { WidgetPlacement } from "./snapLogic";
import { GRID_DIMENSIONS, WIDGET_TYPE_REGISTRY } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";

// Constants matching the grid system (116px cells, 12px gaps at 16px root)
const CELL_SIZE = 116;
const GAP_SIZE = 12;
const CELL_WITH_GAP = CELL_SIZE + GAP_SIZE;

// ── computeSnapPosition ───────────────────────────────────────────────────────

describe("computeSnapPosition", () => {
  it("returns (0,0) when pointer is at origin with no drag offset", () => {
    expect(computeSnapPosition(0, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 0, row: 0 });
  });

  it("stays at cell 0 when pointer is within cell area", () => {
    // Pointer at 50px (well within cell 0 which is 0-116px)
    expect(computeSnapPosition(50, 50, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 0, row: 0 });
  });

  it("stays at cell 0 when pointer is past cell but below snap threshold", () => {
    // Threshold = cellSize + gapSize + cellSize*0.35 = 116 + 12 + 40.6 = 168.6px
    // At 160px: within the gap area, below threshold
    expect(computeSnapPosition(160, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 0, row: 0 });
  });

  it("snaps to cell 1 when pointer passes the 35% threshold", () => {
    // Threshold = 116 + 12 + 40.6 = 168.6px. At 170px, should snap to 1.
    expect(computeSnapPosition(170, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 1, row: 0 });
  });

  it("at exactly the threshold boundary, snaps forward", () => {
    // Threshold = 168.6px — at this point or above, snap forward
    const threshold = CELL_SIZE + GAP_SIZE + CELL_SIZE * 0.35;
    expect(computeSnapPosition(threshold, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 1, row: 0 });
  });

  it("below threshold by 0.1px, stays at current cell", () => {
    const threshold = CELL_SIZE + GAP_SIZE + CELL_SIZE * 0.35;
    expect(computeSnapPosition(threshold - 0.1, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 0, row: 0 });
  });

  it("handles multi-cell movement correctly", () => {
    // Position well into cell 2 territory (past threshold from cell 1):
    // Cell 1's far edge = 1*128 + 116 = 244. Threshold = 244 + 52.6 = 296.6px.
    // At 300px, pointer has passed the threshold → snaps to cell 2.
    expect(computeSnapPosition(300, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 2, row: 0 });
    // Just barely inside cell 2 (at 260px), still snaps to cell 1 (below threshold)
    expect(computeSnapPosition(260, 0, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 1, row: 0 });
  });

  it("applies drag offset correctly", () => {
    // Pointer at 200px with offset 128 (one cell) = effective 72px = cell 0
    expect(computeSnapPosition(200, 0, CELL_WITH_GAP, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 0, row: 0 });
  });

  it("never returns negative values", () => {
    expect(computeSnapPosition(-50, -50, 0, 0, CELL_SIZE, GAP_SIZE)).toEqual({ col: 0, row: 0 });
  });

  // Property-based: output is always non-negative integer
  it("always returns non-negative integer values (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -500, max: 2000 }),
        fc.integer({ min: -500, max: 2000 }),
        fc.integer({ min: 0, max: 200 }),
        fc.integer({ min: 0, max: 200 }),
        (px, py, ox, oy) => {
          const result = computeSnapPosition(px, py, ox, oy, CELL_SIZE, GAP_SIZE);
          return result.col >= 0 && result.row >= 0 && Number.isInteger(result.col) && Number.isInteger(result.row);
        },
      ),
    );
  });
});

// ── computeSnapResize ─────────────────────────────────────────────────────────

describe("computeSnapResize", () => {
  it("returns minimum span when pointer is near widget origin", () => {
    const result = computeSnapResize(10, 10, 0, 0, CELL_SIZE, GAP_SIZE, 2, 5, 2, 4, 11);
    expect(result.colSpan).toBe(2);
    expect(result.rowSpan).toBe(2);
  });

  it("respects maximum column span", () => {
    // Pointer far to the right
    const result = computeSnapResize(2000, 2000, 0, 0, CELL_SIZE, GAP_SIZE, 2, 5, 2, 4, 11);
    expect(result.colSpan).toBeLessThanOrEqual(5);
    expect(result.rowSpan).toBeLessThanOrEqual(4);
  });

  it("respects grid column boundary", () => {
    // Widget at col 9, grid has 11 columns — max colSpan is 2
    const result = computeSnapResize(2000, 200, 9, 0, CELL_SIZE, GAP_SIZE, 2, null, 2, null, 11);
    expect(result.colSpan).toBeLessThanOrEqual(2); // 11 - 9 = 2
  });

  it("allows unconstrained growth with null max", () => {
    // lower-thirds: no max col/row
    const result = computeSnapResize(800, 800, 0, 0, CELL_SIZE, GAP_SIZE, 2, null, 2, null, 11);
    expect(result.colSpan).toBeGreaterThan(2);
    expect(result.rowSpan).toBeGreaterThan(2);
  });

  it("clamps to minimum span even with negative pointer position", () => {
    const result = computeSnapResize(-50, -50, 0, 0, CELL_SIZE, GAP_SIZE, 2, 5, 2, 4, 11);
    expect(result.colSpan).toBe(2);
    expect(result.rowSpan).toBe(2);
  });
});

// ── rectanglesOverlap ─────────────────────────────────────────────────────────

describe("rectanglesOverlap", () => {
  it("returns false for non-overlapping adjacent rectangles (horizontal)", () => {
    expect(rectanglesOverlap(0, 0, 2, 2, 2, 0, 2, 2)).toBe(false);
  });

  it("returns false for non-overlapping adjacent rectangles (vertical)", () => {
    expect(rectanglesOverlap(0, 0, 2, 2, 0, 2, 2, 2)).toBe(false);
  });

  it("returns true for partially overlapping rectangles", () => {
    expect(rectanglesOverlap(0, 0, 3, 3, 2, 2, 3, 3)).toBe(true);
  });

  it("returns true for fully contained rectangle", () => {
    expect(rectanglesOverlap(0, 0, 5, 5, 1, 1, 2, 2)).toBe(true);
  });

  it("returns true for identical rectangles", () => {
    expect(rectanglesOverlap(0, 0, 2, 2, 0, 0, 2, 2)).toBe(true);
  });

  it("returns false for diagonally adjacent (corner touching)", () => {
    expect(rectanglesOverlap(0, 0, 2, 2, 2, 2, 2, 2)).toBe(false);
  });

  it("returns false for widely separated rectangles", () => {
    expect(rectanglesOverlap(0, 0, 2, 2, 10, 10, 2, 2)).toBe(false);
  });
});

// ── wouldOverlap ──────────────────────────────────────────────────────────────

describe("wouldOverlap", () => {
  const widgets: WidgetPlacement[] = [
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
    { widgetId: "camera", title: "Camera", col: 4, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
  ];

  it("returns false when position is clear of all widgets", () => {
    expect(wouldOverlap("new-widget", 0, 3, 2, 2, widgets)).toBe(false);
  });

  it("returns true when position overlaps an existing widget", () => {
    expect(wouldOverlap("new-widget", 2, 0, 3, 2, widgets)).toBe(true);
  });

  it("excludes the moving widget itself from overlap check", () => {
    // Moving obs to its own position — should not self-overlap
    expect(wouldOverlap("obs", 0, 0, 3, 2, widgets)).toBe(false);
  });

  it("detects overlap with any widget, not just the first", () => {
    expect(wouldOverlap("new-widget", 5, 0, 2, 2, widgets)).toBe(true);
  });

  it("returns false when widget fits between existing widgets", () => {
    expect(wouldOverlap("new-widget", 3, 0, 1, 2, widgets)).toBe(false);
  });
});

// ── findFirstAvailablePosition ────────────────────────────────────────────────

describe("findFirstAvailablePosition", () => {
  it("returns (0,0) for empty grid", () => {
    const result = findFirstAvailablePosition("obs", [], "large-landscape");
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it("finds position after existing widgets", () => {
    const widgets: WidgetPlacement[] = [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }];
    const result = findFirstAvailablePosition("camera", widgets, "large-landscape");
    // Camera needs 3 cols — should fit at col 3, row 0
    expect(result.col).toBe(3);
    expect(result.row).toBe(0);
  });

  it("wraps to next row when current row is full", () => {
    const widgets: WidgetPlacement[] = [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 5, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "lower-thirds", title: "LT", col: 5, row: 0, colSpan: 6, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ];
    // large-landscape has 11 cols. obs(5) + LT(6) = 11. Camera needs 3 — must go to row 2.
    const result = findFirstAvailablePosition("camera", widgets, "large-landscape");
    expect(result.row).toBeGreaterThanOrEqual(2);
  });

  it("returns (0,0) for unknown widget type", () => {
    const result = findFirstAvailablePosition("unknown-widget", [], "large-landscape");
    expect(result).toEqual({ col: 0, row: 0 });
  });

  it("handles small-portrait grid (3 columns) correctly", () => {
    // Camera needs minColSpan 3, and small-portrait has exactly 3 columns.
    // First position: (0,0). Second widget must go below.
    const widgets: WidgetPlacement[] = [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }];
    const result = findFirstAvailablePosition("camera", widgets, "small-portrait");
    expect(result.col).toBe(0);
    expect(result.row).toBeGreaterThanOrEqual(2);
  });

  // Property-based: result never exceeds grid column bounds
  it("never places widget outside grid columns (property)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("obs", "lower-thirds", "obs-preview", "camera"),
        fc.constantFrom("large-landscape", "large-portrait", "small-landscape", "small-portrait") as fc.Arbitrary<GridType>,
        (widgetId, gridType) => {
          const result = findFirstAvailablePosition(widgetId, [], gridType);
          const definition = WIDGET_TYPE_REGISTRY[widgetId];
          if (!definition) return true;
          return result.col + definition.minColSpan <= GRID_DIMENSIONS[gridType].columns;
        },
      ),
    );
  });
});
