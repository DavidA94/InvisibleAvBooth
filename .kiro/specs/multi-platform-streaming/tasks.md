# Tasks — Multi-Platform Streaming

## Phase 1: Shared Infrastructure & Breaking Changes

These tasks modify existing code and must be completed first. They establish the foundation that all subsequent phases depend on.

### Task 1: Extract `Result<T, E>` type to shared package
- [ ] Create `packages/shared/src/types/Result.ts` with `export type Result<T, E> = { success: true; value: T } | { success: false; error: E };`
- [ ] Re-export from `packages/shared/src/index.ts`
- [ ] Replace local `Result` definitions in `authService.ts`, `obsService.ts`, `sessionManifestService.ts` with imports from `@invisible-av-booth/shared`
- [ ] Verify all tests pass

### Task 2: Migrate `ConnectionStatus` from boolean to four-value status
- [ ] Move `ConnectionStatus` interface from `WidgetContainer.tsx` to `packages/frontend/src/types.ts`
- [ ] Change `healthy: boolean` to `status: "healthy" | "degraded" | "unhealthy" | "inactive"`
- [ ] Add CSS classes `widget-dot-degraded` (color-warning) and `widget-dot-inactive` (color-text-muted) to `variables.css`
- [ ] Update `WidgetContainer.tsx`: four-way dot class mapping, four-way popover status labels, `data-status` attribute on dots
- [ ] Update `ObsWidget.tsx`: change `{ label: "OBS", healthy: obsState.connected }` to `{ label: "OBS", status: obsState.connected ? "healthy" : "unhealthy" }`
- [ ] Update all `WidgetContainer` tests and `ObsWidget` tests
- [ ] Verify all tests pass

### Task 3: Rename `interpolateStreamTitle` to `interpolateTemplate` and add `{verseText}` support
- [ ] Rename function in `packages/shared/src/interpolation.ts`
- [ ] Add optional `verseTextResolver` parameter: `(ref: ScriptureReference) => string`
- [ ] Add `{verseText}` token handling with frontend fallback (`John 3:16 (full text included on stream)`)
- [ ] Update `formatScripture()` to handle verse 0 per Req 3.3 (chapter-only and range-starting-at-1)
- [ ] Update export in `packages/shared/src/index.ts`
- [ ] Find-and-replace all import sites across the monorepo
- [ ] Update all interpolation tests, add verse 0 test cases
- [ ] Verify all tests pass

### Task 4: Extend `SessionManifest` type and `SessionManifestEventMap` payload
- [ ] Add `titleTemplateId?: string` and `descriptionTemplateId?: string` to backend `SessionManifest` in `sessionManifest/types.ts`
- [ ] Replace frontend `SessionManifestFields as SessionManifest` alias in `types.ts` with a proper interface that extends `SessionManifestFields` with template IDs
- [ ] Add `interpolatedDescription: string` and `manifestReady: boolean` to `SessionManifestEventMap` payload
- [ ] Update `sessionManifestSlice.ts`: add `interpolatedDescription`, `manifestReady` fields and update `setManifest` to 4-argument signature
- [ ] Update `SocketProvider.tsx` manifest handler to pass all four fields
- [ ] Update all tests that reference the manifest payload shape
- [ ] Verify all tests pass

### Task 5: Add new database tables and bootstrap logic
- [ ] Add `streaming_platforms`, `metadata_templates`, and `oauth_states` tables to `schema.ts`
- [ ] Add template bootstrap logic in `index.ts`: if `metadata_templates` is empty, create default title template and "None" description template
- [ ] Add `RELAY_PORT` to `.env.example`
- [ ] Add new environment variables to `.env.example`: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- [ ] Verify schema is idempotent (existing deployments get new tables without breaking)
- [ ] Write tests for bootstrap logic

