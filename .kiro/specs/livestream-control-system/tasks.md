# Implementation Tasks

Tests are part of each story's definition of done. Unit tests (including property-based tests) follow the unit or component they cover. Integration tests close each backend story, exercising the full path from API boundary to mocked hardware or real embedded data.

---

## Monorepo Bootstrap

- [x] 1. Bootstrap packages/shared — package.json, tsconfig.json, src/bibleBooks.ts with BIBLE_BOOKS constant (Record<number, string>, bookId 1–66, Roman numeral prefixes)
  - _Requirements: 19_

- [x] 2. Bootstrap packages/backend — package.json with all backend dependencies, tsconfig.json extending tsconfig.base.json with project reference to packages/shared
  - _Requirements: 1_

- [x] 3. Bootstrap packages/frontend — package.json with all frontend dependencies, tsconfig.json extending tsconfig.base.json with project reference to packages/shared
  - _Requirements: 1_

- [x] 4. Update root package.json — declare workspaces (packages/shared, packages/backend, packages/frontend), add root-level scripts
  - _Requirements: 1_

- [x] 5. Configure Vitest for packages/backend (environment: node, coverage thresholds 90%) and packages/frontend (jsdom, coverage thresholds 90%)
  - _Requirements: 1_

- [x] 6. Configure Playwright — packages/frontend/playwright.config.ts (base URL, browser config, test directory playwright/e2e/)
  - _Requirements: 1_

- [x] 7. Update .gitignore — exclude logs/, data/bootstrap.txt, data/app.db, and other generated files
  - _Requirements: 24_

---

## Backend Infrastructure

- [x] 8. Create backend database layer — src/db/database.ts (SQLite via better-sqlite3, creates data/ dir, loads bibledb_kjv.sql into kjv table on first run) and src/db/schema.ts (CREATE TABLE for users, device_connections, dashboards, widget_configurations)
  - _Requirements: 13, 14, 5d_

- [x] 9. Write unit tests for database layer — DB initialisation creates all tables, KJV data loads on first run and is skipped on subsequent runs, schema columns match spec (real in-memory SQLite, no mocks needed)
  - _Requirements: 13, 14, 5d_

- [x] 10. Create backend EventBus — src/eventBus.ts (typed wrapper around Node.js EventEmitter, full EventMap: bus:session:manifest:updated, bus:obs:state:changed, bus:obs:error, bus:obs:error:resolved, device:capabilities:updated)
  - _Requirements: 2, 4_

- [x] 11. Write unit tests for EventBus — typed emit/on/off for each EventMap event, listener receives correct payload, off removes listener, multiple listeners on same event, no cross-event leakage
  - _Requirements: 2, 4_

- [x] 12. Create backend logger — src/logger.ts (winston, JSON file transport to logs/app.log via winston-daily-rotate-file at 20MB cap, human-readable console transport, creates logs/ dir, respects LOG_LEVEL)
  - _Requirements: 24_

- [x] 13. Write unit tests for logger — logger exports debug/info/warn/error methods, LOG_LEVEL env var controls minimum level, JSON transport and console transport are both configured, logs/ directory is created if absent (mock file system side effects)
  - _Requirements: 24_

---

## Auth & User Management

- [x] 14. Create backend AuthService — src/services/authService.ts (login/bcrypt, JWT as HttpOnly cookie, verifyToken, requireRole, createUser, updateUser, deleteUser, listUsers, changePassword, bootstrap admin on empty users table, delete data/bootstrap.txt after password change)
  - _Requirements: 6, 7, 13_

- [x] 15. Write unit tests for AuthService — login success/failure, JWT issuance, role enforcement, createUser/updateUser/deleteUser, self-delete block, bootstrap behavior, changePassword clears flag (mock DB)
  - _Requirements: 6, 13_

- [x] 16. Create backend auth REST routes — src/routes/authRoutes.ts (POST /auth/login with rememberMe, POST /auth/logout clearing cookie)
  - _Requirements: 6_

- [x] 17. Create backend admin user management routes — src/routes/adminUserRoutes.ts (GET/POST /admin/users, GET/PUT/DELETE /admin/users/:id, POST /admin/users/:id/change-password, ADMIN role required)
  - _Requirements: 13_

- [x] 18. Write integration tests for auth and user management — POST /auth/login → JWT cookie → protected route enforcement; ADMIN CRUD /admin/users; self-delete block; changePassword clears requiresPasswordChange (real SQLite, mocked bcrypt timing)
  - _Requirements: 6, 13_

---

## Device Management

