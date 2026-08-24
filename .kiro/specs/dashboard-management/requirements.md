# Requirements Document — Dashboard Management

## Introduction

This spec adds admin-facing UI for managing dashboards — currently dashboards are created via a startup seed script or manual SQLite manipulation. Administrators need to create, edit, and delete dashboards through the existing admin panel, configure widget placement via a visual grid editor with drag-and-drop, and manage four independent grid layouts per dashboard (large landscape, large portrait, small landscape, small portrait). The grid system is redesigned to use a fixed 7.25rem (116px) cell size across all four grid types, with dynamic row counts (grids grow vertically as widgets are placed) and viewport-aware scaling (root font-size reduction to fit smaller viewports without scrolling).

This spec depends on the existing dashboard rendering infrastructure (`Dashboard.tsx`, `DashboardSelectionScreen.tsx`, `adminDashboardRoutes.ts`, `dashboardRoutes.ts`) and the admin page patterns established in user, device, template, and platform management pages.

---

## Glossary

- **Grid Type**: One of four layout configurations per dashboard: `large-landscape` (11 columns), `large-portrait` (7 columns), `small-landscape` (7 columns), `small-portrait` (3 columns). Each grid type has a fixed column count but dynamic row count — rows are added as widgets are placed. Each grid type has independently placed widgets.
- **Cell**: A single 7.25rem × 7.25rem (116×116px at 16px root) square unit in the grid. Widgets occupy one or more cells.
- **Default Row Count**: The initial number of rows shown for each grid type in the editor. This represents the number of rows visible without scrolling at the grid's native resolution: `large-landscape` = 7, `large-portrait` = 11, `small-landscape` = 3, `small-portrait` = 7. Rows beyond this are accessible via scrolling.
- **Slug**: A URL-safe identifier for a dashboard (lowercase alphanumeric + hyphens). Used in the URL path `/dashboard/:slug`. Globally unique, independent of the display name.
- **Widget Type Registry**: A shared registry (`packages/shared`) mapping widget IDs to display names and size constraints (min/max col/row spans). Used by both frontend (grid editor, dashboard renderer) and backend (validation).
- **Snap Threshold (35/65 Rule)**: During drag/resize, a widget snaps to the next grid cell once the pointer passes the gap PLUS 35% into the next cell's own area. Precisely: the threshold distance from the current cell's far edge is `gapSize + (cellSize × 0.35)` = 12 + 40.6 = 52.6px. Below this threshold, the widget stays in its current position. At or above, it snaps forward. This prevents frustrating "almost moved" interactions during imprecise touch input.
- **Ghost Preview**: The semi-transparent outline showing where a widget will land during drag/resize. If the ghost position would cause an overlap, it does not advance — the ghost stays at the last valid position.
- **Viewport Scaling**: When the viewport is smaller than the grid's native pixel dimensions, the entire page is uniformly scaled down via a CSS custom property (`--dashboard-scale-font-size`) consumed by an `html:has(.dashboard-page)` rule. This changes the effective root font-size (e.g., from 16px to 12px for a 0.75 scale factor). Since all sizing in the system uses `rem`, everything shrinks proportionally — title bar, widgets, text, spacing, touch targets. The `:has()` selector ensures scaling only applies when a dashboard is mounted — admin pages are never affected. Scaling is never applied upward (font-size never exceeds 16px).
- **Incomplete Dashboard**: A dashboard that is missing required data (name, slug, at least one allowed role, or widgets on all four grid types). Incomplete dashboards can be saved but are not visible to non-admin users.

---

## Requirements

### Requirement 1: Widget Type Registry (Shared)

**User Story:** As a developer, I want a single registry of all widget types with their display names and size constraints, so that both frontend and backend share a consistent source of truth.

#### Acceptance Criteria

1. THE `packages/shared` module SHALL export a `WIDGET_TYPE_REGISTRY` constant that maps each widget ID to its metadata: `displayName` (string), `minColSpan` (number), `maxColSpan` (number | null for unconstrained), `minRowSpan` (number), `maxRowSpan` (number | null for unconstrained).

2. THE registry SHALL include entries for all existing widget types: `obs`, `lower-thirds`, `obs-preview`, `camera`. Future widget types are added by adding an entry to this registry.