### Task 6: Add new event constants and URL constants
- [ ] Add `BUS_RELAY_STATE_CHANGED`, `BUS_FORWARDER_EXITED`, `BUS_PLATFORM_STATE_CHANGED`, `BUS_PLATFORM_HEALTH_UPDATED`, `BUS_PLATFORM_READINESS_CHANGED` to `eventBus/types.ts`
- [ ] Add `CTS_PLATFORM_COMMAND`, `STC_PLATFORM_STATE`, `STC_PLATFORM_HEALTH`, `STC_RELAY_STATE`, `STC_PLATFORM_READINESS` to `packages/shared/src/constants/socketEvents.ts`
- [ ] Add URL constants to `packages/shared/src/constants/urls.ts`: `URL_ADMIN_TEMPLATES`, `URL_ADMIN_TEMPLATE_BY_ID`, `URL_ADMIN_TEMPLATES_VALIDATE`, `URL_TEMPLATES`, `URL_ADMIN_PLATFORMS`, `URL_ADMIN_PLATFORM_BY_TYPE`, `URL_PLATFORMS_HEALTH`, `URL_AUTH_CALLBACK_YOUTUBE`, `URL_AUTH_CALLBACK_FACEBOOK`
- [ ] Extend `EventMap` in `eventBus.ts` with `RelayEventMap` and `PlatformEventMap` slices
- [ ] Add `data-testid` constants to `testIds.ts` for all new components

---

## Phase 2: Backend Services

### Task 7: Implement `MetadataTemplateDao`
- [ ] Create `packages/backend/src/dao/metadataTemplateDao.ts` as a class with `Database` constructor
- [ ] Implement: `getAll`, `getById`, `getByCategory`, `getByCategoryAndRole` (role hierarchy filtering via SQL IN clause), `create`, `update`, `delete`, `countByCategoryAndRole`, `titleTemplateCount`
- [ ] Guard: reject deletion of last title template, reject deletion/edit of "None" template
- [ ] Write unit tests with in-memory SQLite

### Task 8: Implement template validation logic
- [ ] Create `packages/backend/src/validation/templateValidation.ts`
- [ ] Implement checks: (a) unknown tokens — BLOCKER, (b) duplicate format string (whitespace-collapsed) — BLOCKER, (c) duplicate name — BLOCKER, (d) AvVolunteer multiple — WARNING
- [ ] Return `ValidationResult` with `blockers` and `warnings` arrays
- [ ] Write unit tests including edge cases (whitespace collapsing, self-exclusion on edit)

### Task 9: Implement template REST routes
- [ ] Create `createAdminTemplateRouter` mounted at `/api/admin/templates` (ADMIN only): GET all, POST create, PUT update, DELETE, POST validate
- [ ] Create `createTemplateRouter` mounted at `/api/templates` (authenticated, any role): GET filtered by JWT role
- [ ] Wire both routers in `index.ts`
- [ ] Write integration tests

### Task 10: Modify `SessionManifestService` for multi-template interpolation
- [ ] Change constructor to accept `Database`, create `MetadataTemplateDao` internally
- [ ] Remove `template` field and `getTemplate()` method
- [ ] Add `getInterpolated()` method returning `{ interpolatedStreamTitle, interpolatedDescription, manifestReady }`
- [ ] Modify `update()` to read templates from DAO, interpolate both title and description, compute `manifestReady`
- [ ] Modify `clear()` to preserve `titleTemplateId` and `descriptionTemplateId`
- [ ] Create `verseTextResolver` that queries KJV table
- [ ] Update `index.ts` to pass `database` to constructor
- [ ] Update all existing tests, add new tests for multi-template interpolation and `manifestReady`

### Task 11: Modify `ObsService` for relay-aware streaming
- [ ] Add `configureRelayTarget()` method using `streamServiceType: "rtmp_custom"`
- [ ] Call `configureRelayTarget()` on every OBS connection
- [ ] Modify `startStream()`: remove `updateStreamMetadata()` call, add relay target verification and auto-correction
- [ ] Remove `BUS_SESSION_MANIFEST_UPDATED` subscription, `cachedStreamTitle`, `manifestHandler`
- [ ] Update `destroy()` to remove the unsubscribe call
- [ ] Add hazard comment to `updateStreamMetadata()` about `rtmp_common` vs `rtmp_custom` conflict
- [ ] Add JSDoc to `getObsService()`: "Singleton factory for test convenience. Production code in index.ts constructs ObsService directly."
- [ ] Update `ObsModule`: remove `startStream`/`stopStream` from Socket.io handler, return error if received
- [ ] Update all existing tests

