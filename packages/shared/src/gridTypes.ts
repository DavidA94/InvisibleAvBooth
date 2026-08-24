export type GridType = "large-landscape" | "large-portrait" | "small-landscape" | "small-portrait";

export const GRID_TYPES: GridType[] = ["large-landscape", "large-portrait", "small-landscape", "small-portrait"];

export interface GridDimensions {
  columns: number;
  /** Default rows visible on screen at native resolution (editor uses this for screen-edge line) */
  defaultRows: number;
  /** Total width in rem (columns × cellSizeRem + (columns-1) × gapSizeRem) — fixed per grid type */
  totalWidthRem: number;
}

/** Cell size in rem — 7.25rem = 116px at 16px root */
export const GRID_CELL_SIZE_REM = 7.25;

/** Gap size in rem (matches --space-grid-gap) — 0.75rem = 12px at 16px root */
export const GRID_GAP_SIZE_REM = 0.75;

/**
 * Grid dimensions per type. Columns are fixed; rows are dynamic (grow with content).
 * `defaultRows` is the number of rows that fit on screen at native resolution —
 * used by the editor to draw the "screen edge" indicator line.
 * `totalWidthRem` is fixed (columns × cellSizeRem + (columns-1) × gapSizeRem).
 * Height is computed at runtime via computeGridHeightRem().
 */
export const GRID_DIMENSIONS: Record<GridType, GridDimensions> = {
  "large-landscape": { columns: 11, defaultRows: 7, totalWidthRem: 87.25 },
  "large-portrait": { columns: 7, defaultRows: 11, totalWidthRem: 55.25 },
  "small-landscape": { columns: 7, defaultRows: 3, totalWidthRem: 55.25 },
  "small-portrait": { columns: 3, defaultRows: 7, totalWidthRem: 23.25 },
};

/** Compute grid height in rem for a given number of rows */
export function computeGridHeightRem(rows: number): number {
  return rows * GRID_CELL_SIZE_REM + (rows - 1) * GRID_GAP_SIZE_REM;
}

/** Breakpoints for grid type selection (pixels — viewport dimensions are always in px) */
export const BREAKPOINT_LARGE_WIDTH = 1200;
export const BREAKPOINT_LARGE_HEIGHT = 700;

/** Minimum scale factor — below this, touch targets become too small */
export const MIN_SCALE_FLOOR = 0.65;