- [x] 19. Create backend admin device management routes — src/routes/adminDeviceRoutes.ts (GET/POST /admin/devices, GET/PUT/DELETE /admin/devices/:id, ADMIN role, AES-256-GCM encrypt/decrypt via DEVICE_SECRET_KEY, never return password)
  - _Requirements: 14_

- [x] 20. Write integration tests for device management — ADMIN CRUD /admin/devices; encryption round-trip; password never returned in GET/PUT responses; 403 for non-ADMIN (real SQLite, real crypto)
  - _Requirements: 14_

---

## Dashboard Management

- [x] 21. Create backend admin dashboard and widget configuration routes — src/routes/adminDashboardRoutes.ts (GET/POST /admin/dashboards, GET/PUT/DELETE /admin/dashboards/:id, GET/POST /admin/dashboards/:id/widgets, GET/PUT/DELETE /admin/dashboards/:id/widgets/:widgetId, ADMIN role)
  - _Requirements: 5d_

- [x] 22. Create backend dashboard layout and session REST routes — src/routes/dashboardRoutes.ts (GET /api/dashboards filtered by role, GET /api/dashboards/:id/layout returning GridManifest) and src/routes/sessionRoutes.ts (GET /api/session/manifest)
  - _Requirements: 5, 5b_

- [x] 23. Write integration tests for dashboard management — ADMIN CRUD /admin/dashboards and widgets; GET /api/dashboards role filtering (ADMIN sees all, AvVolunteer sees only matching allowedRoles); GET /api/dashboards/:id/layout returns correct GridManifest (real SQLite)
  - _Requirements: 5, 5b, 5d_

---

## KJV Validation

- [x] 24. Create backend KJV validation route — src/routes/kjvRoutes.ts (GET /api/kjv/validate?bookId=&chapter=&verse=&verseEnd=, returns {valid, reason?})
  - _Requirements: 19_

- [x] 25. Write integration tests for KJV validation — valid references, BOOK_NOT_FOUND, CHAPTER_NOT_FOUND, VERSE_NOT_FOUND, VERSE_END_NOT_FOUND (real SQLite kjv table, no mock needed)
  - _Requirements: 19_

---

## Log Ingestion

- [x] 26. Create backend log ingestion route — src/routes/logRoutes.ts (POST /api/logs, authenticated, accepts array of LogEntry, writes via backend logger tagged source: frontend)
  - _Requirements: 24_

- [x] 27. Write integration test for log ingestion — POST /api/logs writes entries to logger with source: frontend; 401 without JWT
  - _Requirements: 24_

---

## Session Manifest

- [x] 28. Create backend SessionManifestService — src/services/sessionManifestService.ts (in-memory SessionManifest, get/update/clear, emits bus:session:manifest:updated on EventBus, subscribes to bus:obs:state:changed to block clear while live, interpolates template with BIBLE_BOOKS for {Scripture})
  - _Requirements: 2, 9, 15, 19_

- [x] 29. Write unit tests for SessionManifestService — get/update/clear, EventBus emissions, clear blocked while live, template interpolation for all tokens and placeholders including {Scripture} range formatting; property-based tests (fast-check) for arbitrary manifest field combinations and template strings (mock EventBus)
  - _Requirements: 2, 9, 15_

---

## OBS Control

- [x] 30. Create backend ObsService — src/services/obsService.ts (connects to OBS via obs-websocket, reads config from device_connections, maintains commandedState, emits bus:obs:state:changed and bus:obs:error on EventBus, safe-start sequence for startStream, subscribes to bus:session:manifest:updated for metadata cache)
  - _Requirements: 3, 4, 8_

- [x] 31. Write unit tests for ObsService — connect/disconnect, safe-start sequence, commandedState tracking, error emission, OBS_NOT_CONFIGURED, reconnect after disconnect, capabilities discovery (mock obs-websocket client)
  - _Requirements: 3, 4, 8_

- [x] 32. Create backend SocketGateway — src/gateway/socketGateway.ts (Socket.io server, JWT validation on connect and reconnect, subscribes to EventBus events and broadcasts to clients, handles cts:obs:command/cts:session:manifest:update/cts:obs:reconnect with ack callbacks)
  - _Requirements: 4, 6, 23_

- [x] 33. Write unit tests for SocketGateway — JWT validation on connect/reconnect, EventBus event → client broadcast wiring, cts:obs:command routing to ObsService, ack callback shape (mock EventBus, mock ObsService, mock Socket.io)
  - _Requirements: 4, 6_

