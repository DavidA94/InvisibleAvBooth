import { GRID_DIMENSIONS, WIDGET_TYPE_REGISTRY } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";

export interface WidgetPlacement {
  widgetId: string;
  title: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  roleMinimum: string;
}

/**
 * Compute the snapped cell position for a pointer coordinate during a move.
 *
 * The 35/65 snap rule: the pointer must travel past the gap AND 35% into the
 * next cell before snapping forward. Total threshold from current cell's far
 * edge = gapSize + cellSize × 0.35. Below this: stay. At or above: snap.
 *
 * Pointer coordinates are in pixels (from DOM events relative to the grid container).
 */
export function computeSnapPosition(
  pointerX: number,
  pointerY: number,
  dragOffsetX: number,
  dragOffsetY: number,
  cellSize: number,
  gapSize: number,
): { col: number; row: number } {
  const effectiveX = pointerX - dragOffsetX;
  const effectiveY = pointerY - dragOffsetY;

  return {
    col: Math.max(0, snapAxis(effectiveX, cellSize, gapSize)),
    row: Math.max(0, snapAxis(effectiveY, cellSize, gapSize)),
  };
}

/**
 * Compute snapped span values during a resize operation.
 *
 * Same snap rule as move but applied to the trailing edge of the widget.
 * Results are clamped to min/max span constraints and grid column bounds.
 */
export function computeSnapResize(
  pointerX: number,
  pointerY: number,
  widgetCol: number,
  widgetRow: number,
  cellSize: number,
  gapSize: number,
  minColSpan: number,
  maxColSpan: number | null,
  minRowSpan: number,
  maxRowSpan: number | null,
  gridColumns: number,
): { colSpan: number; rowSpan: number } {
  const cellWithGap = cellSize + gapSize;

  // The widget's left/top edge in pixels
  const widgetLeftPx = widgetCol * cellWithGap;
  const widgetTopPx = widgetRow * cellWithGap;

  // Distance from widget origin to pointer = desired span in px
  const spanXPx = pointerX - widgetLeftPx;
  const spanYPx = pointerY - widgetTopPx;

  // Convert to cell count using snap logic
  let colSpan = Math.max(1, snapSpanAxis(spanXPx, cellSize, gapSize));
  let rowSpan = Math.max(1, snapSpanAxis(spanYPx, cellSize, gapSize));

  // Clamp to constraints
  colSpan = Math.max(minColSpan, colSpan);
  rowSpan = Math.max(minRowSpan, rowSpan);
  if (maxColSpan !== null) colSpan = Math.min(maxColSpan, colSpan);
  if (maxRowSpan !== null) rowSpan = Math.min(maxRowSpan, rowSpan);

  // Clamp to grid column bounds
  colSpan = Math.min(colSpan, gridColumns - widgetCol);

  return { colSpan, rowSpan };
}

/**
 * Check if placing a widget at a new position would overlap any other widget.
 * Excludes the widget being moved (identified by widgetId).
 */
export function wouldOverlap(
  movingWidgetId: string,
  newCol: number,
  newRow: number,
  newColSpan: number,
  newRowSpan: number,
  allWidgets: WidgetPlacement[],
): boolean {
  for (const other of allWidgets) {
    if (other.widgetId === movingWidgetId) continue;
    if (rectanglesOverlap(newCol, newRow, newColSpan, newRowSpan, other.col, other.row, other.colSpan, other.rowSpan)) {
      return true;
    }
  }
  return false;
}

/** Check if two axis-aligned rectangles (defined by grid cell coordinates) overlap. */
export function rectanglesOverlap(
  aCol: number,
  aRow: number,
  aColSpan: number,
  aRowSpan: number,
  bCol: number,
  bRow: number,
  bColSpan: number,
  bRowSpan: number,
): boolean {
  return !(aCol + aColSpan <= bCol || bCol + bColSpan <= aCol || aRow + aRowSpan <= bRow || bRow + bRowSpan <= aRow);
}

