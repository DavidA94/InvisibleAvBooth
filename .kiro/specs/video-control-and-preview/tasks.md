# Implementation Tasks — Video Control and Preview

Tests are part of each task's definition of done. Unit tests follow the unit or component they cover. Integration tests exercise the full path from WebSocket/socket event to service response. Frontend component tests use React Testing Library. Backend E2E tests use the shared harness with in-memory SQLite and fake device clients.

---

## Phase 1: Shared Types & Infrastructure

- [x] 1. Add shared types — `CameraState`, `CameraPreset`, `CameraFeature`, `CameraModel`, `CameraMetadata`, `ObsMetadata` (extended with `ndiOutputName`), `PositionInquiry`, `CameraSetPayload` to `packages/shared/src/types/`
  - _Requirements: 3, 4, 6_

- [x] 2. Add socket event constants — `STC_CAMERA_STATE`, `STC_CAMERA_STATE_UPDATE`, `CTS_CAMERA_PTZ_MOVE_START`, `CTS_CAMERA_PTZ_MOVE_KEEPALIVE`, `CTS_CAMERA_PTZ_MOVE_STOP`, `CTS_CAMERA_SET`, `CTS_CAMERA_PRESET_ACTIVATE`, `CTS_CAMERA_PTZ_TAP_TO_CENTER` to `packages/shared/src/constants/socketEvents.ts`
  - _Requirements: 3_

- [x] 3. Add `BUS_CAMERA_STATE_CHANGED` constant and `CameraEventMap` to backend EventBus types. Extend root `EventMap`.
  - _Requirements: 3_

- [x] 4. Database schema — create `camera_presets` table with migration in `applySchema()`. Verify `device_connections.metadata` column already exists (no migration needed for camera config).
  - _Requirements: 6, 7_

- [x] 5. Write unit tests for schema — verify `camera_presets` table creation, cascade delete when parent device is removed, `sortOrder` ordering.
  - _Requirements: 6_

---

## Phase 2: Preview Infrastructure (Backend)

- [x] 6. Create `PreviewStreamManager` — FFmpeg hardware encoder probe at startup (VA-API → QSV → NVENC → libx264 ultrafast), INFO-level log of selected encoder, `PREVIEW_RESOLUTION` constant (1280×720), `MAX_PREVIEW_STREAMS` constant (4), `buildFfmpegArgs(input, encoder, withAudio)` function (OBS passes `withAudio: true`, cameras pass `false`).
  - _Requirements: 1_

- [x] 7. Implement WebSocket endpoint registration — `/preview/obs` and `/preview/camera/:cameraId` paths, cookie-based JWT authentication on upgrade, 4401 close code on invalid token, 4503 close code when max streams reached.
  - _Requirements: 1_

- [x] 8. Implement FFmpeg lifecycle — lazy spawn on first subscriber, 3-second grace period on last disconnect, fMP4 output flags, init segment (ftyp+moov) caching, fan-out to all subscribers.
  - _Requirements: 1_

- [x] 9. Implement FFmpeg failure handling — restart after 2s delay, max 3 consecutive failures then close all subscribers, OS scheduling priority lower than streaming forwarders.
  - _Requirements: 1_

- [x] 10. Implement `setSourceAvailable()` — called by ObsService (for OBS NDI output) and CameraService (for camera NDI feeds). Connects source availability to FFmpeg spawn readiness.
  - _Requirements: 1, 2_

- [x] 11. Register `/preview/*` route in Caddy config files (`Caddyfile` and `Caddyfile.dev`) alongside `/api/*` and `/socket.io/*`.
  - _Requirements: 1_

- [x] 11a. Implement FFmpeg PATH check at startup — verify `ffmpeg` is available on system PATH (shared with multi-platform-streaming relay check). If not found, log ERROR, emit persistent Banner, mark preview unavailable, widgets display error state.
  - _Requirements: 1_

- [x] 11b. Implement signal handler cleanup — register SIGINT/SIGTERM handlers that terminate all active FFmpeg preview child processes on graceful shutdown. For crash scenarios, document that orphaned FFmpeg processes self-terminate when their stdin pipe closes.
  - _Requirements: 1_

- [x] 12. Write unit tests for `PreviewStreamManager` — encoder probe parsing, lazy spawn/teardown timing, grace period behavior, fan-out to multiple subscribers, max streams enforcement, auth rejection.
  - _Requirements: 1_