3. THE backend SHALL use the registry to validate widget size constraints on save — rejecting placements that violate min/max spans with a descriptive error message (e.g., "Widget 'OBS' cannot be smaller than 2×2" or "Widget 'Camera' cannot exceed 8 columns").

4. THE frontend grid editor SHALL use the registry to: (a) populate the "add widget" list with available widget types, (b) enforce size constraints during drag-resize operations, (c) display the widget's `displayName` as a label inside placed widgets.

5. THE frontend `Dashboard.tsx` renderer SHALL use the registry to resolve widget IDs to their React components, replacing the current hardcoded `if/else` chain. A widget ID not found in the registry SHALL render a placeholder with the widget's title.

---

### Requirement 2: Grid System Redesign

**User Story:** As a system, I need four grid configurations per dashboard with fixed 7.25rem (116px) cell sizes and dynamic row counts, so that dashboards render consistently across large tablets, small tablets, and both orientations — scaling down for smaller viewports without ever requiring scroll.

#### Acceptance Criteria

1. THE system SHALL support four grid types per dashboard, each with a fixed 7.25rem × 7.25rem (116×116px at 16px root) cell size and 0.75rem (12px) gap (`--space-grid-gap`). Each grid type has a fixed column count and a dynamic row count (rows grow as widgets are placed):

   | Grid Type         | Columns | Default Rows | Base Width        | Base Height (at default rows) |
   | ----------------- | ------- | ------------ | ----------------- | ----------------------------- |
   | `large-landscape` | 11      | 7            | 87.25rem (1396px) | 55.25rem (884px)              |
   | `large-portrait`  | 7       | 11           | 55.25rem (884px)  | 87.25rem (1396px)             |
   | `small-landscape` | 7       | 3            | 55.25rem (884px)  | 23.25rem (372px)              |
   | `small-portrait`  | 3       | 7            | 23.25rem (372px)  | 55.25rem (884px)              |

   The "Default Rows" represent the number of rows that fit on screen at native resolution (16px root). Grids CAN have more rows than this — widgets placed below the default row count create additional rows. The grid height is always `(actualRows × 7.25rem) + ((actualRows - 1) × 0.75rem)` where `actualRows` is the highest `row + rowSpan` of any widget on that grid.

2. THE frontend SHALL automatically select the appropriate grid type based on viewport dimensions and orientation:
   - **Size determination:** If viewport width ≥ 1200px AND viewport height ≥ 700px → large; otherwise → small. Both dimensions must meet the threshold.
   - **Orientation determination:** If viewport width > viewport height → landscape; otherwise → portrait.
   - The breakpoints SHALL be defined as constants in `packages/shared` (`BREAKPOINT_LARGE_WIDTH: 1200`, `BREAKPOINT_LARGE_HEIGHT: 700`) for easy adjustment.

3. THE frontend SHALL seamlessly switch between grid types on viewport resize or orientation change without requiring a page refresh. The layout SHALL transition immediately when the viewport crosses a breakpoint.

4. WHEN the viewport is larger than the grid's computed dimensions, THE grid SHALL be centered horizontally via `margin: 0 auto`. THE grid SHALL NEVER scale up beyond its native pixel dimensions.

5. WHEN the viewport is smaller than the grid's base dimensions (computed from default rows), THE frontend SHALL uniformly scale the entire page by setting a CSS custom property `--dashboard-scale-font-size` on the `<html>` element, which is consumed by a CSS rule `html:has(.dashboard-page) { font-size: var(--dashboard-scale-font-size, 16px); }`. The scale factor is `min(viewportWidth / gridNativeWidth, viewportHeight / gridNativeHeight, 1.0)` where native dimensions are computed at 16px root from default rows. The `:has(.dashboard-page)` selector ensures scaling ONLY applies when the dashboard component is mounted — navigating to admin pages (no `.dashboard-page` in DOM) causes the rule to stop matching and `html` falls back to 16px automatically. No explicit cleanup is required, though the hook removes the property on unmount as a safety measure. THE scale factor SHALL NOT drop below `MIN_SCALE_FLOOR` (0.65) — if the computed factor would be lower, it is clamped to 0.65 and the grid is allowed to overflow the viewport (scroll). This floor ensures touch targets remain usable (2.75rem at 10.4px root = 28.6px minimum). Pinch-to-zoom is NOT blocked (viewport meta tag does not set `maximum-scale` or `user-scalable=no`), so volunteers can zoom in if needed. Scaling is based on the DEFAULT row count, NOT actual content height — extra rows beyond the default simply scroll within the grid container.