### Task 12: Implement `RelayService`
- [ ] Create `packages/backend/src/services/relayService.ts`
- [ ] Start `node-media-server` on `RELAY_PORT`, bind to `127.0.0.1`
- [ ] Configure RTMP ping: `ping: 5`, `ping_timeout: 3`
- [ ] Add `prePublish` hook: reject paths other than `/live/stream`, reject second concurrent publisher
- [ ] Subscribe to `postPublish`/`donePublish` for OBS connection detection
- [ ] Implement FFmpeg forwarder spawn/kill with `Map<string, ChildProcess>` tracking
- [ ] Consume FFmpeg stderr via stream handler, retain last 50 lines
- [ ] Implement relay crash recovery (3 attempts, 5-second delays)
- [ ] Emit `BUS_RELAY_STATE_CHANGED` and `BUS_FORWARDER_EXITED` events
- [ ] Verify FFmpeg availability on startup, emit Banner if not found
- [ ] Register `SIGTERM`/`SIGINT` signal handlers in `index.ts` for cleanup
- [ ] Write unit tests with mocked `node-media-server` and `child_process`

### Task 13: Implement `StreamingPlatformClient` interface and YouTube/Facebook clients
- [ ] Create `packages/backend/src/platforms/platformClient.ts` with `StreamingPlatformClient` interface
- [ ] Create `packages/backend/src/platforms/youtubeClient.ts`: broadcast CRUD via `googleapis`, token refresh, health polling, `enableAutoStart`/`enableAutoStop`, privacy setting, live status polling
- [ ] Create `packages/backend/src/platforms/facebookClient.ts`: broadcast CRUD via Graph API HTTPS calls, Page token validation
- [ ] Create `PlatformConfig` type and DAO for `streaming_platforms` table (decrypt tokens via `crypto.ts`)
- [ ] Write unit tests with mocked API responses

### Task 14: Implement `StreamingPlatformService`
- [ ] Create `packages/backend/src/services/streamingPlatformService.ts`
- [ ] Implement platform state machine (7 states, all transitions per design doc)
- [ ] Implement `startAll()` with parallel broadcast creation, shared OBS start mutex (10-second timeout), all-failed guard
- [ ] Implement `startPlatform()` with best-effort old broadcast cleanup from Error state
- [ ] Implement `stopAll()` and `stopPlatform()` with 30-second stop timeout
- [ ] Implement server-side `operationInProgress` lock
- [ ] Implement auto-recovery (Req 5.4) with API verification, suppressed during No Source
- [ ] Implement No Source → Recovering flow with FFmpeg liveness check and respawn
- [ ] Implement relay crash → FFmpeg respawn for Streaming platforms
- [ ] Implement OBS stream stop when all platforms idle (Req 7.7)
- [ ] Implement health polling (20-second interval, try/catch, 3 consecutive failures → noData Banner, paused during No Source)
- [ ] Implement token lifecycle: startup validation, YouTube proactive refresh (1-minute timer), Facebook periodic validation (6-hour timer)
- [ ] Implement YouTube broadcast counter with warning after 5 creations/day
- [ ] Implement `endBroadcast` "already ended" handling (treat as success)
- [ ] Emit `BUS_PLATFORM_STATE_CHANGED`, `BUS_PLATFORM_HEALTH_UPDATED`, `BUS_PLATFORM_READINESS_CHANGED`
- [ ] Write unit tests for state machine, orchestration, recovery, health polling
- [ ] Write property-based tests for P22-P30

### Task 15: Implement `StreamingPlatformModule` (Socket.io gateway)
- [ ] Create `packages/backend/src/gateway/modules/platform/streamingPlatformModule.ts`
- [ ] Implement `SocketModule` interface: `register`, `registerSocket`, `emitInitialState`
- [ ] Forward `BUS_PLATFORM_STATE_CHANGED`, `BUS_PLATFORM_HEALTH_UPDATED`, `BUS_RELAY_STATE_CHANGED`, `BUS_PLATFORM_READINESS_CHANGED` to Socket.io
- [ ] Handle `CTS_PLATFORM_COMMAND` with `PlatformCommand` type (startAll, startPlatform, stopAll, stopPlatform + privacy overrides)
- [ ] Validate ADMIN/AvPowerUser role for privacy overrides
- [ ] Emit initial state including platform readiness on client connect
- [ ] Register module in `index.ts` SocketGateway constructor
- [ ] Write unit tests

### Task 16: Implement OAuth callback routes and state management
- [ ] Create `packages/backend/src/routes/platformRoutes.ts`
- [ ] Implement `GET /api/auth/callback/youtube` and `GET /api/auth/callback/facebook`
- [ ] Implement OAuth state parameter: generate, store in `oauth_states` table, validate on callback, cleanup stale rows on startup and callback
- [ ] Implement `GET /api/admin/platforms` (list), `GET /api/admin/platforms/:platformType`, `PUT`, `DELETE`
- [ ] Implement `GET /api/platforms/health` (authenticated, any role)
- [ ] Wire routes in `index.ts`
- [ ] Write integration tests