- [x] 13. Write integration tests for preview WebSocket — full server with harness, authenticated connection receives init segment + data, unauthenticated connection rejected with 4401, subscriber count tracking, graceful shutdown cleanup.
  - _Requirements: 1_

---

## Phase 3: OBS Preview Widget (Frontend)

- [x] 14. Create `usePreviewStream` hook — accepts `endpoint` and `enabled` boolean (false when off-dashboard, disconnects WebSocket and releases resources). WebSocket lifecycle (connect/disconnect on mount/unmount and enabled change), MSE `MediaSource` + `SourceBuffer` management, buffer trim (>2s), seek-to-live-edge (>3s), exponential backoff reconnect (1s→2s→4s→10s max), tap-to-reconnect after 3 failures. Shared between OBS Preview and Camera widgets.
  - _Requirements: 1, 2_

- [x] 15. Create `ObsPreviewWidget` — `WidgetContainer` with "Feed" connection indicator, video element with `object-fit: contain` centering, inactive state ("OBS Preview Not Configured" / "OBS Preview Unavailable"), reconnecting overlay, tap-to-open modal.
  - _Requirements: 2_

- [x] 16. Create mute/unmute button overlay — 3rem × 3rem touch target, bottom-right positioned, semi-transparent background, Ionicons volume icons, "Local Audio" label, muted by default, resets on refresh.
  - _Requirements: 2_

- [x] 17. Create `StreamPreviewModal` — large modal titled "Stream Preview", shared WebSocket stream (no duplicate connection), mute button, dismiss button, shared audio state with widget.
  - _Requirements: 2_

- [x] 18. Add `obsPreviewSlice` to Zustand store — status derivation from WebSocket state and NDI source configuration.
  - _Requirements: 2_

- [x] 19. Update `seed-dashboard.ts` — add OBS Preview widget at (6,0) 2×2 with `roleMinimum: "AvVolunteer"`, idempotent check.
  - _Requirements: 8_

- [x] 20. Write unit tests for `usePreviewStream` hook — connection lifecycle, buffer management, reconnect backoff, tap-to-reconnect state transition, cleanup on unmount.
  - _Requirements: 1, 2_

- [x] 21. Write unit tests for `ObsPreviewWidget` — renders inactive state when NDI not configured, renders video when streaming, mute toggle behavior, tap opens modal, modal shares stream, connection indicator derivation.
  - _Requirements: 2_

---

## Phase 4: Camera HAL & Service (Backend)

- [x] 22. Create `CameraControlInterface` — TypeScript interface with `panTiltSpeed`, `panTiltAbsolute`, `zoomAbsolute`, `focusAuto`, `focusManual`, `stop`, `inquirePosition`, `connect`, `disconnect`, `isConnected`.
  - _Requirements: 3_

- [x] 22a. Implement NDI SDK dynamic loading — `import()` with try/catch for `grandiose`, ERROR log + persistent Banner on failure, camera features unavailable when NDI missing, rest of system unaffected. This is a prerequisite for NdiCameraDriver and NDI frame piping.
  - _Requirements: 1, 3_

- [x] 23. Create `NdiCameraDriver` implementing `CameraControlInterface` — dynamic `grandiose` import, NDI find + receive + `ptz_is_supported` probe, PTZ commands via NDI SDK, last-commanded position tracking, raw frame readable stream for preview pipeline.
  - _Requirements: 3_

- [x] 24. Create `ViscaCameraDriver` — TCP socket connection, binary VISCA packet construction/parsing, position inquiry commands (`CAM_PanTiltPosInq`, `CAM_ZoomPosInq`, `CAM_FocusPosInq`, `CAM_FocusAFModeInq`), ACK/Completion/Error handling, `CAM_PowerInq` probe, value normalization (16-bit ↔ float).
  - _Requirements: 3_

- [x] 25. Create `TongveoAiDriver` — HTTP POST to `/api/aiControl` (enable/disable with `ai_auto_zoom`/`ai_auto_tilt`), HTTP POST to `/api/setPTZCmd` (target selection, only on enable), cookie and credential from encrypted metadata, error handling with Toast notification.
  - _Requirements: 3_

- [x] 26. Create `CameraService` — initialize cameras from DB on startup, per-camera NDI driver + optional VISCA driver + optional AI driver, state management, 2s VISCA polling interval, position change detection and broadcast, reconnection with exponential backoff.
  - _Requirements: 3, 4_

