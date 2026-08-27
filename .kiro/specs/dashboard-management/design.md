# Design Document — Dashboard Management

## Overview

This document covers the design for admin-managed dashboards with four-grid layouts, a visual drag-and-drop grid editor, slug-based URLs, and a shared widget type registry. It replaces the current seed-script approach with a full admin UI following the established list+detail panel pattern.

This is an extension document — it builds on the designs at `.kiro/specs/livestream-control-system/design.md` (dashboard grid, admin patterns, auth) and `.kiro/specs/video-control-and-preview/design.md` (widget rendering, camera/obs-preview widgets). Patterns and conventions defined there remain authoritative.

### What This Release Adds

- Widget Type Registry in `packages/shared` (display names, size constraints)
- Four-grid layout system (large/small × landscape/portrait, 7.25rem cells)
- `slug` column on `dashboards` table, `gridType` column on `widget_configurations`
- Admin Dashboard Management page with visual grid editor
- Atomic dashboard save API (metadata + all four grid layouts)
- Backend validation (overlap, bounds, constraints, uniqueness)
- Dashboard completeness detection
- Updated public dashboard API (slug-based, returns all four layouts)
- Updated frontend dashboard renderer (auto-selects grid by viewport)

### Breaking Changes

- **`dashboards` table**: New `slug TEXT NOT NULL UNIQUE` column. The existing `id` remains as the internal identifier; the slug is the public URL identifier.
- **`widget_configurations` table**: New `gridType` column. The `UNIQUE(dashboardId, widgetId)` constraint becomes `UNIQUE(dashboardId, widgetId, gridType)`.
- **Dashboard URL**: Changes from `/dashboard/:id` to `/dashboard/:slug`.
- **Public API**: `GET /api/dashboards/:slug/layout` replaces the old `:id` based endpoint and returns all four layouts.
- **Grid dimensions**: Dashboard grid changes from fixed 1400×900px / 10×6 to four grid types with varying dimensions. The `Dashboard.tsx` component auto-selects.
- **`seed-dashboard.ts`**: Updated to seed all four grid types with the new schema.

---

## Architecture

### Data Flow

```
Admin UI (Grid Editor)
       │
       ▼ PUT /api/admin/dashboards/:id
Backend validates:
  - slug format + uniqueness
  - name uniqueness (case-insensitive)
  - same widgets on all 4 grids
  - per-grid: overlap, bounds, constraints
       │
       ▼ SQLite transaction
dashboards table + widget_configurations table (4× per widget)
       │
       ▼ GET /api/dashboards/:slug/layout (volunteer)
Returns all 4 grid layouts
       │
       ▼ Frontend auto-selects grid type
Dashboard renders with correct layout
```

### Key Design Decisions

**Atomic save (all grids at once, not per-grid):**
The admin edits all four grids in a single session and saves once. This simplifies the consistency guarantee (same widgets on all grids) — the backend can validate the full payload in one pass rather than needing cross-grid validation on individual grid saves. The frontend holds all four layouts in memory and submits them together.

**Slug as public identifier, ID as internal identifier:**
The admin routes continue to use the hex `id` for CRUD operations because the slug can change (admin edits it). Internal foreign keys stay on `id`. The public-facing routes (used by volunteers and the frontend router) use the slug for clean URLs.

**Frontend fetches all four layouts at once:**
When a volunteer navigates to `/dashboard/:slug`, the frontend fetches all four grid layouts in a single response and holds them in memory. On viewport resize or orientation change, it switches layouts client-side with zero network latency. This eliminates a flash of loading when rotating a tablet.

**Same widgets on all four grids (enforced):**
This simplifies the volunteer experience — you never get "this widget is on my landscape view but missing when I rotate." The admin places the same set of widgets on each grid but can position and size them independently per grid type.

**Shared widget type registry:**
Having the registry in `packages/shared` means the backend validation and frontend editor always agree on widget names and constraints. Adding a new widget type is a single registry entry.

