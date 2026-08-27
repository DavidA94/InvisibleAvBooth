# Implementation Tasks — Dashboard Management

Tests are part of each task's definition of done. Unit tests follow the unit or component they cover. Integration tests exercise the full path from HTTP request to database to response. Frontend component tests use React Testing Library. Backend E2E tests use the shared harness with in-memory SQLite. Frontend E2E tests use Playwright with mocked backend.

---

## Phase 1: Shared Package — Widget Type Registry & Grid Types

- [ ] 1. Create `packages/shared/src/widgetTypeRegistry.ts` — export `WidgetTypeDefinition` interface, `WIDGET_TYPE_REGISTRY` constant (entries for `obs`, `lower-thirds`, `obs-preview`, `camera` with display names and min/max col/row spans), and `WIDGET_TYPE_IDS` array.
  - _Requirements: 1.1, 1.2_

- [ ] 2. Create `packages/shared/src/gridTypes.ts` — export `GridType` type (`"large-landscape" | "large-portrait" | "small-landscape" | "small-portrait"`), `GRID_TYPES` array, `GridDimensions` interface (columns, defaultRows, totalWidthRem), `GRID_CELL_SIZE_REM` (7.25), `GRID_GAP_SIZE_REM` (0.75), `GRID_DIMENSIONS` record mapping each grid type to its columns, defaultRows, and totalWidthRem. Export `computeGridHeightRem(rows)` helper function. Export `BREAKPOINT_LARGE_LANDSCAPE` (1200) and `BREAKPOINT_LARGE_PORTRAIT` (700) constants (pixels — viewport width thresholds per orientation). Export `MIN_SCALE_FLOOR` (0.65).
  - _Requirements: 2.1, 2.2_

- [ ] 3. Update `packages/shared/src/types.ts` — add `GridManifest` interface with `grids: Record<GridType, GridCell[]>`. No version field needed (shape validation is sufficient since there are no production deployments on the old format). Keep existing `GridCell` type unchanged.
  - _Requirements: 2.6, 3.3_

- [ ] 4. Update `packages/shared/src/index.ts` — export new modules (`widgetTypeRegistry`, `gridTypes`, updated types).
  - _Requirements: 1.1, 2.1_

- [ ] 5. Update `packages/shared/src/constants/urls.ts` — add `URL_ADMIN_DASHBOARD_BY_ID` helper, update `URL_DASHBOARD_LAYOUT` to accept a slug parameter.
  - _Requirements: 3.4, 4.8_

- [ ] 6. Add new test ID constants to `packages/frontend/src/constants/testIds.ts` — all dashboard management test IDs (`TEST_ID_ADMIN_DASHBOARDS_PAGE`, `TEST_ID_DASHBOARD_LIST`, `TEST_ID_DASHBOARD_LIST_ITEM`, `TEST_ID_ADD_DASHBOARD_BUTTON`, `TEST_ID_DASHBOARD_FORM_NAME`, `TEST_ID_DASHBOARD_FORM_SLUG`, `TEST_ID_DASHBOARD_FORM_DESCRIPTION`, `TEST_ID_DASHBOARD_FORM_ROLES`, `TEST_ID_DASHBOARD_FORM_SAVE`, `TEST_ID_DASHBOARD_FORM_DELETE`, `TEST_ID_DASHBOARD_FORM_ERROR`, `TEST_ID_DASHBOARD_GRID_TAB`, `TEST_ID_DASHBOARD_GRID_EDITOR`, `TEST_ID_GRID_EDITOR_WIDGET`, `TEST_ID_GRID_EDITOR_GHOST`, `TEST_ID_GRID_EDITOR_ADD_WIDGET`, `TEST_ID_GRID_EDITOR_WIDGET_DELETE`, `TEST_ID_DASHBOARD_LIST_DELETE_BUTTON`, `TEST_ID_DASHBOARD_SLUG_ERROR`).
  - _Requirements: 4.3, 5.1_

---

## Phase 2: Database Schema & Migration

- [ ] 7. Update `packages/backend/src/database/schema.ts` — add `slug TEXT NOT NULL UNIQUE` column to `dashboards` table. Add `gridType TEXT NOT NULL CHECK(...)` column to `widget_configurations` table. Change unique constraint to `UNIQUE(dashboardId, widgetId, gridType)`. Add `CREATE UNIQUE INDEX idx_dashboards_name_lower ON dashboards(LOWER(name))`. Write migration function that detects old schema (no `gridType` column) and performs destructive migration (drop and recreate `widget_configurations`, add `slug` to `dashboards` with generated defaults).
  - _Requirements: 3.1, 3.2, 3.3, 3.6_