6. THE public dashboard layout API (`GET /api/dashboards/:slug/layout`) SHALL return all four grid layouts in a single response so the frontend can switch seamlessly without additional network requests.

7. THE existing `Dashboard.tsx` grid styling SHALL be updated to use the new dimensions instead of the current fixed 1400×900px / 10×6 grid.

8. WHEN loading a cached grid manifest from localStorage, IF the cached data does not have the expected shape (no `grids` record, or not an object), THE frontend SHALL treat it as invalid, clear it from localStorage, and fetch fresh from the API. No version field is needed — shape validation is sufficient since there are no production deployments on the old format.

9. THE dashboard renderer SHALL only render rows that contain widgets. If a grid has widgets occupying rows 0–4 but the grid type has a default of 7 rows, only rows 0–4 are rendered (height = 5 rows). If widgets extend beyond the default row count (e.g., row 8 on a grid with default 7), the grid scrolls vertically — the viewport-fit scaling is based on default rows, so extra rows naturally overflow into scrollable area.

---

### Requirement 3: Database Schema Changes

**User Story:** As a system, I need the database schema to support four grid types per dashboard and slug-based identification, so that the admin can manage layouts and users access dashboards via clean URLs.

#### Acceptance Criteria

1. THE `dashboards` table SHALL be extended with a `slug` column: `TEXT NOT NULL UNIQUE`, lowercase alphanumeric and hyphens only. This becomes the URL identifier.

2. THE `widget_configurations` table SHALL be extended with a `gridType` column: `TEXT NOT NULL CHECK(gridType IN ('large-landscape', 'large-portrait', 'small-landscape', 'small-portrait'))`.

3. THE `UNIQUE(dashboardId, widgetId)` constraint SHALL change to `UNIQUE(dashboardId, widgetId, gridType)` — each widget can appear once per grid type per dashboard.

4. THE public dashboard routes SHALL use the slug for lookup (e.g., `/api/dashboards/:slug/layout`) instead of the internal ID. The admin routes SHALL continue to use the internal ID for CRUD operations.

5. THE `seed-dashboard.ts` script and its test file SHALL be updated to use the new schema, inserting widget configurations for all four grid types.

6. A schema migration SHALL handle the transition from the old schema to the new one. Since the steering doc permits breaking the old format, this can be a destructive migration (drop and recreate) if simpler.

---

### Requirement 4: Admin Dashboard Management Page

**User Story:** As an admin, I want to create, edit, and delete dashboards through the admin UI, so that I don't need direct database access.

#### Acceptance Criteria

1. THE admin dashboard management page SHALL follow the existing admin page pattern: left column with a list of dashboards and an "Add Dashboard" button, right panel with the detail/edit form.

2. THE dashboard list SHALL display each dashboard's name and slug. Clicking a dashboard SHALL open its detail in the right panel.

3. THE detail panel SHALL contain:
   - **Name** field (text input)
   - **Slug** field (text input, validated: lowercase alphanumeric + hyphens, no leading/trailing hyphens, no consecutive hyphens, max 64 characters)
   - **Description** field (text input)
   - **Allowed Roles** field (multi-select dropdown using `react-select` with `isMulti`, options: ADMIN, AV Power User, AV Volunteer)
   - **Grid layout tabs** (see Requirement 5)
   - **Save** button
   - **Delete** button (with confirmation modal)

4. THE page SHALL implement the unsaved-changes guard pattern: if the admin has unsaved changes and clicks a different dashboard in the list, a confirmation modal SHALL warn about losing changes before navigating away.

5. THE slug field SHALL validate in real-time (on change) with inline error messages for invalid formats. Uniqueness SHALL be validated on save (server-side).