### Task 17: Update `SessionManifestModule` for extended payload
- [ ] Update `emitInitialState()` to call `this.manifestService.getInterpolated()` instead of computing interpolation locally
- [ ] Remove `interpolateStreamTitle` import and `getTemplate()` call
- [ ] Update `register()` to forward the extended payload (now includes `interpolatedDescription` and `manifestReady`)
- [ ] Update tests

---

## Phase 3: Frontend — Store, Hooks, and Providers

### Task 18: Add `platformSlice` to Zustand store
- [ ] Create `packages/frontend/src/store/platformSlice.ts` with `PlatformSlice` interface
- [ ] Include `platformStates`, `relayState`, `platformReadiness` with initial values
- [ ] Include all setters: `setPlatformState`, `setRelayState`, `setPlatformHealth`, `setPlatformReadiness`
- [ ] Add to `AppStore` composition in `store/index.ts`
- [ ] Write tests

### Task 19: Create `platformSocketModule` and update `SocketProvider`
- [ ] Create `packages/frontend/src/providers/socketModules/platformSocketModule.ts`
- [ ] Register listeners for `STC_PLATFORM_STATE`, `STC_PLATFORM_HEALTH`, `STC_RELAY_STATE`, `STC_PLATFORM_READINESS`
- [ ] Register in `SocketProvider.tsx`
- [ ] Update existing `STC_SESSION_MANIFEST_UPDATED` handler to pass `interpolatedDescription` and `manifestReady`
- [ ] Write tests

### Task 20: Create `usePlatformState` hook
- [ ] Create `packages/frontend/src/hooks/usePlatformState.ts`
- [ ] Derive `isAnyStarting`, `isAnyStopping`, `isAnyStreaming` from platform states
- [ ] Implement `sendCommand` wrapper for `CTS_PLATFORM_COMMAND` Socket.io emit
- [ ] Write tests

---

## Phase 4: Frontend — Components

### Task 21: Modify `ObsWidget` and `ObsControls` for Manage Streams
- [ ] Remove stream start/stop handlers, confirmation modals, `hasMetadata` check, `streamDisabledReason` from `ObsWidget.tsx`
- [ ] Replace stream button in `ObsControls` with "Manage Streams" button
- [ ] Implement sub-label priority system (Req 12.4) using `manifestReady` from store
- [ ] Implement tap-to-open behavior: priorities 3/4 open SessionManifestModal, priorities 1/2 show Toast
- [ ] Implement "Starting…" spinner state on button during start sequence
- [ ] Add platform readiness icons below button (Ionicons `logo-youtube`, `logo-facebook` with status dots)
- [ ] Expand connection list to three entries: OBS, Relay, Stream
- [ ] Implement `deriveStreamStatus` for aggregate Stream indicator
- [ ] Implement relay popover text (4 states with context-aware inactive text)
- [ ] Update `ObsStatusBar` to read platform state for "Going Live…" / "Stopping…" states
- [ ] Update `ObsMetadataPreview`: add description preview row, increase height to `4.5rem`
- [ ] Remove `streamTitleTemplate` field from `ObsDeviceForm.tsx`
- [ ] Update all tests, remove dead code tests

### Task 22: Create `ManageStreamsModal`
- [ ] Create `packages/frontend/src/components/obs/ManageStreamsModal.tsx`
- [ ] Implement platform rows with status display per state (7 states with dots, labels, action buttons per design table)
- [ ] Implement "Start All" / "Stop All" buttons with disabled states
- [ ] Implement confirmation modals for Start All, Stop All, individual Start/Stop
- [ ] Implement YouTube privacy override dropdown (ADMIN/AvPowerUser only, greyed out for AvVolunteer)
- [ ] Implement Facebook privacy popover on wrapping div
- [ ] Implement "No streaming platforms configured" empty state
- [ ] Modal dismissable during operations, stays open after completion
- [ ] Add CSS classes: `platform-row`, `platform-status`
- [ ] Write tests