- [ ] 8. Write unit tests for schema migration — verify migration runs cleanly on old schema, verify idempotent (running on already-migrated schema is a no-op), verify constraints are enforced (invalid gridType rejected, duplicate slug rejected, duplicate dashboardId+widgetId+gridType rejected, case-insensitive name uniqueness via index).
  - _Requirements: 3.1, 3.2, 3.3_

---

## Phase 3: Backend — Dashboard Validation

- [ ] 9. Create `packages/backend/src/validation/dashboardValidation.ts` — implement `validateSlug(slug)` (regex `/^[a-z0-9]+(-[a-z0-9]+)*$/`, max 64 characters), `validateGridColumnBounds(widget, gridType)` (columns only — rows are dynamic), `validateWidgetConstraints(widget)`, `validateNoOverlaps(widgets, gridType)`, `validateSameWidgets(grids)`, `isDashboardComplete(dashboard, grids)`. Each returns structured error objects with `field` and `message`.
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7_

- [ ] 10. Write unit tests for dashboard validation — slug format (valid/invalid cases), overlap detection (no overlap, partial overlap, full overlap, adjacent-but-not-overlapping), grid column bounds (valid edge, exceeds width; rows do NOT fail regardless of value), size constraints (below min, above max, unconstrained allows large), same-widgets check (matching, missing, extra), completeness check (all criteria).
  - _Requirements: 6.1, 6.3, 6.4, 6.5, 6.6, 6.7_

---

## Phase 4: Backend — Admin Dashboard Routes (Rewritten)

- [ ] 11. Rewrite `packages/backend/src/routes/adminDashboardRoutes.ts` — implement `GET /` (list all with `isComplete`), `GET /:id` (full detail with all four grids), `POST /` (create with validation), `PUT /:id` (atomic update: metadata + grids in transaction), `DELETE /:id`. Use validation functions from task 9. Slug and name uniqueness checks query the database. Atomic save uses `database.transaction(...)` to delete+reinsert all widget configurations when grids are provided. Return `isComplete` on all responses.
  - _Requirements: 4.2, 4.3, 4.6, 4.7, 4.9, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10_

- [ ] 12. Update `packages/backend/src/routes/dashboardRoutes.ts` — change `GET /` to filter incomplete dashboards for non-admins (admin sees all with `isComplete` flag). Change `GET /:id/layout` to `GET /:slug/layout` (lookup by slug), return four-grid format with all grid layouts. Apply role-based cell filtering (`roleMinimum`).
  - _Requirements: 6.8, 7.1, 7.3_

- [ ] 13. Write backend integration tests (`tests/integration/routes/admin-dashboards.test.ts` — rewritten) — full test suite covering: create with metadata only (isComplete false), create complete dashboard, reject missing name/slug, reject invalid slug format with descriptive error, reject duplicate slug (409), reject duplicate name case-insensitive (409), update metadata+grids atomically, reject overlapping widgets with descriptive error naming both widgets, reject widgets exceeding grid bounds with descriptive error, reject widgets violating size constraints with descriptive error, reject mismatched widget sets across grids (array of errors), save incomplete dashboard (isComplete false), save complete dashboard (isComplete true), admin list returns all dashboards with isComplete status, non-admin sees only complete dashboards with matching roles, GET by slug returns all four grid layouts, 404 for unknown slug, 403 for unauthorized role, role-based cell filtering, delete cascades widget configurations.
  - _Requirements: all backend integration tests from requirements_

---

## Phase 5: Backend — Seed Script Update

- [ ] 14. Rewrite `packages/backend/scripts/seed-dashboard.ts` — use new schema with `slug` column (`"default"`), insert the "Main Dashboard" with all four grid types populated with concrete widget positions (as specified in design.md PLACEMENTS constant). Positions must be validated against grid bounds and widget constraints. Keep idempotent behavior (check before insert).
  - _Requirements: 3.5_

- [ ] 15. Rewrite `packages/backend/scripts/seed-dashboard.test.ts` — verify slug column present, all four grid types have all four widget entries, each placement is within grid bounds for its grid type, each widget meets min/max size constraints from the registry, same widget set across all grids, idempotency (second run produces no duplicates).
  - _Requirements: 3.5_