- [x] 27. Implement dead-man's switch in `CameraService` — `startMove`/`keepAliveMove`/`stopMove`, 750ms timeout, session tracking, stale keepalive rejection, adaptive speed formula (`requestedSpeed * (1 - zoom * 0.7)`, capped at 0.6).
  - _Requirements: 3_

- [x] 28. Implement `cts:camera:set` handler in `CameraService` — partial state application (zoom, focus, autoFocus, aiTracking, aiTilt, aiZoom), AI driver invocation for tracking toggles, active preset clear on any manual change.
  - _Requirements: 3, 5, 6_

- [x] 29. Implement `tapToCenter` in `CameraService` — validate VISCA is configured (reject with Toast if not), FOV calculation using `fovWideAngle / (1 + zoom * (opticalZoomRatio - 1))`, absolute pan/tilt command, respect aiTilt disable.
  - _Requirements: 5_

- [x] 30. Implement `activatePreset` in `CameraService` — `storedOnCamera` recall vs. absolute position commands, toggle state application (including AI via driver), `activePresetId` broadcast immediately (optimistic), Toast on camera unreachable but active indicator still set (volunteer sees via preview whether it worked).
  - _Requirements: 6_

- [x] 31. Create `CameraSocketModule` — implements `SocketModule`, handles all CTS events, `emitInitialState` sends `{ cameras: CameraState[], ndiAvailable: boolean }`, subscribes to `BUS_CAMERA_STATE_CHANGED` for STC broadcasts, role validation (AvVolunteer limited to `zoom` in `cts:camera:set` — silently strips AI/focus fields).
  - _Requirements: 3, 5_

- [x] 32. Register `CameraService` and `CameraSocketModule` in `buildApp`. Wire NDI source availability into `PreviewStreamManager`.
  - _Requirements: 3, 4_

- [x] 33. Write unit tests for `NdiCameraDriver` — mock grandiose, verify PTZ command mapping, last-commanded tracking, connect/disconnect lifecycle.
  - _Requirements: 3_

- [x] 34. Write unit tests for `ViscaCameraDriver` — VISCA packet construction, response parsing, value normalization (float ↔ 16-bit), inquiry error handling (mark axis as unknown), probe success/failure.
  - _Requirements: 3_

- [x] 35. Write unit tests for `TongveoAiDriver` — enable sends aiControl + setPTZCmd, disable sends only aiControl (never setPTZCmd), cookie/credential in headers, HTTP failure handling.
  - _Requirements: 3_

- [x] 36. Write unit tests for `CameraService` — dead-man's switch (timeout stops camera, stale keepalive ignored), adaptive speed at various zoom levels, `cts:camera:set` partial application, tap-to-center FOV math, preset activation (onboard vs. software), active preset cleared on manual change, position polling interval, `activePresetId` is null on fresh startup (no position matching attempted), startup WARNING log emitted for NDI-only cameras (no VISCA).
  - _Requirements: 3, 5, 6_

- [x] 37. Write integration tests for camera socket events — full server with harness, `emitInitialState` returns camera states, `cts:camera:set` updates state and broadcasts, preset activation flow, role enforcement (volunteer cannot toggle AI), move:start/keepalive/stop lifecycle.
  - _Requirements: 3, 5, 6_

---

## Phase 5: Camera Widget (Frontend)

- [x] 38. Create `cameraSlice` in Zustand store — `cameraStates` record keyed by cameraId, `setCameraState`, `setAllCameraStates`, `clearActivePreset`.
  - _Requirements: 4_

- [x] 39. Create `cameraSocketModule` — register `STC_CAMERA_STATE` and `STC_CAMERA_STATE_UPDATE` listeners, wire to store.
  - _Requirements: 4_