/**
 * Find the first available position for a new widget on a grid.
 * Scans row by row, column by column for the first fit at minimum size.
 * Always succeeds because rows are dynamic (unlimited vertical space).
 */
export function findFirstAvailablePosition(widgetId: string, widgets: WidgetPlacement[], gridType: GridType): { col: number; row: number } {
  const definition = WIDGET_TYPE_REGISTRY[widgetId];
  if (!definition) return { col: 0, row: 0 };

  const gridDimensions = GRID_DIMENSIONS[gridType];
  const colSpan = definition.minColSpan;
  const rowSpan = definition.minRowSpan;

  // Determine search limit: current max row + enough space for the new widget
  const maxRow = widgets.length > 0 ? Math.max(...widgets.map((w) => w.row + w.rowSpan)) : 0;
  const searchLimit = maxRow + rowSpan;

  for (let row = 0; row <= searchLimit; row++) {
    for (let col = 0; col <= gridDimensions.columns - colSpan; col++) {
      if (!wouldOverlap(widgetId, col, row, colSpan, rowSpan, widgets)) {
        return { col, row };
      }
    }
  }

  // Fallback: place below everything (should never reach here due to searchLimit logic)
  return { col: 0, row: maxRow };
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Snap a single axis position to the nearest cell using the 35/65 rule.
 * Returns the cell index (0-based).
 *
 * Grid layout: [cell0][gap][cell1][gap][cell2]...
 * Each cell is cellSize px wide, each gap is gapSize px wide.
 * Cell N starts at N × (cellSize + gapSize).
 *
 * The snap rule: to move from cell N to cell N+1, the pointer must travel
 * past cell N's far edge by (gapSize + cellSize × 0.35). This means the
 * pointer must be at position ≥ N×(cellSize+gapSize) + cellSize + gapSize + cellSize×0.35.
 */
function snapAxis(positionPx: number, cellSize: number, gapSize: number): number {
  if (positionPx <= 0) return 0;

  const cellWithGap = cellSize + gapSize;
  // The snap threshold distance past a cell's far edge
  const forwardThreshold = gapSize + cellSize * 0.35;

  // Start from cell 0 and check how many cell boundaries we've crossed
  // Cell N's far edge (right edge of its area) is at: N * cellWithGap + cellSize
  // To be in cell N+1, position must be >= N*cellWithGap + cellSize + forwardThreshold
  let cell = 0;
  while (true) {
    const cellFarEdge = cell * cellWithGap + cellSize;
    if (positionPx >= cellFarEdge + forwardThreshold) {
      cell++;
    } else {
      break;
    }
  }
  return cell;
}

/**
 * Snap a span measurement (distance from widget origin to pointer) to cell count.
 * Uses the same threshold logic: span must extend past N complete cells (each cellSize+gapSize wide)
 * plus the threshold into the next cell to count as N+1 cells.
 */
function snapSpanAxis(spanPx: number, cellSize: number, gapSize: number): number {
  if (spanPx <= 0) return 1;

  const cellWithGap = cellSize + gapSize;
  const forwardThreshold = gapSize + cellSize * 0.35;

  // A span of 1 cell covers cellSize px.
  // To reach span of 2, the span must be >= cellSize + forwardThreshold (= 1 cell + gap + 35% into next)
  // To reach span of N+1, the span must be >= N*cellWithGap + cellSize + forwardThreshold - gapSize
  // Actually: the first cell is just cellSize. After that, each additional cell adds cellWithGap.
  // So span for N cells = cellSize + (N-1)*cellWithGap
  // To snap to N+1, span must be >= cellSize + (N-1)*cellWithGap + forwardThreshold

  let cells = 1;
  while (true) {
    // Distance needed to snap to cells+1
    const thresholdForNext = cellSize + (cells - 1) * cellWithGap + forwardThreshold;
    if (spanPx >= thresholdForNext) {
      cells++;
    } else {
      break;
    }
  }
  return cells;
}