- [x] 34. Write integration tests for OBS control via Socket.io — cts:obs:command (startStream/stopStream/startRecording/stopRecording) → mocked OBS → stc:obs:state broadcast to all clients; safe-start metadata update sequence; OBS error → notification broadcast; cts:session:manifest:update → ack → broadcast (real SQLite, real EventBus, mocked obs-websocket)
  - _Requirements: 2, 4, 8, 9_

---

## Backend Finishing

- [x] 35. Create backend seed script — scripts/seed-dashboard.ts (inserts default dashboard and OBS widget_configurations row, idempotent)
  - _Requirements: 5d_

- [x] 36. Write unit tests for seed script — idempotent run inserts exactly one dashboard and one widget row; second run produces no duplicates; missing dashboard is created (real in-memory SQLite)
  - _Requirements: 5d_

- [x] 37. Create backend entry point — src/index.ts (validates DEVICE_SECRET_KEY, initialises DB, runs bootstrap, starts ObsService, creates Express app with middleware, mounts REST router, attaches SocketGateway, starts HTTP server, logs startup warning if no dashboards exist)
  - _Requirements: 14, 21_

- [x] 38. Create docs/setup.md — DEVICE_SECRET_KEY generation, first startup, seed script, first login/password change, all admin routes
  - _Requirements: 21_

---

## Frontend Core

- [x] 39. Create frontend entry point and Ionic/React app shell — src/main.tsx, App.tsx (Router with all route definitions), src/theme/variables.css (color tokens, spacing tokens, root font-size fixed at 16px)
  - _Requirements: 18_

- [x] 40. Create frontend Zustand store — src/store/index.ts composing authSlice, obsSlice, sessionManifestSlice, notificationSlice; plus individual slice files
  - _Requirements: 4, 11_

- [x] 41. Write unit tests for frontend store slices — authSlice, obsSlice, sessionManifestSlice, notificationSlice: state transitions, action correctness, initial state (useStore.setState reset between tests)
  - _Requirements: 4, 11_

- [x] 42. Create frontend SocketProvider — src/providers/SocketProvider.tsx (Socket.io connection after auth, all event listeners wiring to store actions, emits cts:request:initial:state after listeners are ready, socket context for command emission, tablet network loss banner handling, re-emits cts:request:initial:state on reconnect)
  - _Requirements: 4, 23_

- [x] 43. Write unit tests for SocketProvider — socket connects after auth, disconnects on logout, each incoming event updates the correct store slice, network loss banner appears on disconnect (mock Socket.io client)
  - _Requirements: 4, 23_

- [x] 44. Create frontend logger — src/logger.ts (debug/info/warn/error interface, batches entries, POSTs to /api/logs with 3-retry logic, buffers while Socket.io is down)
  - _Requirements: 24_

- [x] 45. Write unit tests for frontend logger — entries are batched and POSTed to /api/logs, 3-retry logic on failure, entries buffer when socket is down and flush on reconnect (mock fetch)
  - _Requirements: 24_

- [x] 46. Create frontend useAuth hook — src/hooks/useAuth.ts (reads authSlice, provides user and isRole(minimum) helper with role hierarchy)
  - _Requirements: 7_

- [x] 47. Write unit tests for useAuth — returns correct user from store, isRole returns true/false for each role level, updates when store changes
  - _Requirements: 7_

- [x] 48. Create frontend useObsState hook — src/hooks/useObsState.ts (reads obsSlice, provides state/isPending/sendCommand with optimistic update logic)
  - _Requirements: 8, 11_

- [x] 49. Write unit tests for useObsState — returns current OBS state, isPending reflects optimistic update, sendCommand emits socket event and sets pending, pending clears on state update (mock socket context)
  - _Requirements: 8, 11_

- [x] 50. Create frontend useResizeObserver hook — src/hooks/useResizeObserver.ts (observes contentRect.width via ResizeObserver, returns current width, cleans up on unmount)
  - _Requirements: 16, 18_

- [x] 51. Write unit tests for useResizeObserver — returns observed width, updates on resize, disconnects observer on unmount (mock ResizeObserver)
  - _Requirements: 16, 18_

- [x] 52. Create frontend ProtectedRoutes — src/components/ProtectedRoutes.tsx (redirects to /login if no auth user, to /change-password if requiresPasswordChange, non-ADMIN away from /admin/\* routes)
  - _Requirements: 6, 7_

- [x] 53. Write unit tests for ProtectedRoutes — unauthenticated user redirects to /login, requiresPasswordChange redirects to /change-password, non-ADMIN redirects away from /admin/\* routes, authenticated ADMIN passes through (mock useAuth)
  - _Requirements: 6, 7_