6. WHEN saving a dashboard that is incomplete (missing widgets on any of the four grid types, missing allowed roles, or missing name/slug), THE backend SHALL save successfully but return a flag indicating the dashboard is incomplete. THE frontend SHALL display a toast notification after save saying "Dashboard saved, but it is incomplete and not visible to users."

7. WHEN saving a complete dashboard, THE frontend SHALL display a toast notification saying "Dashboard saved successfully."

8. THE page SHALL be accessible at `/admin/dashboards` and linked from the admin index page.

9. A conflicting slug (duplicate) SHALL be rejected by the backend with a clear error message, and the frontend SHALL display the error inline on the slug field.

---

### Requirement 5: Grid Layout Editor (Tabs)

**User Story:** As an admin, I want a tabbed visual grid editor to place, move, and resize widgets on each of the four grid types independently.

#### Acceptance Criteria

1. THE detail panel SHALL include four tabs for the grid types, using `IonSegment`/`IonSegmentButton` (Ionic tabs pattern) with the following icons and labels:
   - `tablet-landscape-outline` + "Large" (aria-label: "Large Landscape")
   - `phone-landscape-outline` + "Small" (aria-label: "Small Landscape")
   - `tablet-portrait-outline` + "Large" (aria-label: "Large Portrait")
   - `phone-portrait-outline` + "Small" (aria-label: "Small Portrait")

2. EACH tab SHALL display an icon AFTER the label text indicating completeness:
   - `checkmark-done-circle` (or similar success icon) — when the grid has at least one widget placed
   - `warning-outline` (warning icon) — when the grid has zero widgets placed
     These icons SHALL update in real-time as the admin adds/removes widgets.

3. THE grid editor SHALL render a non-functional visual representation of the grid (not a live dashboard). Grid lines SHALL be clearly drawn. Placed widgets SHALL appear as labeled rectangles showing their `displayName` from the widget type registry centered in the rectangle. At the bottom of each widget rectangle, small muted text SHALL display the widget's role minimum and current size in the format `{roleMinimum} | {colSpan}×{rowSpan}` (e.g., "AvVolunteer | 2×3"). This text is informational only — not interactive.

4. SWITCHING between tabs SHALL NOT lose unsaved widget placements on other tabs. All four grid layouts are held in memory until the admin saves the entire dashboard.

5. THE grid editor SHALL provide an "Add Widget" control that presents a list of available widget types (from the registry). Widget types already placed on the current grid SHALL be disabled/greyed out in the list (enforcing the uniqueness constraint per grid type).

6. WHEN a widget is added, it SHALL be placed at the first available position that fits its minimum size, or at 0,0 if the grid is empty.

7. ALL four grids MUST contain the same set of widget types. If a widget is added to one grid, it SHALL be automatically added to the other three grids (at their respective first available positions). If a widget is removed from one grid, it SHALL be removed from all four grids.

8. THE admin SHALL be able to drag widgets to reposition them within the grid, and resize widgets by dragging their edges/corners.

9. THE 35/65 snap rule SHALL apply to both move and resize operations. The snap threshold is defined as: the pointer must travel past the gap (12px) AND 35% into the next cell (40.6px) before snapping — a total of 52.6px past the current cell's far edge. Below this threshold, the widget stays in its current position/size. At or above, it snaps to include the next cell. This applies per-cell — dragging across multiple cells requires passing the threshold for each successive cell.

10. WIDGETS SHALL NOT be allowed to overlap. If a drag/resize operation would cause the ghost preview to overlap another widget, the ghost SHALL NOT advance to that position — it remains at the last valid non-overlapping position. When the user releases, the widget lands at the ghost's final position.

11. WIDGETS SHALL respect size constraints from the registry. Resize operations SHALL NOT shrink a widget below its minimum span or grow it beyond its maximum span (in either dimension). If a dimension is unconstrained (null), there is no limit in that direction (other than grid bounds).

12. WIDGETS SHALL NOT exceed grid column boundaries. A widget cannot be placed or resized such that `col + colSpan > gridColumns`. Row boundaries are dynamic — placing a widget below the current row count automatically extends the grid (see criterion 15).

