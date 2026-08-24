import { WIDGET_TYPE_REGISTRY, GRID_DIMENSIONS, GRID_TYPES } from "@invisible-av-booth/shared";
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

export interface ValidationError {
  field: string;
  message: string;
}

// ── Slug validation ───────────────────────────────────────────────────────────

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 64;

export function validateSlug(slug: string): ValidationError | null {
  if (!slug) {
    return { field: "slug", message: "Slug is required" };
  }
  if (slug.length > MAX_SLUG_LENGTH) {
    return { field: "slug", message: `Slug must be at most ${MAX_SLUG_LENGTH} characters` };
  }
  if (!SLUG_REGEX.test(slug)) {
    return {
      field: "slug",
      message: "Slug must contain only lowercase letters, digits, and hyphens (no leading/trailing/consecutive hyphens)",
    };
  }
  return null;
}

// ── Grid column bounds ────────────────────────────────────────────────────────

/**
 * Only column bounds are validated — rows are dynamic (grids grow vertically).
 */
export function validateGridColumnBounds(widget: WidgetPlacement, gridType: GridType): ValidationError | null {
  const gridDimensions = GRID_DIMENSIONS[gridType];
  if (widget.col + widget.colSpan > gridDimensions.columns) {
    const displayName = WIDGET_TYPE_REGISTRY[widget.widgetId]?.displayName ?? widget.widgetId;
    return {
      field: "grids",
      message: `Widget '${displayName}' exceeds grid bounds on '${gridType}' (col ${widget.col} + colSpan ${widget.colSpan} > ${gridDimensions.columns})`,
    };
  }
  return null;
}

// ── Widget size constraints ───────────────────────────────────────────────────

export function validateWidgetConstraints(widget: WidgetPlacement): ValidationError | null {
  const definition = WIDGET_TYPE_REGISTRY[widget.widgetId];
  if (!definition) return null; // Unknown widget type — allow (forward compatibility)

  if (widget.colSpan < definition.minColSpan) {
    return {
      field: "grids",
      message: `Widget '${definition.displayName}' cannot be smaller than ${definition.minColSpan}×${definition.minRowSpan}`,
    };
  }
  if (widget.rowSpan < definition.minRowSpan) {
    return {
      field: "grids",
      message: `Widget '${definition.displayName}' cannot be smaller than ${definition.minColSpan}×${definition.minRowSpan}`,
    };
  }
  if (definition.maxColSpan !== null && widget.colSpan > definition.maxColSpan) {
    return {
      field: "grids",
      message: `Widget '${definition.displayName}' cannot exceed ${definition.maxColSpan} columns`,
    };
  }
  if (definition.maxRowSpan !== null && widget.rowSpan > definition.maxRowSpan) {
    return {
      field: "grids",
      message: `Widget '${definition.displayName}' cannot exceed ${definition.maxRowSpan} rows`,
    };
  }
  return null;
}

// ── Overlap detection ─────────────────────────────────────────────────────────

function widgetsOverlap(a: WidgetPlacement, b: WidgetPlacement): boolean {
  return !(a.col + a.colSpan <= b.col || b.col + b.colSpan <= a.col || a.row + a.rowSpan <= b.row || b.row + b.rowSpan <= a.row);
}

export function validateNoOverlaps(widgets: WidgetPlacement[], gridType: GridType): ValidationError[] {
  const errors: ValidationError[] = [];
  for (let i = 0; i < widgets.length; i++) {
    for (let j = i + 1; j < widgets.length; j++) {
      const a = widgets[i]!;
      const b = widgets[j]!;
      if (widgetsOverlap(a, b)) {
        errors.push({
          field: "grids",
          message: `Widget '${a.widgetId}' overlaps with widget '${b.widgetId}' on grid '${gridType}'`,
        });
      }
    }
  }
  return errors;
}

// ── Same widgets on all grids ─────────────────────────────────────────────────

export function validateSameWidgets(grids: Record<string, WidgetPlacement[]>): ValidationError[] {
  const gridEntries = Object.entries(grids) as [GridType, WidgetPlacement[]][];
  if (gridEntries.length === 0) return [];

  // Build the union of all widget IDs across all grids as the reference set
  const allWidgetIds = new Set<string>();
  for (const [, widgets] of gridEntries) {
    for (const widget of widgets) allWidgetIds.add(widget.widgetId);
  }

  const errors: ValidationError[] = [];
  for (const [gridType, widgets] of gridEntries) {
    const widgetSet = new Set(widgets.map((widget) => widget.widgetId));
    const missing = [...allWidgetIds].filter((id) => !widgetSet.has(id));
    if (missing.length > 0) {
      errors.push({ field: "grids", message: `Missing from '${gridType}': ${missing.join(", ")}` });
    }
  }
  return errors;
}

// ── Completeness check ────────────────────────────────────────────────────────

export function isDashboardComplete(dashboard: { name: string; slug: string; allowedRoles: string[] }, grids: Record<string, WidgetPlacement[]>): boolean {
  if (!dashboard.name || !dashboard.slug) return false;
  if (dashboard.allowedRoles.length === 0) return false;
  for (const gridType of GRID_TYPES) {
    if (!grids[gridType] || grids[gridType]!.length === 0) return false;
  }
  // All grids must have the same widget set
  const sameWidgetErrors = validateSameWidgets(grids);
  if (sameWidgetErrors.length > 0) return false;
  return true;
}

// ── Full grid validation ──────────────────────────────────────────────────────

/**
 * Validates all four grids: constraints, bounds, overlaps, and same-widget consistency.
 * Returns an array of validation errors (empty = valid).
 */
export function validateGrids(grids: Record<string, WidgetPlacement[]>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check that all grids have the same widget set
  errors.push(...validateSameWidgets(grids));

  for (const [gridType, widgets] of Object.entries(grids) as [GridType, WidgetPlacement[]][]) {
    // Per-widget validation
    for (const widget of widgets) {
      const constraintError = validateWidgetConstraints(widget);
      if (constraintError) errors.push(constraintError);

      const boundsError = validateGridColumnBounds(widget, gridType);
      if (boundsError) errors.push(boundsError);
    }

    // Overlap detection within each grid
    errors.push(...validateNoOverlaps(widgets, gridType));
  }

  return errors;
}