---

## Auth UI

- [x] 54. Create frontend LoginPage — src/pages/LoginPage.tsx (username/password form with clearInput, Remember Me checkbox, POST /auth/login, stores user in authSlice, redirects based on requiresPasswordChange)
  - _Requirements: 6, 20_

- [x] 55. Write unit tests for LoginPage — form submits credentials, successful login stores user and redirects, failed login shows error, requiresPasswordChange redirects to /change-password, Remember Me checkbox present (mock fetch, mock store)
  - _Requirements: 6, 20_

- [x] 56. Create frontend ChangePasswordPage — src/pages/ChangePasswordPage.tsx (new password form, POST /admin/users/:id/change-password, redirect to /dashboards on success)
  - _Requirements: 13_

- [x] 57. Write unit tests for ChangePasswordPage — form submits new password, success redirects to /dashboards, error displays inline message (mock fetch)
  - _Requirements: 13_

- [x] 58. Create frontend GlobalTitleBar — src/components/GlobalTitleBar.tsx (username, role, dashboard nav label, Logout; reduced variant on /change-password; nav label tap always navigates to /dashboards; Logout clears localStorage and redirects)
  - _Requirements: 5c_

- [x] 59. Write unit tests for GlobalTitleBar — displays username and role, nav label navigates to /dashboards, Logout clears store and redirects to /login, reduced variant renders on /change-password (mock useAuth, mock router)
  - _Requirements: 5c_

- [x] 60. Create frontend DashboardSelectionScreen — src/pages/DashboardSelectionScreen.tsx (fetches GET /api/dashboards, lists dashboards with name/description, no-dashboards state, stores dashboardId in localStorage, auto-selects if exactly one on initial auth)
  - _Requirements: 5_

- [x] 61. Write unit tests for DashboardSelectionScreen — renders dashboard list from API, no-dashboards empty state, selecting a dashboard stores id and navigates, auto-selects single dashboard on initial auth (mock fetch)
  - _Requirements: 5_

- [x] 62. Create frontend Dashboard page — src/pages/Dashboard.tsx (all 8 selection flows, GridManifest loading with localStorage cache fallback, Loading/Refreshing spinners, structural change detection, 10×6 landscape / 6×10 portrait grid with max-width/max-height constraints, widgetId → component mapping)
  - _Requirements: 5b, 18_

- [x] 63. Write unit tests for Dashboard — renders correct grid layout, shows Loading spinner on first load, shows Refreshing spinner on refresh, falls back to localStorage cache on fetch failure, structural change triggers re-render, widgetId maps to correct component (mock fetch, mock store)
  - _Requirements: 5b, 18_

- [ ] 64. Create Playwright fixture infrastructure — playwright/fixtures/payloads/obs.ts, auth.ts, session.ts (typed factory functions with happy-path defaults and partial overrides) and playwright/support/routes/obs.ts, auth.ts, session.ts (shared HTTP and WebSocket route handlers)
  - _Requirements: 4, 6, 8_

- [ ] 65. Write Playwright E2E test for authentication flow — login success, login failure, logout, requiresPasswordChange redirect, session persistence (mocked backend)
  - _Requirements: 6, 13_

---

## Platform Components

- [x] 66. Create frontend WidgetContainer — src/components/WidgetContainer.tsx (title bar with connection status indicators, content area with --space-widget-inner padding, ResizeObserver for expanded/collapsed mode, Ionic popover on indicator tap)
  - _Requirements: 16, 18_

- [x] 67. Write unit tests for WidgetContainer — expanded/collapsed indicator modes, popover on tap, healthy/unhealthy dot states, title rendering (mock ResizeObserver)
  - _Requirements: 16_

- [x] 68. Create frontend ConfirmationModal — src/components/ConfirmationModal.tsx (optional title, optional body slot, confirmLabel, cancelLabel, confirmVariant danger/primary, onConfirm/onCancel callbacks)
  - _Requirements: 17_

- [x] 69. Write unit tests for ConfirmationModal — confirm/cancel callbacks, danger/primary variant styling, title/body rendering, button labels
  - _Requirements: 17_

- [x] 70. Create frontend WidgetErrorOverlay — src/components/WidgetErrorOverlay.tsx (semi-transparent scrim + centered action card when isVisible, isPending spinner, onAction on tap, non-interactive if onAction absent)
  - _Requirements: 3, 10_