---

## Phase 6: Frontend — Dashboard Renderer Updates

- [ ] 16. Create `packages/frontend/src/components/widgetRenderer.tsx` — export `renderWidget(cell: GridCell): ReactNode` function that maps widget IDs to React components via a `WIDGET_COMPONENTS` record. Unknown widget IDs render a placeholder div with the widget title. Import existing widget components (ObsWidget, LowerThirdWidget, ObsPreviewWidget, CameraWidget).
  - _Requirements: 1.5_

- [ ] 17. Create `useGridType()` hook — returns the current `GridType` based on viewport dimensions. Uses `window.innerWidth`/`innerHeight` with the breakpoint constants (1200px width, 700px height). Listens to `resize` event and updates reactively. Both dimensions must meet threshold for "large". Create `useGridScale(gridType)` hook — computes the scale factor `min(viewportWidth / gridNativeWidth, viewportHeight / gridNativeHeight, 1.0)`, clamps to MIN_SCALE_FLOOR (0.65), and sets `--dashboard-scale-font-size` CSS custom property on `<html>`. Add CSS rule `html:has(.dashboard-page) { font-size: var(--dashboard-scale-font-size, 16px); }` to variables.css. Removes the property on unmount as safety (`:has()` stops matching automatically when `.dashboard-page` unmounts). Listens to `resize` event.
  - _Requirements: 2.2, 2.5, 7.2_

- [ ] 18. Update `packages/frontend/src/pages/Dashboard.tsx` — add `className="dashboard-page"` to root element (enables `:has()` scaling rule). Use `:slug` route param instead of `:id`, fetch `/api/dashboards/:slug/layout`, expect response with `grids` record (four grids). Add cache shape validation: if cached data lacks a `grids` object, clear localStorage and fetch fresh. Use `useGridType()` hook to select active grid. Use `useGridScale(gridType)` to set `--dashboard-scale-font-size` for viewport fitting. Use `computeGridHeightRem()` to derive actual grid height from widgets. Grid container uses rem-based inline styles with cell/gap constants directly (already in rem, no conversion needed). Set `maxHeight` to default rows height and `overflowY: auto` when content exceeds default rows. Render only rows that contain widgets (no dead space). Use `renderWidget` instead of hardcoded WidgetPlaceholder.
  - _Requirements: 2.2, 2.4, 2.5, 2.8, 2.9, 7.1, 7.2, 7.3, 7.5_

- [ ] 19. Update `packages/frontend/src/pages/DashboardSelectionScreen.tsx` — API response now includes `slug` instead of `id`. Navigate to `/dashboard/${slug}`. Update localStorage keys to use slug.
  - _Requirements: 7.3, 7.5_

- [ ] 20. Update `packages/frontend/src/App.tsx` — change route from `/dashboard/:id` to `/dashboard/:slug`. Add `/admin/dashboards` route pointing to `AdminDashboardManagement`.
  - _Requirements: 7.3, 4.8_

- [ ] 21. Update `packages/frontend/src/pages/AdminIndexPage.tsx` — add "Dashboard Management" link to `/admin/dashboards` in the admin sections array.
  - _Requirements: 4.8_

- [ ] 22. Update `packages/frontend/src/constants/storageKeys.ts` — update `storageDashboardLayoutKey` to accept slug. Add comment noting key format change.
  - _Requirements: 7.5_

- [ ] 23. Update `packages/frontend/src/pages/Dashboard.test.tsx` — update for four-grid format (`grids` record), update route param from `id` to `slug`, verify auto grid-type selection.
  - _Requirements: 2.2, 7.1_

- [ ] 24. Write unit test for `useGridType()` hook — verify correct grid type for various viewport dimensions (large landscape, large portrait, small landscape, small portrait), verify boundary cases (exactly 1200×700 = large), verify updates on resize.
  - _Requirements: 2.2_

- [ ] 25. Write unit test for `widgetRenderer.tsx` — known widget IDs render their component, unknown widget ID renders placeholder with title.
  - _Requirements: 1.5_

---

## Phase 7: Frontend — Grid Editor Core

