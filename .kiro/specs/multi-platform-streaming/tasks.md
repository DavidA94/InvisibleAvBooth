# Tasks — Multi-Platform Streaming

All core tasks (1-29) are implemented. Remaining items are polish/enhancement subtasks noted below.

## Phase 1: Shared Infrastructure ✅
Tasks 1-6: All complete. Result type, ConnectionStatus, interpolateTemplate, SessionManifest extensions, DB tables, event constants.

## Phase 2: Backend Services ✅
Tasks 7-17: All complete. MetadataTemplateDao, validation, REST routes, SessionManifestService rewrite, ObsService relay-aware, RelayService, platform clients, StreamingPlatformService, StreamingPlatformModule, OAuth routes, SessionManifestModule.

## Phase 3: Frontend Store/Hooks/Providers ✅
Tasks 18-20: All complete. PlatformSlice, platformSocketModule, usePlatformState hook.

## Phase 4: Frontend Components ✅
Tasks 21-27: All complete. ObsWidget/ObsControls refactored, ManageStreamsModal, SessionManifestModal with template selection, AdminIndexPage, GlobalTitleBar admin link, AdminTemplatesPage, YouTube/Facebook config pages.

## Phase 5: Documentation & E2E ✅
Tasks 28-29: All complete. setup.md updated, Playwright fixtures and E2E tests created.

---

## Remaining Enhancement Subtasks (not blocking)

These are polish items from the original task spec that were deferred:

### Task 15 subtask
- [ ] Integration test (`streamingPlatformModule.integration.test.ts`): real Socket.io server, full command → service → event → broadcast path

### Task 21 subtasks
- [ ] Sub-label priority system (Req 12.4) — currently shows "Enter metadata" when not ready, but doesn't implement the full 4-level priority
- [ ] Tap-to-open behavior: priorities 3/4 open SessionManifestModal, priorities 1/2 show Toast
- [ ] "Starting…" spinner state on Manage Streams button during start sequence
- [ ] Platform readiness icons below button (Ionicons `logo-youtube`, `logo-facebook` with status dots)
- [ ] `deriveStreamStatus` for aggregate Stream indicator
- [ ] Relay popover text (4 states with context-aware inactive text)
- [x] Update `ObsStatusBar` for "Going Live…" / "Stopping…" states
- [x] Update `ObsMetadataPreview`: description preview row, height increase
- [x] Remove `streamTitleTemplate` field from `ObsDeviceForm.tsx`
- [ ] Property-based test P29

### Task 22 subtasks
- [ ] Per-platform action buttons (individual Start/Stop)
- [x] Confirmation modals for Start All, Stop All, individual Start/Stop
- [ ] YouTube privacy override dropdown (ADMIN/AvPowerUser only)
- [ ] Facebook privacy popover

### Task 23 subtasks
- [x] localStorage persistence for last-used template IDs
- [ ] Stale template handling (Req 4.13)
- [ ] Property-based test P26

### Task 24 subtask
- [x] Update ADMIN post-login redirects in `ChangePasswordPage.tsx` and `App.tsx` catch-all (LoginPage done)

### Task 27 subtasks
- [ ] Platform registry pattern for modular registration
- [ ] YouTube: Privacy setting dropdown on config page
- [ ] Facebook: Page selector dropdown (auto-select if single page)

### Task 29 subtasks — E2E tests not yet written
- [ ] `multi-platform-stream-start-flow.spec.ts`
- [ ] `multi-platform-stream-stop-flow.spec.ts`
- [ ] `multi-platform-individual-start-stop.spec.ts`
- [ ] `multi-platform-obs-disconnect.spec.ts`
- [ ] `multi-platform-ffmpeg-recovery.spec.ts`
- [ ] `template-admin-crud.spec.ts`
- [ ] Coverage threshold verification