- [x] 71. Write unit tests for WidgetErrorOverlay — renders when isVisible, hidden when not, shows spinner when isPending, onAction fires on tap, non-interactive when onAction absent (data-testid assertions)
  - _Requirements: 3, 10_

- [x] 72. Create frontend NotificationLayer — src/components/NotificationLayer.tsx (Toast auto-dismiss 5s, Banner with 'Error X of Y' counter and navigation, Modal with acknowledgment or auto-clear on resolution event)
  - _Requirements: 10, 23_

- [x] 73. Write unit tests for NotificationLayer — toast auto-dismisses after 5s, banner shows correct 'Error X of Y' counter, banner navigation cycles through errors, modal requires acknowledgment, modal auto-clears on resolution event (mock store, mock timers)
  - _Requirements: 10, 23_

---

## OBS Widget

- [x] 74. Create frontend SessionManifestModal — src/components/SessionManifestModal.tsx (speaker/title clearInput, scripture book autocomplete with KJV contains search, chapter/verse/verseEnd numeric inputs, live interpolatedStreamTitle preview, Save/Cancel/Clear All; 5s ack timeout with inline error; end verse normalisation on blur; scripture validation on blur)
  - _Requirements: 2, 9, 15, 19, 20_

- [x] 75. Write unit tests for SessionManifestModal — speaker/title inputs update preview, scripture autocomplete filters by contains search, end verse normalises on blur, scripture validation shows error on blur, Save emits socket event with ack, 5s timeout shows inline error, Clear All resets all fields, Cancel closes without saving (mock socket context, mock fetch for KJV validation)
  - _Requirements: 2, 9, 15, 19, 20_

- [x] 76. Create frontend ObsWidget sub-components — obs/ObsStatusBar.tsx (stream status dot, timecode, recording indicator, Edit Details pencil button), obs/ObsMetadataPreview.tsx (interpolated title with ellipsis, tap-to-expand popover, 'No session details set' empty state), obs/ObsControls.tsx (Start/Stop Stream and Start/Stop Recording buttons with pending state)
  - _Requirements: 8, 9, 11, 18_

- [x] 77. Write unit tests for ObsWidget sub-components — ObsStatusBar: correct dot color per stream state, timecode displays, recording indicator visible when recording, pencil button fires callback; ObsMetadataPreview: shows interpolated title, empty state when no details, popover on tap; ObsControls: correct button label per state, pending state disables buttons (mock useObsState)
  - _Requirements: 8, 9, 11, 18_

- [x] 78. Create frontend ObsWidget — src/components/obs/ObsWidget.tsx (2×2 footprint, WidgetContainer with title='OBS', composes all OBS sub-components, WidgetErrorOverlay when disconnected, OBS_NOT_CONFIGURED overlay, all confirmation flows, disabled Start Stream tap behavior)
  - _Requirements: 8, 9, 10, 11, 17_

- [x] 79. Write unit tests for ObsWidget — connected/disconnected states, Start Stream confirmation flow, Stop Stream confirmation flow, Stop Recording confirmation flow, disabled Start Stream behavior, metadata preview states (mock useObsState, useAuth)
  - _Requirements: 8, 9, 11, 17_

- [ ] 80. Write Playwright E2E test for OBS stream start flow — login → dashboard → enter metadata → tap Start Stream → confirm → verify stream live state (mocked backend HTTP + WebSocket)
  - _Requirements: 8, 9_

---

## Admin Pages

- [x] 81. Create frontend AdminUserManagement page — src/pages/AdminUserManagement.tsx (route /admin/users, ADMIN only, list/create/edit/delete users, clearInput on text inputs, pending state on submit buttons)
  - _Requirements: 13, 20_

- [x] 82. Write unit tests for AdminUserManagement — renders user list, create user form submits and updates list, edit user updates row, delete user removes row, pending state on submit, clearInput on text fields (mock fetch)
  - _Requirements: 13, 20_

- [x] 83. Create frontend AdminDeviceManagement page — src/pages/AdminDeviceManagement.tsx (route /admin/devices, ADMIN only, list/add/edit/delete device connections, OBS Stream Title Template field with live preview)
  - _Requirements: 14, 20_

- [x] 84. Write unit tests for AdminDeviceManagement — renders device list, add device form submits and updates list, edit device updates row, delete device removes row, stream title template field shows live preview (mock fetch)
  - _Requirements: 14, 20_

- [ ] 85. Write Playwright E2E tests for admin pages — admin user CRUD flow end-to-end; admin device CRUD flow end-to-end (mocked backend)
  - _Requirements: 13, 14, 20_