- [ ] 26. Create `packages/frontend/src/components/grid-editor/snapLogic.ts` — export `computeSnapPosition(pointerX, pointerY, dragOffsetX, dragOffsetY, cellSize, gapSize)`, `computeSnapResize(pointerX, pointerY, widgetCol, widgetRow, cellSize, gapSize, minSpan, maxSpan, gridMax)`, `wouldOverlap(widget, newCol, newRow, newColSpan, newRowSpan, allWidgets)`, `rectanglesOverlap(...)`, `findFirstAvailablePosition(widgetId, widgets, gridType)`. The 35/65 rule: below 35% into next cell = stay, at/above 35% = snap forward.
  - _Requirements: 5.9, 5.10, 5.11, 5.12_

- [ ] 27. Write unit tests for `snapLogic.ts` — snap threshold at exactly 35% (boundary), below 35% stays, above 35% snaps, multi-cell drag across multiple boundaries, overlap detection (adjacent = no overlap, 1px overlap = overlap), grid bounds clamping, findFirstAvailablePosition for empty/occupied grids. Use `fast-check` property-based tests for: any valid placement never exceeds grid bounds, snap output is always a whole number ≥ 0.
  - _Requirements: 5.9, 5.10, 5.11, 5.12, 5.14_

- [ ] 28. Create `packages/frontend/src/components/grid-editor/GridEditor.tsx` — renders a scaled-down grid representation using CSS Grid. Props: `gridType`, `widgets`, `onWidgetsChange`. Renders grid lines via background gradient. Draws a horizontal dotted "screen edge" line at the default row boundary. Renders placed widgets as labeled rectangles showing `displayName` centered and small muted `{roleMinimum} | {colSpan}×{rowSpan}` text at the bottom (per Req 5.3). Widgets have resize handles (bottom-right corner), delete buttons (×, top-right, visible on hover), and options buttons (`options-outline` icon, adjacent to delete). Options button opens `IonPopover` with roleMinimum dropdown (AvVolunteer/AvPowerUser/ADMIN). Below last used row, displays a half-opacity ghost row with "Add Row" button. Supports dynamic row count: grid auto-expands when widgets are dragged/resized below current rows, auto-contracts when trailing rows become empty (never below default). Ghost preview div shown during drag/resize. Uses pointer events for unified mouse/touch handling. Editor scrolls vertically when grid exceeds visible height.
  - _Requirements: 5.3, 5.6, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15_

- [ ] 29. Write unit tests for `GridEditor.tsx` — widget renders with correct display name, resize handle present, delete button appears on hover, pointer events trigger move/resize mode, overlap prevents ghost advancement, grid bounds prevent placement beyond edges, min/max constraints respected during resize.
  - _Requirements: 5.3, 5.8, 5.9, 5.10, 5.11, 5.12_

---

## Phase 8: Frontend — Admin Dashboard Management Page

- [ ] 30. Create `packages/frontend/src/pages/AdminDashboardManagement.tsx` — follows existing admin page pattern (list+detail panel). Left panel: dashboard list with name/slug, "Add Dashboard" button. Right panel: form fields (name, slug with inline validation, description, allowedRoles multi-select), four grid tabs with `IonSegment`, completeness icons per tab (checkmark/warning), `GridEditor` component for active tab, Save/Delete buttons. Implements dirty check and unsaved-changes confirmation modal. Synchronized add/remove of widgets across all four grids. Toast notification on save (success vs incomplete message).
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 5.1, 5.2, 5.4, 5.5, 5.7, 5.13_

- [ ] 31. Write unit tests for `AdminDashboardManagement.tsx` — list renders dashboards, clicking dashboard loads detail, Add Dashboard creates empty form, slug validation shows inline errors, unsaved changes triggers confirmation modal, save sends correct payload shape, incomplete save shows warning toast, complete save shows success toast, tab switching preserves state, widget add/remove synchronized across grids, tab icons update on widget add/remove, delete confirmation modal triggers DELETE, role multi-select works.
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.9, 5.1, 5.2, 5.4, 5.5, 5.7_

---

## Phase 9: Frontend — CSS & Styling

- [ ] 33. Update `packages/frontend/src/theme/shared.css` — simplify `.dashboard-grid` class (remove fixed 1400×900, dimensions now set inline via constants). Add grid editor styles (`.grid-editor-container`, `.grid-editor-grid`, `.grid-editor-widget`, `.grid-editor-ghost`, `.grid-editor-resize-handle`, `.grid-editor-widget-delete`, `.grid-editor-widget-label`, `.grid-editor-cell-lines`). Add tab completeness icon styles (`.tab-icon-complete`, `.tab-icon-warning`). Add `@media (pointer: coarse)` rule for always-visible delete/options buttons on touch devices.
  - _Requirements: 2.4, 5.3_