### Task 23: Modify `SessionManifestModal` for template selection
- [ ] Add template dropdowns (Title Format, Description Format) above metadata fields
- [ ] Fetch templates via `GET /api/templates` on modal open
- [ ] Implement auto-select logic per Req 4.1
- [ ] Implement dynamic field rendering based on selected template tokens
- [ ] Implement localStorage persistence for last-used template IDs
- [ ] Implement stale template handling (Req 4.13)
- [ ] Update live preview to use `interpolateTemplate()` with selected template's formatString
- [ ] Add description preview block below title preview
- [ ] Update `clear()` behavior: preserve template selections
- [ ] Write tests

### Task 24: Create `AdminIndexPage`
- [ ] Create `packages/frontend/src/pages/AdminIndexPage.tsx`
- [ ] Display card grid linking to all admin sections
- [ ] Add route `/admin` to `App.tsx`
- [ ] Update ADMIN post-login redirects in `LoginPage.tsx`, `ProtectedRoutes.tsx`, `ChangePasswordPage.tsx`, `App.tsx` catch-all
- [ ] Write tests

### Task 25: Update `GlobalTitleBar` for ADMIN users
- [ ] Add "Admin Pages" link visible only to ADMIN users, after dashboard label
- [ ] Dashboard label always links to Dashboard Selection Screen (not `/admin`)
- [ ] Define "CHANGE" as a UI constant
- [ ] Layout: `<Dashboard> (CHANGE) | Admin Pages ... <User> (<Role>) | LOGOUT`
- [ ] When no dashboard: `No Dashboard Selected (CHANGE) | Admin Pages ...`
- [ ] Write tests

### Task 26: Create `AdminTemplatesPage`
- [ ] Create `packages/frontend/src/pages/AdminTemplatesPage.tsx`
- [ ] Implement side-by-side scrollable lists (Title Templates / Description Templates)
- [ ] Show template name, roleMinimum badge, Edit/Delete buttons per item
- [ ] "None" template: no Edit/Delete, no role badge
- [ ] Implement delete confirmation modal with scrollable body for long format strings
- [ ] Implement create/edit modal with validate-then-save flow
- [ ] Single-line input for title templates, multi-line textarea for description templates
- [ ] Validation display: red blockers, amber warnings
- [ ] Add route `/admin/templates` to `App.tsx`
- [ ] Add CSS classes: `template-lists`, `template-list`, `template-list-scroll`, `template-item`
- [ ] Write tests

### Task 27: Create YouTube and Facebook platform admin pages
- [ ] Create `packages/frontend/src/pages/platforms/YouTubePlatformConfig.tsx`
- [ ] Create `packages/frontend/src/pages/platforms/FacebookPlatformConfig.tsx`
- [ ] Implement platform registry pattern for modular registration
- [ ] Each page: Connect button (OAuth flow), connected account display, Disconnect button
- [ ] YouTube: Privacy setting dropdown
- [ ] Facebook: Page selector dropdown (auto-select if single page)
- [ ] Add routes `/admin/platforms/youtube` and `/admin/platforms/facebook` to `App.tsx`
- [ ] Write tests

---

## Phase 5: Documentation & Cleanup

### Task 28: Update `docs/setup.md`
- [ ] Add FFmpeg prerequisite with minimum version recommendation
- [ ] Add `RELAY_PORT` environment variable documentation
- [ ] Add YouTube OAuth setup steps (Google Cloud Console, redirect URI with localhost)
- [ ] Add Facebook OAuth setup steps (Facebook Developer portal, redirect URI with localhost)
- [ ] Document localhost constraint for OAuth setup
- [ ] Add new admin routes: `/admin`, `/admin/templates`, `/admin/platforms/youtube`, `/admin/platforms/facebook`
- [ ] Document OBS codec requirement (H.264 + AAC for `-c copy` compatibility)

### Task 29: Integration tests (Playwright)
- [ ] `multi-platform-stream-start-flow.spec.ts`
- [ ] `multi-platform-stream-stop-flow.spec.ts`
- [ ] `multi-platform-individual-start-stop.spec.ts`
- [ ] `multi-platform-obs-disconnect.spec.ts`
- [ ] `multi-platform-ffmpeg-recovery.spec.ts`
- [ ] `manage-streams-button-states.spec.ts`
- [ ] `template-selection-flow.spec.ts`
- [ ] `template-admin-crud.spec.ts`
- [ ] `admin-index-navigation.spec.ts`
- [ ] `connection-status-four-state.spec.ts`
- [ ] Update existing Playwright fixtures with `interpolatedDescription` and `manifestReady` fields