- [x] 40. Create `CameraWidget` — `WidgetContainer` with "Camera" connection indicator, camera dropdown (react-select, disabled when 1 camera), `ResizeObserver` mode detection (compact vs expanded at 30rem × 20rem thresholds), full-widget overlay for offline/connecting states, localStorage camera persistence, camera switch transition (freeze last frame beneath "Connecting..." overlay until new stream's first frame arrives).
  - _Requirements: 4_

- [x] 41. Create `PtzJoystick` component — circular touch zone (min 7.5rem diameter), dead-zone ring indicator (15% radius, `color-border`), indicator dot tracking (`color-primary`), distance/angle → pan/tilt speed conversion, dead-zone enforcement, 0.05 quantization, mouse event support.
  - _Requirements: 5_

- [x] 42. Create `usePtzMove` hook — emits `move:start` on first touch outside dead-zone, 200ms keepalive interval with updated speed values, emits `move:stop` on touch release, cleanup on unmount.
  - _Requirements: 5_

- [x] 43. Create zoom slider — vertical `ion-range`, min-height 10rem, 0.0 (wide) to 1.0 (telephoto), reflects server state, emits `cts:camera:set` with zoom value on change.
  - _Requirements: 5_

- [x] 44. Create toggle row — AI Tracking, AI Tilt (visible when AI on), AI Zoom (visible when AI on), Auto Focus toggles. All using Ionic toggle pattern. Hidden for AvVolunteer. Emits `cts:camera:set` with the changed field.
  - _Requirements: 5_

- [x] 45. Create focus slider — horizontal `ion-range`, min-height 2.75rem, greyed out when auto-focus enabled, emits `cts:camera:set` with focus value. Visible only to ADMIN/AvPowerUser.
  - _Requirements: 5_

- [x] 46. Create `useDoubleTapToCenter` hook — 400ms double-tap detection, `touch-action: manipulation` requirement, coordinate calculation (-1 to 1), capability check (Toast if no VISCA), AI tracking check (Toast if active), emits `cts:camera:ptz:tap-to-center`.
  - _Requirements: 5_

- [x] 47. Create `CameraControlModal` — same layout as expanded mode, full-size video + all controls, opened from compact mode tap, shares WebSocket stream.
  - _Requirements: 4, 5_

- [x] 48. Integrate feature set gating — hide/disable controls based on `CameraState.features` array. Joystick horizontal disabled if no `pan`, vertical if no `tilt`, hidden if both missing. Zoom hidden if no `zoom`. Focus hidden if no `focus`. AI toggles hidden if no `ai-tracking` or camera model is Generic.
  - _Requirements: 5_

- [x] 49. Update `seed-dashboard.ts` — add Camera widget at (0,2) 6×4 with `roleMinimum: "AvVolunteer"`, idempotent check.
  - _Requirements: 8_

- [x] 50. Write unit tests for `PtzJoystick` — dead-zone produces (0,0), edge produces (1,0)/(0,1), diagonal angle correct, quantization snaps values, only emits on change, mouse event parity.
  - _Requirements: 5_

- [x] 51. Write unit tests for `usePtzMove` — start/keepalive/stop event sequence, 200ms interval, cleanup on unmount, updated values carried in keepalive.
  - _Requirements: 5_

- [x] 52. Write unit tests for `useDoubleTapToCenter` — single tap ignored, double tap within 400ms fires, second tap coordinates used, AI tracking Toast shown, no-VISCA Toast shown, resets after timeout.
  - _Requirements: 5_

- [x] 53. Write unit tests for `CameraWidget` — compact mode renders video only, expanded mode renders controls, mode switches at threshold, dropdown disabled with 1 camera, offline overlay covers entire widget, camera switching disconnects/reconnects, feature gating hides controls.
  - _Requirements: 4, 5_

---

## Phase 6: Presets & Admin Configuration (Frontend + Backend)

- [x] 54. Create `PresetList` component — scrollable list (3 visible), preset rows with name and Activate button (min-height 2.75rem), active preset highlighted with `color-primary`, emits `cts:camera:preset:activate`, Toast on activate, clears highlight on manual change.
  - _Requirements: 6_

- [x] 55. Create camera device admin panel — Camera Model dropdown (react-select: "Generic" / "Tongveo NVS20A-4KN"), NDI Source Name input, VISCA section (collapsible with toggle), FOV Wide Angle input, Optical Zoom Ratio input, AI Tracking Configuration section (visible when model ≠ Generic: cookie + credential inputs, encrypted storage), probe result display, no-VISCA informational note.
  - _Requirements: 7_

- [x] 56. Create Features section in admin panel — toggles for `pan`, `tilt`, `zoom`, `focus`, conditional AI toggles (`ai-tracking`, `ai-tracking-tilt`, `ai-tracking-zoom` only when model ≠ Generic), all default enabled.
  - _Requirements: 7_

- [x] 57. Create Presets section in admin panel — drag-to-reorder list, "On Camera"/"Software Only" badges, Edit/Delete buttons, Add Preset button.
  - _Requirements: 7_

- [x] 58. Create `PresetConfigModal` — Name input, Store on Camera toggle with slot number, live video preview, PTZ controls (joystick, zoom, toggles), Capture Position button with summary display, Save/Cancel.
  - _Requirements: 7_

- [x] 59. Implement preset REST endpoints — `GET/POST /api/admin/cameras/:cameraId/presets`, `PUT/DELETE /api/admin/cameras/:cameraId/presets/:presetId`, `PUT /api/admin/cameras/:cameraId/presets/order`, `POST /api/admin/cameras/:cameraId/capture-position`. All ADMIN-only. Broadcast updated preset list via Socket.io on mutation.
  - _Requirements: 7_

- [x] 60. Implement camera device CRUD validation — conditional validation when `deviceType === "camera-ptz"`: require `metadata.ndiSourceName`, validate `metadata.cameraModel` enum, store encrypted `aiHttpCookie`/`aiCredentialId`, default `host`/`port` to `"127.0.0.1"`/`5500` when VISCA not enabled.
  - _Requirements: 7_

- [x] 61. Write unit tests for `PresetList` — renders presets in sortOrder, activate button emits event and shows Toast, active highlight appears on state update, highlight clears on manual change, scrolls when >3 presets.
  - _Requirements: 6_

- [x] 62. Write unit tests for camera admin panel — model selection shows/hides AI config section, VISCA toggle shows/hides host/port fields, feature toggles conditionally rendered based on model, probe result display.
  - _Requirements: 7_

- [x] 63. Write unit tests for `PresetConfigModal` — capture position displays summary, null values show N/A, store-on-camera toggle reveals slot input, save emits correct payload.
  - _Requirements: 7_

- [x] 64. Write integration tests for preset REST endpoints — CRUD lifecycle, reorder persists sortOrder correctly, capture-position returns current camera state, cascade delete with parent device, ADMIN role enforcement (volunteer rejected), preset broadcast on mutation.
  - _Requirements: 6, 7_

- [x] 65. Write integration tests for camera device CRUD — create camera-ptz device with metadata, probe on save, NDI unavailable degrades gracefully, VISCA probe failure logs warning but device saves, encrypted fields not exposed in GET response.
  - _Requirements: 7_

---

## Phase 7: NDI SDK Integration & OBS Preview Backend

- [ ] 66. Implement NDI frame → FFmpeg stdin pipe — raw frame format detection from first frame metadata, `buildNdiInputArgs` with correct pixel format/resolution/framerate, backpressure handling (drop frames when pipe full).
  - _Requirements: 1, 4_

- [ ] 67. Implement OBS NDI preview source — read `ndiOutputName` from OBS device metadata, connect to OBS NDI output via grandiose receiver, pipe to PreviewStreamManager, handle DistroAV not enabled (mark source unavailable).
  - _Requirements: 2_

- [ ] 68. Add `ndiOutputName` field to OBS device admin panel — "NDI Output Name" input with placeholder `"OBS-MACHINE (OBS)"`, stored in OBS device metadata.
  - _Requirements: 2_

- [ ] 69. Update `docs/setup.md` — document DistroAV plugin installation, NDI output configuration in OBS, NDI SDK installation for camera features, how to obtain camera AI cookie/credential from browser dev tools (with stability warning).
  - _Requirements: 2, 7_

- [ ] 70. Write unit tests for NDI dynamic loading — graceful failure path (Banner emitted, cameras unavailable), success path (module cached).
  - _Requirements: 1_

- [ ] 71. Write unit tests for NDI frame pipe — format detection, backpressure drop behavior, correct FFmpeg input args for UYVY vs BGRA.
  - _Requirements: 1_

- [ ] 72. Write integration tests for OBS preview — full server, OBS device with `ndiOutputName` configured, preview WebSocket serves data when source available, serves nothing when source unavailable, connection indicator reflects state.
  - _Requirements: 2_

---

## Phase 8: Documentation

- [ ] 73. Update steering document — §0 (add grandiose + ws to Technology Stack), §1 (move Camera Control from Future to active scope), §3 (add Backend ↔ Preview Clients boundary with /preview/_ and Caddy routing), §7 (add exception note for /preview/_ raw binary transport).
  - _Requirements: Design doc — Steering Document Updates Required_

- [ ] 74. Implement NDI-only startup WARNING log — when CameraService initializes a camera without VISCA configured, emit WARNING: "Camera '{label}' uses NDI-only — position state is based on commanded values and may drift if the camera is controlled externally."
  - _Requirements: 3_