---

## Phase 10: Frontend — Playwright E2E Tests

- [ ] 34. Update `packages/frontend/playwright/fixtures/payloads/session.ts` — update `dashboardLayoutDefault()` to return four-grid format with all grid layouts. Update `dashboardListDefault()` to return slug instead of id. Add factory for admin dashboard detail payload.
  - _Requirements: integration tests_

- [ ] 35. Update `packages/frontend/playwright/support/routes/obs.ts` — update `routeDashboardApi` to serve four-grid layouts and slug-based responses.
  - _Requirements: integration tests_

- [ ] 36. Write Playwright e2e test (`packages/frontend/playwright/e2e/admin-dashboards.spec.ts`) covering:
  - Unsaved changes warning on navigation away
  - Tab navigation between all four grid types
  - Tab switching preserves widget placements on other tabs
  - Partial save sends correct payload and shows incomplete toast
  - Tab completeness icons update correctly (warning when empty, checkmark when populated)
  - Loading existing dashboard populates all fields and all four grid layouts
  - Full save sends correct payload and shows success toast without incomplete warning
  - Adding a widget places it on all four grids and disables it in add-widget list
  - Removing a widget removes from all four grids and re-enables in add-widget list
  - Widget can be dragged to a new position (pointer down → move → up)
  - Widget resize respects min/max constraints
  - Widgets cannot overlap (ghost stops at last valid position)
  - 35/65 snap rule (drag below 35% = no snap, at 35% = snaps)
  - Multi-cell move (widget moves from (1,1) to (5,3) in single drag)
  - Multi-cell resize (widget grows from 1×1 to 3×3 in single drag)
  - Same widgets enforced on all grids (add on one = appears on all)
  - _Requirements: all frontend integration tests from requirements_

---

## Phase 11: Update Existing Tests & Fixtures

- [ ] 37. Update existing Playwright tests that reference dashboard layout or list payloads — `recording-flow.spec.ts`, `lower-third-widget.spec.ts`, `swipeable-row.spec.ts`, `camera-widget.spec.ts`, `obs-audio-meters.spec.ts`, `dashboard-auto-forward.spec.ts`, `multi-platform-stream-start-flow.spec.ts`. Change to four-grid format and slug-based URLs where applicable.
  - _Requirements: 7.3_

- [ ] 38. Update existing backend integration tests that create dashboards — ensure they use the new schema (include slug on dashboard creation, include gridType on widget creation). Affected files: `admin-dashboards.test.ts` (already rewritten in task 13), any tests in gateway/ that seed a dashboard for socket testing.
  - _Requirements: 3.1, 3.2, 3.3_

- [ ] 39. Update `packages/frontend/src/pages/DashboardSelectionScreen.test.tsx` — update for slug-based navigation and response shape.
  - _Requirements: 7.3_

---

## Phase 12: Documentation Updates

- [ ] 40. Update `.kiro/steering/architecture.md` Section 10 — rewrite "Widget Grid Sizing" to reflect four grid types with 7.25rem (116px) cells, dynamic rows, viewport scaling via root font-size reduction, and fixed column counts. Remove 10×6 references, percentage-based sizing, 1400×900 container. Confirm that the rem-based grid constants align with the existing rem-only code style (no exception needed — grid is rem). Update "Target Viewport Range" table with new breakpoints and behavior. Update `--space-screen-edge` description (no longer applies to grid container).
  - _Requirements: steering doc alignment_

- [ ] 41. Add supersession admonition blocks to `livestream-control-system` spec — Req 5b.7 (grid dimensions), Req 5b.9 (unique constraint), Glossary (GridManifest, DEFAULT_GRID_MANIFEST), and design doc sections referencing the 10×6 grid, dashboard URL, and widget configuration routes.
  - _Requirements: steering doc alignment_

- [ ] 42. Add supersession notes to `video-control-and-preview` spec — seed-dashboard.ts section (old positions are replaced by this spec's four-grid placements).
  - _Requirements: steering doc alignment_

---

## Phase 13: Final Verification

- [ ] 43. Run `npm run ci` from repo root — all lint, format, build, and test checks must pass across all packages. Fix any type errors from the shared package changes propagating to frontend/backend.
  - _Requirements: all_