13. A widget SHALL be removable via a delete button (×) in the top-right corner of its representation in the grid editor. Adjacent to the delete button, an options button (`options-outline` icon) SHALL open an `IonPopover` containing a role minimum dropdown (options: AvVolunteer, AvPowerUser, ADMIN, defaulting to AvVolunteer). Changing the role minimum applies to that widget on ALL four grids simultaneously (roleMinimum is per-widget, not per-grid-type — this prevents widgets from appearing/disappearing when the volunteer's device rotates and switches grid types). Clicking the delete button SHALL display a `ConfirmationModal` (same pattern as user/device deletion) with title "Remove Widget", body "Remove {displayName} from all four grid layouts?", and "Remove" (danger) / "Cancel" buttons. On confirm, the widget is removed from all four grids simultaneously (per criterion 7). The add-widget list SHALL re-enable the removed widget type.

14. MULTI-CELL moves and resizes SHALL be supported. A 1×1 widget can be resized directly to 3×3 in a single drag operation. A widget at position (1,1) can be dragged directly to (5,3) in a single operation.

15. THE grid editor SHALL support dynamic row count. The editor SHALL display a horizontal dotted line at the default row boundary (the "screen edge" indicator showing where the viewport ends at native resolution). Below the last used row, the editor SHALL display a half-opacity ghost row with an "Add Row" button. Clicking "Add Row" extends the grid by one row, pushing the button down. Widgets can also be dragged or resized below the current row count, which auto-expands the grid. The grid auto-contracts when a widget is removed or moved such that the bottom row(s) become empty — unused trailing rows are removed automatically.

---

### Requirement 6: Backend Validation and API

**User Story:** As a system, I need the backend to validate all dashboard data including slug format, widget constraints, overlap detection, and grid bounds, so that invalid data cannot be persisted.

#### Acceptance Criteria

1. THE backend SHALL validate the slug format on create and update: lowercase letters, digits, and hyphens only; no leading/trailing hyphens; no consecutive hyphens; 1-64 characters. Invalid slugs SHALL return 400 with a descriptive error.

2. THE backend SHALL enforce slug uniqueness. A duplicate slug SHALL return 409 with error message "A dashboard with slug '{slug}' already exists."

3. THE backend SHALL validate that no two widgets overlap on the same grid type within a dashboard. Overlap is defined as any cell occupied by more than one widget. On violation, return 400 with error message "Widget '{widgetId}' overlaps with widget '{otherWidgetId}' on grid '{gridType}'."

4. THE backend SHALL validate widget size constraints against the shared registry. Violations return 400 with a descriptive message: "Widget '{displayName}' cannot be smaller than {minCol}×{minRow}" or "Widget '{displayName}' cannot exceed {maxCol} columns" (etc.).

5. THE backend SHALL validate grid column bounds. A widget exceeding the grid column boundary returns 400: "Widget '{displayName}' exceeds grid bounds on '{gridType}' (col {col} + colSpan {colSpan} > {maxCols})." Row bounds are NOT validated — grids have dynamic row counts.

6. THE backend SHALL validate that all four grids contain the same set of widget IDs. If the sets differ, return 400 with an array of error messages, one per affected grid type: "Missing from '{gridType}': {widgetIds}." Multiple grids may be affected simultaneously and all violations SHALL be reported in a single response.

7. THE backend SHALL determine dashboard completeness: a dashboard is complete when it has a non-empty name, a valid slug, at least one allowed role, and at least one widget placed on all four grid types (with all grids containing the same widget set). The response SHALL include an `isComplete` boolean field.

8. THE public dashboard list endpoint (`GET /api/dashboards`) SHALL only return complete dashboards to non-admin users. Admin users SHALL see all dashboards (with `isComplete` indicated).

9. THE admin save endpoint SHALL accept the full dashboard payload in a single request: metadata (name, slug, description, allowedRoles) plus all four grid layouts. This is an atomic save — either all data persists or none does (wrapped in a transaction).

10. THE name uniqueness SHALL be case-insensitive. "Main Dashboard" and "main dashboard" are considered duplicates. Return 409: "A dashboard with this name already exists."

---

### Requirement 7: Dashboard Rendering Updates

**User Story:** As a volunteer, I want the dashboard to automatically show the correct layout for my device size and orientation, so that it always looks right without manual configuration.

#### Acceptance Criteria

1. THE frontend dashboard page SHALL fetch all four grid layouts in a single API call and select the appropriate one based on current viewport dimensions and orientation.

2. THE frontend SHALL re-evaluate the grid type on viewport resize and orientation change, switching layouts seamlessly without a page refresh.

3. THE dashboard URL SHALL use the slug: `/dashboard/:slug` (replacing the current `:id` parameter). The `DashboardSelectionScreen` SHALL navigate to `/dashboard/{slug}`.

4. IF a dashboard is updated by an admin while a volunteer is viewing it, THE volunteer's view SHALL NOT auto-update. A page refresh is required to see changes.

5. THE localStorage cache key for dashboard layouts SHALL use the slug (e.g., `dashboardLayout:{slug}`).

---

## Integration Tests

### Backend Integration Tests

#### Dashboard CRUD and Validation

1. **Slug validation** — THE test SHALL verify that slugs with uppercase letters, spaces, special characters, leading/trailing hyphens, consecutive hyphens, empty strings, and strings exceeding 64 characters are all rejected with 400 and appropriate error messages.

2. **Slug uniqueness** — THE test SHALL verify that creating or updating a dashboard with a duplicate slug returns 409 with error "A dashboard with slug '{slug}' already exists."

3. **Name uniqueness (case-insensitive)** — THE test SHALL verify that "Main Dashboard" and "main dashboard" conflict, returning 409.

4. **Payload persistence** — Given a complete dashboard payload with all four grid layouts, THE test SHALL verify all data is correctly stored and retrievable.

5. **Overlap detection** — THE test SHALL verify that saving a layout with overlapping widgets returns 400 with a message identifying both conflicting widgets and the grid type.

6. **Widget size constraint validation** — THE test SHALL verify that widgets violating min/max size constraints are rejected with descriptive errors naming the widget and its constraint.

7. **Grid column bounds validation** — THE test SHALL verify that a widget exceeding grid column bounds is rejected with a message showing the violation (e.g., col + colSpan > maxCols). Row placement SHALL NOT be rejected regardless of how many rows are used (dynamic rows).

8. **Same widgets on all grids** — THE test SHALL verify that if grid layouts have different widget sets, the save is rejected with 400 returning an array of errors identifying the missing widgets per affected grid type.

9. **Incomplete dashboard save** — THE test SHALL verify that a dashboard missing widgets on some grids saves successfully with `isComplete: false`.

10. **Complete dashboard save** — THE test SHALL verify that a fully valid dashboard saves with `isComplete: true`.

11. **Incomplete dashboards hidden from non-admins** — THE test SHALL verify that `GET /api/dashboards` for a non-admin role excludes incomplete dashboards, while admin sees all.

12. **Admin list returns all dashboards** — THE test SHALL verify that `GET /api/admin/dashboards` returns all dashboards (complete and incomplete) with their `isComplete` status, ordered by creation time.

13. **Retrieve all four layouts** — THE test SHALL verify that `GET /api/dashboards/:slug/layout` returns all four grid types in a single response with correct widget positions.

14. **Delete dashboard** — THE test SHALL verify that deleting a dashboard removes all associated widget configurations across all grid types (CASCADE).

### Frontend Integration Tests (Playwright)

1. **Unsaved changes warning** — THE test SHALL verify that navigating away from an unsaved dashboard triggers a confirmation modal.

2. **Tab navigation** — THE test SHALL verify that all four grid tabs are navigable and display the correct grid dimensions.

3. **Tab switching preserves data** — THE test SHALL verify that placing widgets on one tab, switching to another, and switching back preserves the first tab's layout.

4. **Partial save with warning** — THE test SHALL verify that saving an incomplete dashboard succeeds, sends the correct payload to the backend, and displays the "incomplete" toast.

5. **Tab completeness icons** — THE test SHALL verify that tabs show warning icons when their grid is empty and checkmark icons when widgets are placed.

6. **Loading existing dashboard** — THE test SHALL verify that clicking an existing dashboard in the list correctly populates all fields and all four tab layouts.

7. **Full save without warning** — THE test SHALL verify that saving a complete dashboard sends the correct payload and displays the success toast without an incomplete warning.

8. **Widget add** — THE test SHALL verify that adding a widget places it on all four grids and disables it in the add-widget list for each grid.

9. **Widget remove** — THE test SHALL verify that removing a widget removes it from all four grids and re-enables it in the add-widget list.

10. **Widget move** — THE test SHALL verify that dragging a widget repositions it within the grid and the new position is reflected in the save payload.

11. **Widget resize with constraints** — THE test SHALL verify that resizing a widget respects min/max constraints from the registry (cannot shrink below min, cannot grow beyond max).

12. **Widget overlap prevention** — THE test SHALL verify that dragging a widget to overlap another results in the ghost stopping at the last valid position.

13. **35/65 snap rule** — THE test SHALL verify that a drag below 35% into the next cell does not snap, and at/above 35% does snap.

14. **Multi-cell move/resize** — THE test SHALL verify that a widget can be moved from (1,1) to (5,3) and resized from 1×1 to 3×3 in a single drag operation.

15. **Same widgets on all grids enforced in UI** — THE test SHALL verify that adding a widget to one grid automatically adds it to the other three grids.

16. **Viewport scaling (no scroll)** — THE test SHALL verify that given a viewport smaller than the grid's native dimensions, the dashboard grid container is scaled down such that no horizontal or vertical scrollbar appears, and the grid's rendered size is less than or equal to the available viewport area (viewport height minus title bar height).

17. **Dynamic row rendering** — THE test SHALL verify that the dashboard renderer only renders rows that contain widgets (no dead space below the last widget row).

18. **Grid editor dynamic rows** — THE test SHALL verify that dragging a widget below the last row auto-expands the grid, and removing all widgets from the last row auto-contracts it.

19. **Widget role editing** — THE test SHALL verify that clicking the options button on a placed widget opens a popover with a role dropdown, and changing the role is reflected in the save payload.

---

## Technical Notes

### Grid Dimensions Summary

All grid types use 7.25rem × 7.25rem (116×116px at 16px root) cells with 0.75rem (12px) gaps. Column count is fixed per grid type; row count is dynamic (grows with content). The "default rows" represent how many rows fit on screen at native resolution without scrolling:

| Grid Type         | Columns | Default Rows | Base Width                            | Base Height (at default rows)         |
| ----------------- | ------- | ------------ | ------------------------------------- | ------------------------------------- |
| `large-landscape` | 11      | 7            | 11×7.25 + 10×0.75 = 87.25rem (1396px) | 7×7.25 + 6×0.75 = 55.25rem (884px)    |
| `large-portrait`  | 7       | 11           | 7×7.25 + 6×0.75 = 55.25rem (884px)    | 11×7.25 + 10×0.75 = 87.25rem (1396px) |
| `small-landscape` | 7       | 3            | 7×7.25 + 6×0.75 = 55.25rem (884px)    | 3×7.25 + 2×0.75 = 23.25rem (372px)    |
| `small-portrait`  | 3       | 7            | 3×7.25 + 2×0.75 = 23.25rem (372px)    | 7×7.25 + 6×0.75 = 55.25rem (884px)    |

Rendered grid height = `(actualRows × 7.25rem) + ((actualRows - 1) × 0.75rem)` where `actualRows = max(row + rowSpan)` across all widgets on that grid.

### Viewport Scaling

When the viewport is smaller than the grid's native dimensions (at 16px root), the page scales uniformly via a CSS custom property and `:has()` selector:

```css
/* In variables.css — only applies when a dashboard page is mounted */
html:has(.dashboard-page) {
  font-size: var(--dashboard-scale-font-size, 16px);
}
```

```typescript
// In the useGridScale hook — sets the CSS variable on <html>
const gridDimensions = GRID_DIMENSIONS[gridType];
const nativeWidth = gridDimensions.totalWidthRem * 16;
const nativeHeight = computeGridHeightRem(gridDimensions.defaultRows) * 16;

const factor = Math.min(
  viewportWidth / nativeWidth,
  viewportHeight / nativeHeight,
  1.0, // never scale up
);
const clampedFactor = Math.max(factor, 0.65); // MIN_SCALE_FLOOR

document.documentElement.style.setProperty("--dashboard-scale-font-size", `${16 * clampedFactor}px`);
```

The CSS `:has(.dashboard-page)` selector ensures scaling ONLY applies when the dashboard component is mounted. When the user navigates to admin pages (no `.dashboard-page` element in the DOM), the `:has()` rule doesn't match and `html` falls back to its default `font-size: 16px` from variables.css. No explicit cleanup is needed on unmount — the CSS cascade handles it automatically.

On unmount, the hook removes the custom property as a safety measure: `document.documentElement.style.removeProperty("--dashboard-scale-font-size")`. But even if this fails (crash, unmount race), the `:has()` rule stops matching and the page returns to normal.

This ensures:

- The entire page scales uniformly when on a dashboard (title bar, widgets, text, spacing)
- No horizontal or vertical scroll for the base grid area on any viewport size (above the MIN_SCALE_FLOOR)
- Below MIN_SCALE_FLOOR (0.65), the grid is allowed to scroll rather than shrinking further
- Touch targets remain usable: 2.75rem × 10.4px (at 0.65) = 28.6px minimum
- Admin pages are NEVER affected (`:has(.dashboard-page)` doesn't match)
- No risk of stale font-size if cleanup fails
- Fallback: if `:has()` causes issues with older browsers, pivot to direct `document.documentElement.style.fontSize` with cleanup on unmount (~5-line change)

### Snap Threshold (35/65 Rule) — Precise Definition

The snap threshold for drag/resize is: **gap + 35% of the next cell's size**.

At 7.25rem (116px) cells and 0.75rem (12px) gaps:

- Threshold = 0.75rem (gap) + 7.25rem × 0.35 (35% of cell) = 3.2875rem (52.6px at 16px root) past the current cell's far edge.
- This means the pointer must travel 3.29rem beyond the trailing edge of the current cell before snapping to include the next cell.
- Below this threshold: the widget stays at its current position/size.
- At or above: the widget snaps forward to include the next cell.

This threshold was chosen because it's far enough into the next cell's territory to clearly indicate intent, while being less than halfway (preventing the "didn't quite make it" frustration). For multi-cell drags, the threshold applies independently to each successive cell boundary.

### Breakpoint Logic

```
viewport.width >= 1200 AND viewport.height >= 700 → large
otherwise → small

viewport.width > viewport.height → landscape
otherwise → portrait
```

### Slug Validation Regex

```
/^[a-z0-9]+(-[a-z0-9]+)*$/
```

This enforces: lowercase alphanumeric, hyphens only between segments, no leading/trailing/consecutive hyphens, at least one character.

### Widget Constraint Values

These are the authoritative size constraints for all current widgets:

| Widget ID      | Display Name | Min Col | Max Col | Min Row | Max Row |
| -------------- | ------------ | ------- | ------- | ------- | ------- |
| `obs`          | OBS          | 2       | 5       | 2       | 4       |
| `lower-thirds` | Lower Thirds | 2       | —       | 2       | —       |
| `obs-preview`  | OBS Preview  | 2       | —       | 2       | —       |
| `camera`       | Camera       | 3       | —       | 2       | —       |

("—" = unconstrained, limited only by grid column bounds)

Because rows are dynamic (grids grow vertically), the constraint that all widgets "fit" on a grid is only limited by column count. On the 3-column small-portrait grid, widgets are stacked vertically (all at 3 cols wide). On the 7-column small-landscape grid, widgets can be placed side-by-side within 7 columns. The grid simply grows taller as needed — no fixed-row ceiling prevents placement.

The small grids (7 columns / 3 columns) are intended for phone-sized viewports in future releases. The grid scrolls vertically on viewports shorter than the grid's rendered height. The "default rows" shown in the editor represent what fits on screen without scrolling at native resolution.

### Scope Boundaries

- This spec does NOT change how the live dashboard renders widgets (their internal behavior). It changes how they are placed and sized.
- This spec does NOT add real-time dashboard updates when admins save. Volunteers must refresh.
- This spec does NOT add per-user dashboard assignment (stays role-based).
- This spec DOES replace the current seed script approach with a proper admin UI.
- This spec DOES change the public API to use slugs instead of IDs for dashboard lookup.
- This spec DOES require updating `Dashboard.tsx` to handle four grid types and auto-selection.