**35/65 snap threshold:**
The snap threshold is `gapSize + cellSize × 0.35` = 52.6px past the current cell's far edge. This is far enough past the gap and into the next cell's territory to clearly indicate intent, while being less than halfway (so the admin isn't fighting the snap). The ghost preview shows exactly where it will land at all times, so the admin always knows the outcome before releasing.

**Dynamic row count (grids grow vertically):**
Rather than fixed row counts that cap widget placement, all grid types have dynamic height — rows are added as widgets are placed. This eliminates the "grid is full" failure mode that would otherwise make the smallest grids (3 columns, 7 columns) severely constrained. The "default rows" value per grid type represents what fits on screen without scrolling at native resolution and is shown as a dotted "screen edge" indicator in the editor.

**Viewport scaling (CSS custom property + :has selector, not transform):**
When a device viewport is smaller than the grid's native pixel dimensions, the entire page is scaled down via a CSS custom property (`--dashboard-scale-font-size`) consumed by `html:has(.dashboard-page) { font-size: var(...) }`. The `:has()` selector scopes the scaling to only when a dashboard is mounted — admin pages are never affected, and no explicit cleanup is needed (the CSS cascade handles it). This was chosen over `transform: scale()` because: (1) it avoids transform stacking context issues with Ionic overlays (popovers, toasts), (2) pointer events work naturally without coordinate translation, (3) the entire UI scales uniformly (no visual disconnect), and (4) scrolling within widgets works normally. The tradeoff is that Ionic's internal pixel-based borders/shadows appear slightly thicker proportionally at small scales — a cosmetic-only issue. If `:has()` causes issues with older browsers, the fallback is direct `document.documentElement.style.fontSize` with cleanup on unmount (~5-line change).

**Cache shape validation (no versioning):**
The canonical manifest format is `{ grids: Record<string, GridCell[]> }`. The frontend checks whether cached localStorage data has this expected shape. Invalid or corrupted data is discarded and a fresh fetch is triggered. The existing `normalizeManifest()` function handles backward-compatible conversion of old API responses (the `{ version: 1, cells: [...] }` format), and `DEFAULT_GRID_MANIFEST` provides a last-resort fallback if both cache and API fail. These are preserved behaviors from the livestream-control-system spec — this spec does not change them.

---

## Shared Package Changes

### Widget Type Registry

**File:** `packages/shared/src/widgetTypeRegistry.ts`

```typescript
export interface WidgetTypeDefinition {
  /** Display name shown in grid editor and WidgetContainer title bar */
  displayName: string;
  /** Minimum number of columns this widget can occupy */
  minColSpan: number;
  /** Maximum columns (null = unconstrained up to grid bounds) */
  maxColSpan: number | null;
  /** Minimum number of rows this widget can occupy */
  minRowSpan: number;
  /** Maximum rows (null = unconstrained up to grid bounds) */
  maxRowSpan: number | null;
}

/**
 * Authoritative widget size constraints.
 *
 * These values define minimum and maximum col/row spans for each widget type.
 * Because grids have dynamic row counts (they grow vertically as needed),
 * fitting all widgets is only constrained by column count — not row count.
 *
 * - OBS: Status bar + 2 buttons need ~2 cols minimum; 2 rows for status+controls.
 *   Max 5×4 prevents an absurdly stretched layout with wasted space.
 * - Lower Thirds: Library list + active section need 2×2 minimum for usable
 *   inline interaction (active item + dismiss button + at least one library row).
 *   Unconstrained max — benefits from extra space (more list items visible).
 * - OBS Preview: Video frame needs at least 2×2 to be recognizable.
 *   Unconstrained max — video scales cleanly.
 * - Camera: Video + joystick + presets. Needs 3×2 minimum (compact layout
 *   with video-only view; tapping opens full control modal).
 *   Unconstrained max — uses extra space for larger preview and expanded controls.
 *
 * On 3-column grids (small-portrait), all widgets stack at full width (3 cols).
 * On 7-column grids (small-landscape, large-portrait), widgets can sit side-by-side.
 * The grid simply grows taller as needed — no fixed-row ceiling.
 */
export const WIDGET_TYPE_REGISTRY: Record<string, WidgetTypeDefinition> = {
  obs: {
    displayName: "OBS",
    minColSpan: 2,
    maxColSpan: 5,
    minRowSpan: 2,
    maxRowSpan: 4,
  },
  "lower-thirds": {
    displayName: "Lower Thirds",
    minColSpan: 2,
    maxColSpan: null,
    minRowSpan: 2,
    maxRowSpan: null,
  },
  "obs-preview": {
    displayName: "OBS Preview",
    minColSpan: 2,
    maxColSpan: null,
    minRowSpan: 2,
    maxRowSpan: null,
  },
  camera: {
    displayName: "Camera",
    minColSpan: 3,
    maxColSpan: null,
    minRowSpan: 2,
    maxRowSpan: null,
  },
};

/** Ordered list of widget type IDs for the "add widget" UI */
export const WIDGET_TYPE_IDS: string[] = Object.keys(WIDGET_TYPE_REGISTRY);
```

### Grid Type Constants

**File:** `packages/shared/src/gridTypes.ts`

```typescript
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

/**
 * Breakpoints for grid type selection (pixels — viewport width thresholds).
 *
 * isLarge is determined by viewport width alone, relative to orientation:
 * - In landscape (width > height): large if width >= BREAKPOINT_LARGE_LANDSCAPE (1200px)
 * - In portrait (width <= height): large if width >= BREAKPOINT_LARGE_PORTRAIT (700px)
 */
export const BREAKPOINT_LARGE_LANDSCAPE = 1200;
export const BREAKPOINT_LARGE_PORTRAIT = 700;

/** Minimum scale factor — below this, touch targets become too small */
export const MIN_SCALE_FLOOR = 0.65;
```

### Updated GridManifest Type

**File:** `packages/shared/src/types.ts` (modified)

```typescript
export interface GridManifest {
  grids: Record<GridType, GridCell[]>;
}

// GridCell unchanged — col, row, colSpan, rowSpan, widgetId, title, roleMinimum
```

No version field is needed. The frontend validates the cached manifest by checking for the `grids` record — if the cached data doesn't have the expected shape, it's treated as invalid, cleared from localStorage, and a fresh fetch is triggered. The existing `normalizeManifest()` function handles backward-compatible conversion of old API responses; this spec does not change that behavior.

### Exports

Add to `packages/shared/src/index.ts`:

```typescript
export { WIDGET_TYPE_REGISTRY, WIDGET_TYPE_IDS } from "./widgetTypeRegistry.js";
export type { WidgetTypeDefinition } from "./widgetTypeRegistry.js";
export {
  GRID_TYPES,
  GRID_DIMENSIONS,
  GRID_CELL_SIZE_REM,
  GRID_GAP_SIZE_REM,
  computeGridHeightRem,
  BREAKPOINT_LARGE_LANDSCAPE,
  BREAKPOINT_LARGE_PORTRAIT,
  MIN_SCALE_FLOOR,
} from "./gridTypes.js";
export type { GridType, GridDimensions } from "./gridTypes.js";
```

---

## Database Schema Changes

### dashboards table

```sql
CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  allowedRoles TEXT NOT NULL DEFAULT '[]',
  createdAt TEXT NOT NULL
);

-- Case-insensitive name uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_name_lower ON dashboards(LOWER(name));
```

### widget_configurations table

```sql
CREATE TABLE IF NOT EXISTS widget_configurations (
  id TEXT PRIMARY KEY NOT NULL,
  dashboardId TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
  widgetId TEXT NOT NULL,
  gridType TEXT NOT NULL CHECK(gridType IN ('large-landscape', 'large-portrait', 'small-landscape', 'small-portrait')),
  title TEXT NOT NULL,
  col INTEGER NOT NULL,
  row INTEGER NOT NULL,
  colSpan INTEGER NOT NULL,
  rowSpan INTEGER NOT NULL,
  roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
  createdAt TEXT NOT NULL,
  UNIQUE(dashboardId, widgetId, gridType)
);
```

### Migration Strategy

Since the system is still in development with no production deployments, the migration is destructive:

1. Drops the old `widget_configurations` table
2. Recreates with the new schema (includes `gridType`)
3. Adds `slug` column to `dashboards` (generates a default for any existing rows: `slug = LOWER(REPLACE(name, ' ', '-'))`)
4. Adds the unique index on `LOWER(name)`

This runs in `applySchema()` as a conditional migration (checks if `gridType` column exists on `widget_configurations`).

After migration, `seed-dashboard.ts` is responsible for inserting the default dashboard with all four grid layouts. The seed script is the definitive source for the initial "Main Dashboard" layout across all four grid types — it inserts concrete widget positions (not illustrative) that fit within each grid's bounds and respect all widget constraints.

---

## Backend Changes

### Admin Dashboard Routes (Rewritten)

**File:** `packages/backend/src/routes/adminDashboardRoutes.ts`

The existing CRUD routes are restructured for the new schema. The key change is the save endpoint which accepts the full dashboard + all four grid layouts atomically.

#### GET /api/admin/dashboards

Returns all dashboards with metadata (no widget data — that's loaded per-dashboard).

```typescript
interface AdminDashboardSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  allowedRoles: string[];
  isComplete: boolean;
  createdAt: string;
}
```

#### GET /api/admin/dashboards/:id

Returns full dashboard detail including all four grid layouts:

```typescript
interface AdminDashboardDetail {
  id: string;
  slug: string;
  name: string;
  description: string;
  allowedRoles: string[];
  isComplete: boolean;
  createdAt: string;
  grids: Record<GridType, WidgetPlacement[]>;
}

interface WidgetPlacement {
  widgetId: string;
  title: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  roleMinimum: string;
}
```

#### POST /api/admin/dashboards

Creates a new dashboard. Accepts partial data (metadata only is fine for first save).

**Request body:**

```typescript
{
  name: string;
  slug: string;
  description?: string;
  allowedRoles?: string[];
  grids?: Record<GridType, WidgetPlacement[]>;
}
```

**Validation (in order):**

1. `name` required and non-empty
2. `slug` required, validated against regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`, max 64 chars
3. `slug` uniqueness check → 409 if duplicate
4. `name` case-insensitive uniqueness check → 409 if duplicate
5. If `grids` provided: validate same widgets on all provided grids, overlap, bounds, constraints

**Response:** 201 with the created dashboard (including `isComplete`)

#### PUT /api/admin/dashboards/:id

Updates an existing dashboard. Full atomic save of metadata + grids.

**Request body:** Same shape as POST (all fields optional — omitted fields retain current values; `grids` replaces ALL grid data when provided).

**Validation:** Same as POST, plus 404 if dashboard not found.

**Transaction:** When `grids` is provided, the update:

1. Deletes all existing `widget_configurations` for this dashboard
2. Inserts all new widget configurations across all four grid types
3. Updates dashboard metadata

All within a single `database.transaction(...)` call.

**Response:** 200 with updated dashboard

#### DELETE /api/admin/dashboards/:id

Deletes the dashboard and all associated widget configurations atomically (the `ON DELETE CASCADE` foreign key constraint ensures all widget_configurations rows are removed in the same transaction as the dashboard row). Returns 204. Returns 404 if the dashboard does not exist.

### Validation Logic

**File:** `packages/backend/src/validation/dashboardValidation.ts`

```typescript
import { WIDGET_TYPE_REGISTRY, GRID_DIMENSIONS } from "@invisible-av-booth/shared";
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

export function validateSlug(slug: string): ValidationError | null;
export function validateGrids(grids: Record<GridType, WidgetPlacement[]>): ValidationError[];
```

**Overlap detection:**
For each grid type, check every pair of widgets. Two widgets overlap if their bounding rectangles intersect:

```typescript
function widgetsOverlap(a: WidgetPlacement, b: WidgetPlacement): boolean {
  return !(a.col + a.colSpan <= b.col || b.col + b.colSpan <= a.col || a.row + a.rowSpan <= b.row || b.row + b.rowSpan <= a.row);
}
```

**Grid bounds:**

```typescript
/** Only column bounds are validated — rows are dynamic (grids grow vertically) */
function exceedsColumnBounds(widget: WidgetPlacement, gridType: GridType): boolean {
  const gridDimensions = GRID_DIMENSIONS[gridType];
  return widget.col + widget.colSpan > gridDimensions.columns;
}
```

**Size constraints:**

```typescript
function violatesConstraints(widget: WidgetPlacement): string | null {
  const definition = WIDGET_TYPE_REGISTRY[widget.widgetId];
  if (!definition) return null; // Unknown widget type — allow (forward compatibility)
  if (widget.colSpan < definition.minColSpan) return `Widget '${definition.displayName}' cannot be smaller than ${definition.minColSpan} columns wide`;
  if (widget.rowSpan < definition.minRowSpan) return `Widget '${definition.displayName}' cannot be smaller than ${definition.minRowSpan} rows tall`;
  if (definition.maxColSpan !== null && widget.colSpan > definition.maxColSpan)
    return `Widget '${definition.displayName}' cannot exceed ${definition.maxColSpan} columns`;
  if (definition.maxRowSpan !== null && widget.rowSpan > definition.maxRowSpan)
    return `Widget '${definition.displayName}' cannot exceed ${definition.maxRowSpan} rows`;
  return null;
}
```

**Same widgets on all grids:**

```typescript
function validateSameWidgets(grids: Record<GridType, WidgetPlacement[]>): ValidationError[] {
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
```

**Completeness check:**

```typescript
export function isDashboardComplete(dashboard: { name: string; slug: string; allowedRoles: string[] }, grids: Record<GridType, WidgetPlacement[]>): boolean {
  if (!dashboard.name || !dashboard.slug) return false;
  if (dashboard.allowedRoles.length === 0) return false;
  for (const gridType of GRID_TYPES) {
    if (!grids[gridType] || grids[gridType].length === 0) return false;
  }
  return true;
}
```

### Public Dashboard Routes (Updated)

**File:** `packages/backend/src/routes/dashboardRoutes.ts`

#### GET /api/dashboards

Returns dashboards accessible to the user. For non-admins, only returns complete dashboards.

```typescript
interface PublicDashboardSummary {
  slug: string;
  name: string;
  description: string;
}
```

#### GET /api/dashboards/:slug/layout

Returns all four grid layouts for a dashboard (identified by slug).

**Response:**

```typescript
{
  grids: {
    "large-landscape": [...cells],
    "large-portrait": [...cells],
    "small-landscape": [...cells],
    "small-portrait": [...cells]
  }
}
```

Role-based filtering: cells with `roleMinimum` higher than the requesting user's role are excluded from the response.

---

## Frontend Changes

### Dashboard Renderer Updates

**File:** `packages/frontend/src/pages/Dashboard.tsx`

Major changes:

1. **Route parameter**: `:id` becomes `:slug`
2. **Layout response**: Expects four-grid format with `grids` record
3. **Grid selection**: Auto-selects based on viewport (hook: `useGridType()`)
4. **Widget rendering**: Uses the shared registry instead of hardcoded if/else

Preserved behaviors (no changes — defined in livestream-control-system spec):

- **`normalizeManifest()`**: Converts old `{ version: 1, cells: [...] }` API responses to the four-grid format for backward compatibility during transition.
- **`DEFAULT_GRID_MANIFEST`**: Hardcoded fallback manifest used when both localStorage cache and API fetch fail. Ensures volunteers always see something.
- **`isStructuralChange()` + refreshing state**: When a fresh API response differs structurally from the cached manifest, a brief "Refreshing" spinner is shown before applying the new layout. Prevents jarring layout shifts mid-session.

```typescript
import {
  GRID_DIMENSIONS,
  GRID_CELL_SIZE_REM,
  GRID_GAP_SIZE_REM,
  computeGridHeightRem,
  BREAKPOINT_LARGE_LANDSCAPE,
  BREAKPOINT_LARGE_PORTRAIT,
  MIN_SCALE_FLOOR,
} from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";

// Hook: determines which grid type to use based on viewport
function useGridType(): GridType {
  const [gridType, setGridType] = useState<GridType>(computeGridType());

  useEffect(() => {
    const handler = () => setGridType(computeGridType());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return gridType;
}

function computeGridType(): GridType {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const isLarge = isLandscape ? width >= BREAKPOINT_LARGE_LANDSCAPE : width >= BREAKPOINT_LARGE_PORTRAIT;

  if (isLarge && isLandscape) return "large-landscape";
  if (isLarge && !isLandscape) return "large-portrait";
  if (!isLarge && isLandscape) return "small-landscape";
  return "small-portrait";
}
```

**Viewport scaling hook** — ensures the grid never causes scrollbars:

```typescript
const MIN_SCALE_FLOOR = 0.65; // Below this, touch targets (2.75rem at 10.4px root = 28.6px) are marginal
const BASE_FONT_SIZE = 16;

/**
 * Scales the entire page by setting a CSS custom property that the
 * `html:has(.dashboard-page)` rule reads for font-size.
 *
 * The CSS `:has()` selector ensures scaling only applies when the dashboard
 * component is mounted. When navigating to admin pages (no `.dashboard-page`
 * in DOM), the rule doesn't match and html falls back to 16px automatically.
 * No explicit cleanup is needed — the CSS cascade handles it.
 *
 * The hook still removes the property on unmount as a safety measure,
 * but even if that fails, the :has() rule stops matching.
 */
function useGridScale(gridType: GridType): void {
  useEffect(() => {
    const gridDimensions = GRID_DIMENSIONS[gridType];
    // Native pixel dimensions at 16px root
    const nativeWidth = gridDimensions.totalWidthRem * BASE_FONT_SIZE;
    const nativeHeight = computeGridHeightRem(gridDimensions.defaultRows) * BASE_FONT_SIZE;

    const computeScale = () => {
      const factor = Math.min(
        window.innerWidth / nativeWidth,
        window.innerHeight / nativeHeight,
        1.0, // never scale UP
      );
      const clamped = Math.max(factor, MIN_SCALE_FLOOR);

      document.documentElement.style.setProperty("--dashboard-scale-font-size", `${BASE_FONT_SIZE * clamped}px`);
    };

    computeScale();
    window.addEventListener("resize", computeScale);

    return () => {
      // Safety cleanup — :has() rule already stops matching on unmount
      document.documentElement.style.removeProperty("--dashboard-scale-font-size");
      window.removeEventListener("resize", computeScale);
    };
  }, [gridType]);
}
```

The corresponding CSS rule (in `variables.css`):

```css
/* Viewport scaling — only applies when dashboard is mounted.
   Falls back to 16px when no .dashboard-page exists in the DOM. */
html:has(.dashboard-page) {
  font-size: var(--dashboard-scale-font-size, 16px);
}
```

The grid container uses rem directly (no px conversion needed):

```typescript
const gridDimensions = GRID_DIMENSIONS[gridType];
const cells = manifest.grids[gridType];
const actualRows = Math.max(...cells.map(cell => cell.row + cell.rowSpan), 1);

// In JSX — rem-based sizing shrinks naturally with root font-size
<div
  className="dashboard-grid"
  style={{
    width: `${gridDimensions.totalWidthRem}rem`,
    height: `${computeGridHeightRem(actualRows)}rem`,
    gridTemplateColumns: `repeat(${gridDimensions.columns}, ${GRID_CELL_SIZE_REM}rem)`,
    gridTemplateRows: `repeat(${actualRows}, ${GRID_CELL_SIZE_REM}rem)`,
    gap: `${GRID_GAP_SIZE_REM}rem`,
    maxHeight: `${computeGridHeightRem(gridDimensions.defaultRows)}rem`,
    overflowY: actualRows > gridDimensions.defaultRows ? "auto" : "hidden",
  }}
>
  {/* widgets */}
</div>
```

**Cache validation** — when loading from localStorage:

```typescript
function isValidGridManifest(data: unknown): data is GridManifest {
  return typeof data === "object" && data !== null && "grids" in data && typeof (data as Record<string, unknown>).grids === "object";
}

// In the load flow:
const cached = localStorage.getItem(`dashboardLayout:${slug}`);
if (cached) {
  try {
    const parsed = JSON.parse(cached);
    if (!isValidGridManifest(parsed)) {
      // Corrupted — discard and fetch fresh
      localStorage.removeItem(`dashboardLayout:${slug}`);
    }
  } catch {
    localStorage.removeItem(`dashboardLayout:${slug}`);
  }
}
```

There is only one canonical manifest format (`{ grids: Record<string, GridCell[]> }`). If cached data doesn't match this shape, it is discarded. The existing `normalizeManifest()` and `DEFAULT_GRID_MANIFEST` fallback behaviors (defined in the livestream-control-system spec) are preserved — this spec does not change them.

**Note:** The inline `style` here is a justified exception per code-style.md — the grid template values are computed from shared constants and cannot be expressed as static CSS classes.

### Widget Renderer Registry

**File:** `packages/frontend/src/components/widgetRenderer.tsx`

Replaces the hardcoded `WidgetPlaceholder` function in `Dashboard.tsx`:

```typescript
import type { ComponentType, ReactNode } from "react";
import type { GridCell } from "../types";
import { WIDGET_TYPE_REGISTRY } from "@invisible-av-booth/shared";
import { ObsWidget } from "./obs/ObsWidget";
import { LowerThirdWidget } from "./lower-thirds/LowerThirdWidget";
import { ObsPreviewWidget } from "./obs-preview/ObsPreviewWidget";
import { CameraWidget } from "./camera/CameraWidget";

/** Maps widget IDs to their React component. */
const WIDGET_COMPONENTS: Record<string, ComponentType> = {
  obs: ObsWidget,
  "lower-thirds": LowerThirdWidget,
  "obs-preview": ObsPreviewWidgetWrapper,
  camera: CameraWidget,
};

export function renderWidget(cell: GridCell): ReactNode {
  const Component = WIDGET_COMPONENTS[cell.widgetId];
  if (Component) return <Component />;

  // Fallback placeholder for unknown widget types
  return (
    <div data-testid={`widget-${cell.widgetId}`} className="surface layout-centered full-height">
      {cell.title}
    </div>
  );
}
```

### Admin Dashboard Management Page

**File:** `packages/frontend/src/pages/AdminDashboardManagement.tsx`

Follows the established admin page pattern:

```
┌──────────────────────────────────────────────────────┐
│ [Dashboard List]        │ [Detail Panel]             │
│                         │                            │
│ + Add Dashboard         │ Name: [________]           │
│                         │ Slug: [________]           │
│ ● Main Dashboard        │ Description: [________]    │
│   /default              │ Allowed Roles: [multi]     │
│                         │                            │
│ ● Camera Only           │ ┌──────────────────────┐  │
│   /camera-only          │ │ Tabs: LL │ SL │ LP │ SP│ │
│                         │ ├──────────────────────┤  │
│                         │ │                      │  │
│                         │ │   Grid Editor        │  │
│                         │ │                      │  │
│                         │ └──────────────────────┘  │
│                         │                            │
│                         │ [Save] [Delete]            │
└──────────────────────────────────────────────────────┘
```

**State management:** All form state is held in local component state (useState). The four grids are stored as:

```typescript
type GridLayouts = Record<GridType, WidgetPlacement[]>;

const [grids, setGrids] = useState<GridLayouts>({
  "large-landscape": [],
  "large-portrait": [],
  "small-landscape": [],
  "small-portrait": [],
});
```

**Dirty check:** Compares current state against the initial state loaded from the API. Uses `JSON.stringify` comparison for grids (simple and effective for small arrays).

### Grid Editor Component

**File:** `packages/frontend/src/components/grid-editor/GridEditor.tsx`

The grid editor renders a scaled-down representation of the grid. Since the actual grid sizes (up to 1396×884px) may not fit in the detail panel, the editor scales down uniformly to fit:

```typescript
interface GridEditorProps {
  gridType: GridType;
  widgets: WidgetPlacement[];
  onWidgetsChange: (widgets: WidgetPlacement[]) => void;
}
```

**Rendering approach:**

- The grid is rendered as a `<div>` with CSS Grid matching the cell/gap layout
- A scale factor is computed to fit the grid within the available panel width
- Grid lines are drawn via `background` repeating linear gradients (subtle border pattern)
- Widgets are absolutely positioned over the grid using `gridColumn`/`gridRow` spans

**Drag implementation:**

- Uses pointer events (`onPointerDown`, `onPointerMove`, `onPointerUp`) for unified mouse/touch handling
- On pointer down on a widget body: enters "move" mode
- On pointer down on a widget resize handle (bottom-right corner): enters "resize" mode
- On pointer move: computes the ghost position based on 35/65 snap logic
- On pointer up: commits the ghost position if valid (no overlap)

**35/65 Snap Logic:**

The snap threshold is: **gap + 35% of the next cell's size** = 0.75rem + (7.25rem × 0.35) = 3.2875rem (52.6px at 16px root) past the current cell's far edge. This is the authoritative definition.

```typescript
/**
 * Compute the snapped cell position for a pointer coordinate.
 *
 * The snap rule: the pointer must travel past the gap (0.75rem) AND 35% into
 * the next cell (7.25rem × 0.35 = 2.5375rem) before snapping forward.
 * Total threshold from current cell's far edge: 3.2875rem (52.6px at 16px root).
 *
 * Note: pointer coordinates are in pixels (from DOM events), so this function
 * works in pixels at runtime. The rem values define the logical threshold;
 * actual pixel threshold = remThreshold × currentRootFontSize.
 */
function computeSnapPosition(
  pointerX: number,
  pointerY: number,
  dragOffsetX: number,
  dragOffsetY: number,
  cellSize: number,
  gapSize: number,
): { col: number; row: number } {
  const effectiveX = pointerX - dragOffsetX;
  const effectiveY = pointerY - dragOffsetY;
  const cellWithGap = cellSize + gapSize;

  // Which cell are we currently in?
  const col = Math.floor(effectiveX / cellWithGap);
  const remainderX = effectiveX - col * cellWithGap;

  // Threshold: gap crossed + 35% into the next cell's area
  const thresholdIntoNext = gapSize + cellSize * 0.35;
  const snappedCol = remainderX >= cellSize + thresholdIntoNext ? col + 1 : col;

  // Same for rows
  const row = Math.floor(effectiveY / cellWithGap);
  const remainderY = effectiveY - row * cellWithGap;
  const snappedRow = remainderY >= cellSize + thresholdIntoNext ? row + 1 : row;

  return { col: Math.max(0, snappedCol), row: Math.max(0, snappedRow) };
}
```

**Overlap detection (frontend — real-time during drag):**

```typescript
function wouldOverlap(
  movingWidget: WidgetPlacement,
  newCol: number,
  newRow: number,
  newColSpan: number,
  newRowSpan: number,
  allWidgets: WidgetPlacement[],
): boolean {
  for (const other of allWidgets) {
    if (other.widgetId === movingWidget.widgetId) continue;
    if (rectanglesOverlap(newCol, newRow, newColSpan, newRowSpan, other.col, other.row, other.colSpan, other.rowSpan)) {
      return true;
    }
  }
  return false;
}

function rectanglesOverlap(
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
```

**Ghost preview rendering:**
During drag/resize, a semi-transparent rectangle shows the target position. If the position is invalid (overlap or out of bounds), the ghost stays at the last valid position. The widget "snaps" visually to the ghost position.

**Widget placement on add:**

```typescript
function findFirstAvailablePosition(widgetId: string, widgets: WidgetPlacement[], gridType: GridType): { col: number; row: number } {
  const definition = WIDGET_TYPE_REGISTRY[widgetId];
  if (!definition) return { col: 0, row: 0 };
  const gridDimensions = GRID_DIMENSIONS[gridType];
  const colSpan = definition.minColSpan;
  const rowSpan = definition.minRowSpan;

  // Scan row by row, column by column for first fit.
  // Rows are unbounded (dynamic) — scan up to current max + rowSpan to find space.
  // This guarantees placement always succeeds (worst case: appended below all existing widgets).
  const maxRow = widgets.length > 0 ? Math.max(...widgets.map((widget) => widget.row + widget.rowSpan)) : 0;
  const searchLimit = maxRow + rowSpan;

  for (let row = 0; row <= searchLimit; row++) {
    for (let col = 0; col <= gridDimensions.columns - colSpan; col++) {
      const candidate = { widgetId, title: definition.displayName, col, row, colSpan, rowSpan, roleMinimum: "AvVolunteer" };
      if (!wouldOverlap(candidate, col, row, colSpan, rowSpan, widgets)) {
        return { col, row };
      }
    }
  }
  // Fallback: place below everything (should never reach here due to searchLimit logic)
  return { col: 0, row: maxRow };
}
```

### Tab Component

The four grid tabs use `IonSegment` with icons:

```typescript
import { tabletLandscapeOutline, phoneLandscapeOutline, tabletPortraitOutline, phonePortraitOutline } from "ionicons/icons";
import { checkmarkDoneCircleOutline, warningOutline } from "ionicons/icons";

interface GridTab {
  gridType: GridType;
  icon: string;
  label: string;
  ariaLabel: string;
}

const GRID_TABS: GridTab[] = [
  { gridType: "large-landscape", icon: tabletLandscapeOutline, label: "Large", ariaLabel: "Large Landscape" },
  { gridType: "small-landscape", icon: phoneLandscapeOutline, label: "Small", ariaLabel: "Small Landscape" },
  { gridType: "large-portrait", icon: tabletPortraitOutline, label: "Large", ariaLabel: "Large Portrait" },
  { gridType: "small-portrait", icon: phonePortraitOutline, label: "Small", ariaLabel: "Small Portrait" },
];
```

Tab status icons appear after the label text:

```tsx
<IonSegmentButton value={tab.gridType} aria-label={tab.ariaLabel}>
  <IonIcon icon={tab.icon} />
  <IonLabel>{tab.label}</IonLabel>
  <IonIcon
    icon={grids[tab.gridType].length > 0 ? checkmarkDoneCircleOutline : warningOutline}
    className={grids[tab.gridType].length > 0 ? "tab-icon-complete" : "tab-icon-warning"}
  />
</IonSegmentButton>
```

### Add/Remove Widget (Synchronized Across Grids)

When the admin adds a widget on any grid tab, it is automatically added to all four grids at once (each grid gets its own position based on available space):

```typescript
function addWidget(widgetId: string): void {
  setGrids((previous) => {
    const updated = { ...previous };
    for (const gridType of GRID_TYPES) {
      // Always succeeds — dynamic rows mean there's always space below existing widgets
      const position = findFirstAvailablePosition(widgetId, updated[gridType], gridType);
      const definition = WIDGET_TYPE_REGISTRY[widgetId]!;
      updated[gridType] = [
        ...updated[gridType],
        {
          widgetId,
          title: definition.displayName,
          col: position.col,
          row: position.row,
          colSpan: definition.minColSpan,
          rowSpan: definition.minRowSpan,
          roleMinimum: "AvVolunteer",
        },
      ];
    }
    return updated;
  });
}
```

**Removing a widget** works the same way — removing from one grid removes from all four. The admin clicks the delete button (×) on a widget in the grid editor, and a confirmation is shown: "Remove {displayName} from all grid layouts?" On confirm, the widget is removed from all four grids simultaneously.

```typescript
function removeWidget(widgetId: string): void {
  setGrids((previous) => {
    const updated = { ...previous };
    for (const gridType of GRID_TYPES) {
      updated[gridType] = updated[gridType].filter((widget) => widget.widgetId !== widgetId);
    }
    return updated;
  });
}
```

**Why synchronize add/remove across all grids:** The backend enforces that all four grids must have the same widget set (requirement 6.6). Rather than letting the admin get into an invalid state and be surprised by a backend validation error on save, the UI proactively maintains consistency. The admin can still position and size each widget independently per grid — only the presence/absence is synchronized.

**Delete button UX:** The delete button (×) appears in the top-right corner of each widget in the grid editor, visible on hover (desktop) or always visible (touch). Tapping it shows a `ConfirmationModal` (same pattern as user/device deletion): title "Remove Widget", body "Remove {displayName} from all four grid layouts?", with "Remove" (danger) and "Cancel" buttons. This prevents accidental removal and makes it clear the action affects all grids.

**Role editor UX:** Adjacent to the delete button (×), an options button (`options-outline` Ionicon) opens an `IonPopover` anchored to the button. The popover contains a single role dropdown (AvVolunteer / AvPowerUser / ADMIN). Changing the selection immediately updates the widget's `roleMinimum` across ALL four grids simultaneously — roleMinimum is per-widget, not per-grid-type. This prevents the confusing scenario where a widget appears/disappears when a volunteer rotates their tablet (which switches grid types). Default is AvVolunteer on add.

### Dynamic Row Behavior (Grid Editor)

The grid editor supports dynamic row count per grid type:

1. **Screen-edge indicator**: A horizontal dotted line is drawn at the default row boundary (e.g., row 7 for large-landscape). This shows the admin where the "fold" is — content below this line requires scrolling on the target device.

2. **Add Row button**: Below the last used row, a half-opacity ghost row is displayed with an "Add Row" button centered in it. Clicking extends the grid by one row and pushes the button down.

3. **Auto-expand on drag**: When a widget is dragged or resized such that `row + rowSpan` exceeds the current row count, the grid auto-expands to accommodate. No explicit "Add Row" click is needed in this case.

4. **Auto-contract on remove**: When a widget is removed or moved upward such that the bottom row(s) become empty (no widget occupies any cell in those rows), the grid automatically contracts — empty trailing rows are removed. The grid never contracts below the default row count (the screen-edge line is always visible).

5. **Scroll in editor**: If the grid exceeds the editor's visible height, the editor scrolls vertically. The grid lines and widgets scroll together.

```typescript
function getActualRowCount(widgets: WidgetPlacement[], defaultRows: number): number {
  if (widgets.length === 0) return defaultRows;
  const maxUsedRow = Math.max(...widgets.map((widget) => widget.row + widget.rowSpan));
  return Math.max(maxUsedRow, defaultRows);
}
```

### Save Flow

```typescript
async function saveDashboard(): Promise<void> {
  setSaving(true);
  try {
    const payload = {
      name,
      slug,
      description,
      allowedRoles: selectedRoles.map((role) => role.value),
      grids,
    };

    const response = isCreating
      ? await fetch("/api/admin/dashboards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/admin/dashboards/${dashboardId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

    if (!response.ok) {
      const error = await response.json();
      setFormError(error.error ?? "Failed to save");
      return;
    }

    const result = await response.json();

    if (result.isComplete) {
      showToast("Dashboard saved successfully.");
    } else {
      showToast("Dashboard saved, but it is incomplete and not visible to users.");
    }

    // Reset dirty state
    setInitialState(currentState());
    refreshList();
  } finally {
    setSaving(false);
  }
}
```

### DashboardSelectionScreen Update

The selection screen now receives and displays `slug` instead of `id`:

```typescript
interface DashboardSummary {
  slug: string;
  name: string;
  description: string;
}

const selectDashboard = (dashboard: DashboardSummary): void => {
  localStorage.setItem(STORAGE_KEY_DASHBOARD_ID, dashboard.slug);
  localStorage.setItem(STORAGE_KEY_DASHBOARD_NAME, dashboard.name);
  navigate(`/dashboard/${dashboard.slug}`);
};
```

### CSS Changes

**File:** `packages/frontend/src/theme/shared.css` (modified)

The `.dashboard-grid` class is simplified — dimensions are now set inline via the grid type constants:

```css
.dashboard-grid {
  display: grid;
  margin: 0 auto;
}
```

Breakpoint constants are defined in `packages/shared/src/gridTypes.ts` as JS constants (`BREAKPOINT_LARGE_LANDSCAPE`, `BREAKPOINT_LARGE_PORTRAIT`) — NOT as CSS custom properties. CSS custom properties cannot be read from JS without `getComputedStyle()` calls, and the breakpoints are only consumed by the `useGridType()` hook (JavaScript).

Grid editor styles:

```css
.grid-editor-container {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: var(--color-bg);
}

.grid-editor-grid {
  display: grid;
  position: relative;
}

.grid-editor-cell-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  /* Subtle grid lines via repeating gradient */
}

.grid-editor-widget {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: grab;
  user-select: none;
  position: relative;
}

.grid-editor-widget:active {
  cursor: grabbing;
}

.grid-editor-widget-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-align: center;
}

.grid-editor-ghost {
  background: var(--color-primary);
  opacity: 0.3;
  border: 2px dashed var(--color-primary);
  border-radius: 0.25rem;
  pointer-events: none;
  position: absolute;
}

.grid-editor-resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 1rem;
  height: 1rem;
  cursor: se-resize;
  background: var(--color-primary);
  border-radius: 0.25rem 0 0.25rem 0;
  opacity: 0.6;
}

.grid-editor-widget-delete {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1.25rem;
  height: 1.25rem;
  border: none;
  background: var(--color-danger);
  border-radius: 50%;
  color: var(--color-text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.grid-editor-widget:hover .grid-editor-widget-delete {
  opacity: 1;
}
```

### Routing Update

**File:** `packages/frontend/src/App.tsx` (modified)

```typescript
// Change:
<Route path="/dashboard/:id" element={<Dashboard />} />
// To:
<Route path="/dashboard/:slug" element={<Dashboard />} />

// Add:
<Route path="/admin/dashboards" element={<AdminDashboardManagement />} />
```

Admin index page adds the dashboard link:

```typescript
const ADMIN_SECTIONS = [
  { label: "Dashboard Management", path: "/admin/dashboards" },
  { label: "User Management", path: "/admin/users" },
  // ... existing entries
];
```

---

## Seed Script Update

**File:** `packages/backend/scripts/seed-dashboard.ts`

Updated to insert the default dashboard with slug `"default"` and widgets for all four grid types. This is the authoritative initial layout — positions are concrete and validated against grid bounds and widget constraints.

```typescript
import { GRID_TYPES, GRID_DIMENSIONS } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";

const DASHBOARD_SLUG = "default";

// Widget placements per grid type — validated to fit within bounds and constraints
const PLACEMENTS: Record<GridType, Array<{ widgetId: string; title: string; col: number; row: number; colSpan: number; rowSpan: number }>> = {
  "large-landscape": [
    // 11 columns, uses 7 rows (fits within default)
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 3, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 6, row: 0, colSpan: 3, rowSpan: 3 },
    { widgetId: "camera", title: "Camera", col: 0, row: 2, colSpan: 6, rowSpan: 5 },
  ],
  "large-portrait": [
    // 7 columns, uses 7 rows (fits within default 11)
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 3, row: 0, colSpan: 4, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 0, row: 2, colSpan: 3, rowSpan: 3 },
    { widgetId: "camera", title: "Camera", col: 3, row: 2, colSpan: 4, rowSpan: 5 },
  ],
  "small-landscape": [
    // 7 columns, uses 4 rows (exceeds default 3 — triggers scroll on phone viewports)
    { widgetId: "camera", title: "Camera", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "obs", title: "OBS", col: 3, row: 0, colSpan: 2, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 5, row: 0, colSpan: 2, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 2, colSpan: 7, rowSpan: 2 },
  ],
  "small-portrait": [
    // 3 columns, uses 8 rows (exceeds default 7 — triggers scroll on phone viewports)
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2 },
    { widgetId: "obs-preview", title: "OBS Preview", col: 0, row: 2, colSpan: 3, rowSpan: 2 },
    { widgetId: "camera", title: "Camera", col: 0, row: 4, colSpan: 3, rowSpan: 2 },
    { widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 6, colSpan: 3, rowSpan: 2 },
  ],
};
```

The seed script test (`seed-dashboard.test.ts`) SHALL verify:

- Dashboard created with slug `"default"` and all four grid types populated
- Each widget placement is within grid bounds for its grid type
- Each widget meets its min/max size constraints from the registry
- Idempotent — second run produces no duplicates
- All four grids contain the same widget set (`obs`, `lower-thirds`, `obs-preview`, `camera`)

---

## URL Constant Updates

**File:** `packages/shared/src/constants/urls.ts`

```typescript
// Updated:
export const URL_ADMIN_DASHBOARDS = "/api/admin/dashboards" as const;
export const URL_ADMIN_DASHBOARD_BY_ID = (id: string): string => `/api/admin/dashboards/${id}`;

// Updated public endpoints — now slug-based:
export const URL_DASHBOARDS = "/api/dashboards" as const;
export const URL_DASHBOARD_LAYOUT = (slug: string): string => `/api/dashboards/${slug}/layout`;
```

---

## Test ID Constants

New constants in `packages/frontend/src/constants/testIds.ts`:

```typescript
export const TEST_ID_ADMIN_DASHBOARDS_PAGE = "admin-dashboards-page";
export const TEST_ID_DASHBOARD_LIST = "dashboard-list";
export const TEST_ID_DASHBOARD_LIST_ITEM = "dashboard-list-item"; // suffixed with -${id}
export const TEST_ID_ADD_DASHBOARD_BUTTON = "add-dashboard-button";
export const TEST_ID_DASHBOARD_FORM_NAME = "dashboard-form-name";
export const TEST_ID_DASHBOARD_FORM_SLUG = "dashboard-form-slug";
export const TEST_ID_DASHBOARD_FORM_DESCRIPTION = "dashboard-form-description";
export const TEST_ID_DASHBOARD_FORM_ROLES = "dashboard-form-roles";
export const TEST_ID_DASHBOARD_FORM_SAVE = "dashboard-form-save";
export const TEST_ID_DASHBOARD_FORM_DELETE = "dashboard-form-delete";
export const TEST_ID_DASHBOARD_FORM_ERROR = "dashboard-form-error";
export const TEST_ID_DASHBOARD_GRID_TAB = "dashboard-grid-tab"; // suffixed with -${gridType}
export const TEST_ID_DASHBOARD_GRID_EDITOR = "dashboard-grid-editor";
export const TEST_ID_GRID_EDITOR_WIDGET = "grid-editor-widget"; // suffixed with -${widgetId}
export const TEST_ID_GRID_EDITOR_GHOST = "grid-editor-ghost";
export const TEST_ID_GRID_EDITOR_ADD_WIDGET = "grid-editor-add-widget";
export const TEST_ID_GRID_EDITOR_WIDGET_DELETE = "grid-editor-widget-delete"; // suffixed with -${widgetId}
export const TEST_ID_DASHBOARD_LIST_DELETE_BUTTON = "dashboard-list-delete-button"; // suffixed with -${id}
export const TEST_ID_DASHBOARD_SLUG_ERROR = "dashboard-slug-error";
```

---

## Integration Test Design

### Backend Tests

**File:** `packages/backend/tests/integration/routes/admin-dashboards.test.ts` (rewritten)

Uses the existing harness pattern. Key test structure:

```typescript
describe("POST /api/admin/dashboards", () => {
  it("creates a dashboard with metadata only (no grids) — returns isComplete: false");
  it("creates a complete dashboard with all four grids — returns isComplete: true");
  it("rejects missing name with 400");
  it("rejects missing slug with 400");
  it("rejects invalid slug format with 400 and descriptive error");
  it("rejects duplicate slug with 409");
  it("rejects duplicate name (case-insensitive) with 409");
});

describe("PUT /api/admin/dashboards/:id", () => {
  it("updates metadata and grids atomically");
  it("rejects overlapping widgets with descriptive error");
  it("rejects widgets exceeding grid bounds with descriptive error");
  it("rejects widgets violating size constraints with descriptive error");
  it("rejects mismatched widget sets across grids with array of descriptive errors");
  it("saves incomplete dashboard (some grids empty) with isComplete: false");
  it("returns 404 for unknown id");
});

describe("GET /api/admin/dashboards", () => {
  it("returns all dashboards with isComplete status, ordered by creation time");
});

describe("GET /api/admin/dashboards/:id", () => {
  it("returns full dashboard detail with all four grid layouts");
});

describe("DELETE /api/admin/dashboards/:id", () => {
  it("deletes dashboard and all widget configurations (CASCADE)");
  it("returns 404 for unknown id");
});

describe("GET /api/dashboards (public)", () => {
  it("admin sees all dashboards including incomplete");
  it("non-admin only sees complete dashboards with matching roles");
});

describe("GET /api/dashboards/:slug/layout", () => {
  it("returns all four grid layouts for a complete dashboard");
  it("returns 404 for unknown slug");
  it("returns 403 when user role is not in allowedRoles");
  it("filters cells by roleMinimum for non-admin users");
});
```

### Frontend Tests (Playwright)

**File:** `packages/frontend/playwright/e2e/admin-dashboards.spec.ts`

```typescript
test.describe("Admin Dashboard Management", () => {
  test("unsaved changes warning on navigation");
  test("tab navigation between all four grid types");
  test("tab switching preserves widget placements");
  test("partial save shows incomplete modal");
  test("tab icons reflect completeness state");
  test("loading existing dashboard populates all fields and grids");
  test("full save shows success modal without warning");
  test("adding a widget places it on all four grids");
  test("removing a widget removes from all four grids");
  test("widget can be dragged to new position");
  test("widget respects size constraints during resize");
  test("widgets cannot overlap");
  test("35/65 snap rule on drag");
  test("multi-cell move (1,1 → 5,3)");
  test("multi-cell resize (1×1 → 3×3)");
});
```

---

## File Summary

### New Files

| Path                                                               | Purpose                                                    |
| ------------------------------------------------------------------ | ---------------------------------------------------------- |
| `packages/shared/src/widgetTypeRegistry.ts`                        | Widget type definitions and size constraints               |
| `packages/shared/src/gridTypes.ts`                                 | Grid type constants and dimensions                         |
| `packages/backend/src/validation/dashboardValidation.ts`           | Slug, overlap, bounds, constraint validation               |
| `packages/backend/src/validation/dashboardValidation.test.ts`      | Unit tests for validation logic                            |
| `packages/frontend/src/pages/AdminDashboardManagement.tsx`         | Admin dashboard management page                            |
| `packages/frontend/src/pages/AdminDashboardManagement.test.tsx`    | Unit tests for admin page                                  |
| `packages/frontend/src/components/grid-editor/GridEditor.tsx`      | Visual grid editor component                               |
| `packages/frontend/src/components/grid-editor/GridEditor.test.tsx` | Unit tests for grid editor                                 |
| `packages/frontend/src/components/grid-editor/snapLogic.ts`        | 35/65 snap computation and overlap detection               |
| `packages/frontend/src/components/grid-editor/snapLogic.test.ts`   | Unit tests for snap logic (property-based with fast-check) |
| `packages/frontend/src/components/widgetRenderer.tsx`              | Widget ID → React component lookup                         |
| `packages/frontend/playwright/e2e/admin-dashboards.spec.ts`        | Playwright e2e for dashboard management                    |

### Modified Files

| Path                                                                 | Change                                                                         |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/shared/src/index.ts`                                       | Export new modules                                                             |
| `packages/shared/src/types.ts`                                       | GridManifest with four-grid `grids` field                                      |
| `packages/shared/src/constants/urls.ts`                              | Updated URL constants (slug-based)                                             |
| `packages/backend/src/database/schema.ts`                            | Add slug column, gridType column, migration                                    |
| `packages/backend/src/routes/adminDashboardRoutes.ts`                | Rewritten for new schema + validation                                          |
| `packages/backend/src/routes/dashboardRoutes.ts`                     | Slug-based lookup, returns all four grids                                      |
| `packages/backend/src/app.ts`                                        | No structural change (routes already registered)                               |
| `packages/backend/scripts/seed-dashboard.ts`                         | Updated for new schema (all four grids)                                        |
| `packages/backend/scripts/seed-dashboard.test.ts`                    | Updated for new schema                                                         |
| `packages/backend/tests/integration/routes/admin-dashboards.test.ts` | Rewritten for new API                                                          |
| `packages/backend/tests/integration/harness.ts`                      | No change (tables already listed)                                              |
| `packages/frontend/src/App.tsx`                                      | Route `:id` → `:slug`, add admin dashboards route                              |
| `packages/frontend/src/pages/Dashboard.tsx`                          | Four-grid auto-selection, uses widgetRenderer                                  |
| `packages/frontend/src/pages/Dashboard.test.tsx`                     | Updated for new grid format                                                    |
| `packages/frontend/src/pages/DashboardSelectionScreen.tsx`           | Uses slug in navigation                                                        |
| `packages/frontend/src/pages/AdminIndexPage.tsx`                     | Add dashboard management link                                                  |
| `packages/frontend/src/constants/testIds.ts`                         | New test ID constants                                                          |
| `packages/frontend/src/constants/storageKeys.ts`                     | Key uses slug                                                                  |
| `packages/frontend/src/theme/shared.css`                             | Updated grid styles, new editor styles                                         |
| `packages/frontend/src/theme/variables.css`                          | No breakpoint-related changes (breakpoints are JS constants in shared package) |
| `packages/frontend/playwright/fixtures/payloads/session.ts`          | Updated for four-grid manifest                                                 |
| `packages/frontend/playwright/support/routes/obs.ts`                 | Updated dashboard mock                                                         |
