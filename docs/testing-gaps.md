# Integration Test Gap Tracking

This document tracks identified gaps in integration/E2E test coverage across the Invisible A/V Booth system. Gaps are organized by domain and severity. Each gap references the spec requirement it should cover.

**Last reviewed:** 2026-07-14

---

## Status Legend

- ❌ Not implemented
- ✅ Implemented
- ~~Strikethrough~~ = Confirmed covered by another test or not applicable

---

## Completed Summary

| Area                | Tests Added   | Files                                   |
| ------------------- | ------------- | --------------------------------------- |
| Backend integration | 88 tests      | 7 new files across `tests/integration/` |
| Frontend Playwright | 33 tests      | 8 new files in `playwright/e2e/`        |
| **Total**           | **121 tests** | **15 new test files**                   |

Backend total: 345 tests across 26 files.
Frontend Playwright total: 53 tests, 0 failures, 9 skipped (overlay deferred).

---

## Backend Integration Test Gaps

### Session Manifest Service — ✅ Complete

All 6 gaps (B1–B6) covered in `manifest-interpolation.test.ts` (21 tests).

### Streaming Platform Service — Mostly Complete

| #   | Gap                                                             | Spec Reference          | Status | Notes                                                                                                    |
| --- | --------------------------------------------------------------- | ----------------------- | ------ | -------------------------------------------------------------------------------------------------------- |
| B7  | FFmpeg forwarder auto-recovery (exit → retry → recover or fail) | Multi-platform Req 5.4  | ✅     | `streaming-recovery.test.ts`                                                                             |
| B8  | "Recovering" state (OBS reconnects → poll → streaming or error) | Multi-platform Req 5.10 | ✅     |                                                                                                          |
| B9  | 30-second timeout on platform start steps                       | Multi-platform Req 6.9  | ❌     | Requires fake timers or long test; low value vs complexity                                               |
| B10 | OBS not connected → reject entire start request                 | Multi-platform Req 6.10 | ✅     |                                                                                                          |
| B11 | Stop-platform endBroadcast retry (3 attempts with backoff)      | Multi-platform Req 7.4  | ❌     | Implementation now correct (IG5 fixed); needs dedicated test with fake timers to verify 4 retry attempts |
| B12 | OBS stream stopped when all platforms reach idle                | Multi-platform Req 7.7  | ✅     |                                                                                                          |
| B13 | Start from Error state ends previous broadcast                  | Multi-platform Req 7.3  | ✅     |                                                                                                          |
| B14 | Stream health polling and broadcasts                            | Multi-platform Req 8    | ✅     | `medium-priority.test.ts`                                                                                |

### Lower-Third Service — Mostly Complete

| #   | Gap                                                       | Spec Reference        | Status | Notes                                                                                                                                          |
| --- | --------------------------------------------------------- | --------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| B15 | Template-derived library recomputation                    | Lower-thirds Req 4.3  | ✅     | `lower-third-templates.test.ts`                                                                                                                |
| B16 | Auto-dismiss timer fires when overlay disconnected        | Lower-thirds Req 4.6  | ✅     | `lower-third-edge-cases.test.ts`                                                                                                               |
| B17 | 5-second phase timeout fallback                           | Lower-thirds Req 4.13 | ✅     | `medium-priority.test.ts`                                                                                                                      |
| B18 | addToLibrary with Scripture type                          | Lower-thirds Req 3.10 | ✅     |                                                                                                                                                |
| B19 | Page-next / page-previous commands                        | Lower-thirds Req 5.4  | ✅     |                                                                                                                                                |
| B20 | Transition lock enforcement                               | Lower-thirds Req 4.7  | ✅     |                                                                                                                                                |
| B21 | Overlay reconnect with skipEntrance                       | Lower-thirds Req 8.9  | ✅     |                                                                                                                                                |
| B22 | `remove-from-library` command                             | Lower-thirds Req 5.5  | ❌     | Simple CRUD — `removeFromLibrary(itemId)` returns success/error. Test: volunteer item removed, template item rejected, active item rejected.   |
| B23 | `edit-library-item` command                               | Lower-thirds Req 5.5  | ❌     | `editLibraryItem(itemId, patch)` — test: updates content, rejects template items, rejects active items, triggers re-measurement for Scripture. |
| B24 | Overlay disconnect → `overlayStale` flag after 15 seconds | Lower-thirds Req 8.8  | ❌     | `setOverlayConnected(false)` starts 15s timer → sets `overlayStale: true`. Requires waiting 15s or fake timers.                                |

### Camera Service — ✅ Complete

All 8 gaps (B25–B32) covered in `deadman-presets.test.ts` (9 tests) and `advanced-features.test.ts` (17 tests).

### Other Backend Gaps

| #   | Gap                                                      | Spec Reference          | Status  | Notes                                                                                                                                                |
| --- | -------------------------------------------------------- | ----------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| B33 | Lower-third templates excluded from `GET /api/templates` | Lower-thirds Req 3.5    | ✅      | `medium-priority.test.ts`                                                                                                                            |
| B34 | Relay crash detection and restart (up to 3 attempts)     | Multi-platform Req 5.7  | ❌      | `RelayService` monitors NMS health; on crash, restarts up to 3× with 5s delays. Low priority — relay crashes are rare.                               |
| B35 | Relay state broadcast to clients                         | Multi-platform Req 5.11 | ✅      | `medium-priority.test.ts`                                                                                                                            |
| B36 | Verse text fetch by range                                | Multi-platform Req 9    | ~~N/A~~ | Covered by B2 (`{verseText}` interpolation queries KJV directly)                                                                                     |
| B37 | `MAX_PREVIEW_STREAMS` limit enforcement                  | Video Req 1.14          | ❌      | `PreviewStreamManager` rejects with close code 4503 when limit reached. Test: connect MAX+1 WebSockets, verify last one closed.                      |
| B38 | Hardware encoder probe at startup                        | Video Req 1.4           | ❌      | `PreviewStreamManager` runs `gst-inspect-1.0` for each encoder. Test: verify fallback to x264enc when all probes fail (already happens in test env). |

---

## Frontend E2E (Playwright) Test Gaps

### OBS Widget — ✅ Recording Complete

F1–F3 covered in `recording-flow.spec.ts` (4 tests).

### Socket Disconnect/Reconnect — Mostly Complete

| #   | Gap                                    | Spec Reference      | Status | Notes                                                                                                                                                         |
| --- | -------------------------------------- | ------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F4  | "Connection lost" banner on disconnect | Livestream Req 23.1 | ✅     | `socket-disconnect-reconnect.spec.ts`                                                                                                                         |
| F5  | Controls disabled while disconnected   | Livestream Req 23.2 | ❌     | Implementation now exists (IG2 fixed). Test needs: disconnect → verify record button is disabled. The button gets `isPending={true}` when `!socketConnected`. |
| F6  | Reconnect → banner dismissed           | Livestream Req 23.4 | ✅     |                                                                                                                                                               |

### Session Manifest Modal — Partially Complete

| #   | Gap                                                   | Spec Reference         | Status | Notes                                                                                                                                                                                 |
| --- | ----------------------------------------------------- | ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F7  | Template dropdowns visible + message before selection | Multi-platform Req 4.1 | ✅     | `template-selection-flow.spec.ts`                                                                                                                                                     |
| F8  | "Select a title format" message                       | Multi-platform Req 4.2 | ✅     | Same file as F7                                                                                                                                                                       |
| F9  | Fields appear after template auto-selection           | Multi-platform Req 4.3 | ✅     |                                                                                                                                                                                       |
| F10 | Save button + fields present, user can fill           | Multi-platform Req 4.7 | ✅     |                                                                                                                                                                                       |
| F11 | Field values preserved when switching templates       | Multi-platform Req 4.6 | ❌     | Requires interacting with react-select dropdowns (complex in Playwright). Test: select template A, fill Speaker, switch to template B, switch back to A, verify Speaker still filled. |
| F12 | Scripture reference input (book search, validation)   | Livestream Req 19      | ❌     | Requires the ScriptureReferenceInput component + react-select interaction for book search. Complex UI interaction.                                                                    |
| F13 | Save action → spinner → ack timeout → inline error    | Livestream Req 9.7     | ❌     | Test: click Save, don't ack from socket mock, wait 5s, verify inline error appears. Requires custom socket mock that delays/omits ack.                                                |

### Dashboard & Navigation — Mostly Complete

| #   | Gap                                        | Spec Reference          | Status | Notes                                                                                                                             |
| --- | ------------------------------------------ | ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------- |
| F15 | ADMIN auto-redirect to `/admin`            | Multi-platform Req 11.3 | ✅     | `admin-login-redirect.spec.ts`                                                                                                    |
| F16 | Invalid cached dashboard → cleared + toast | Livestream Req 5.8      | ❌     | Test: set invalid dashboard ID in localStorage before login, verify toast "Invalid Dashboard" appears and selection screen shown. |

### Manage Streams Modal — Partially Complete

| #   | Gap                                          | Spec Reference          | Status | Notes                                                                                                                                                           |
| --- | -------------------------------------------- | ----------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F17 | "No streaming platforms configured" message  | Multi-platform Req 6.2  | ✅     | `manage-streams-errors.spec.ts`                                                                                                                                 |
| F18 | Platform row visible in modal                | Multi-platform Req 7.3  | ✅     |                                                                                                                                                                 |
| F19 | "No Source" state display                    | Multi-platform Req 5.10 | ❌     | Test: push `stc:platform:state` with `status: "no_source"`, open modal, verify "No Source" text visible.                                                        |
| F20 | "Starting…" spinner on button during start   | Multi-platform Req 6.12 | ❌     | Test: send startAll command, before ack arrives verify button shows spinner. Tricky timing.                                                                     |
| F21 | Button sub-label when manifest not ready     | Multi-platform Req 12.4 | ✅     |                                                                                                                                                                 |
| F22 | Tapping disabled button opens manifest modal | Multi-platform Req 12.5 | ❌     | IonButton disabled-click behavior doesn't propagate in Playwright. May need the implementation to use `onClick` with internal guard instead of HTML `disabled`. |

### Lower-Third Widget — Mostly Complete

| #   | Gap                           | Spec Reference        | Status | Notes                                                                                                       |
| --- | ----------------------------- | --------------------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| F23 | Active section display        | Lower-thirds Req 5.3  | ✅     | `lower-third-widget.spec.ts`                                                                                |
| F24 | Library section display       | Lower-thirds Req 5.5  | ✅     |                                                                                                             |
| F25 | Show button sends activate    | Lower-thirds Req 5.13 | ✅     |                                                                                                             |
| F26 | Add to library flow           | Lower-thirds Req 5.10 | ✅     |                                                                                                             |
| F27 | Scripture pagination controls | Lower-thirds Req 5.4  | ❌     | Test: push state with paginated active scripture item, verify Previous/Next buttons, verify page info text. |
| F28 | Empty state messages          | Lower-thirds Req 5.17 | ✅     |                                                                                                             |
| F29 | Overlay connection indicator  | Lower-thirds Req 5.1  | ✅     |                                                                                                             |

### Camera Widget — Partially Complete

| #   | Gap                                | Spec Reference    | Status | Notes                                                                                                                                               |
| --- | ---------------------------------- | ----------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| F30 | Camera dropdown selector           | Video Req 4.2     | ❌     | react-select doesn't forward `data-testid` in real browser. Need to interact via aria-label or class selectors.                                     |
| F31 | Virtual joystick interaction       | Video Req 5.2-5.3 | ❌     | Test: simulate pointer events on `[data-testid="ptz-joystick"]`, verify socket sends `cts:camera:ptz:move:start`. Complex pointer event simulation. |
| F32 | Zoom slider interaction            | Video Req 5.4     | ❌     | Test: interact with `[data-testid="camera-zoom-slider"]` ion-range, verify `cts:camera:set` with zoom value.                                        |
| F33 | Preset list display and activation | Video Req 6.1-6.2 | ✅     | `camera-widget.spec.ts` (via compact mode → modal)                                                                                                  |
| F34 | Compact vs expanded mode           | Video Req 4.4-4.5 | ❌     | Test: render at different viewport sizes, verify mode switch. Requires `page.setViewportSize()`.                                                    |
| F35 | Camera offline state               | Video Req 4.9     | ✅     |                                                                                                                                                     |
| F36 | Double-tap-to-center               | Video Req 5.9     | ❌     | Test: dispatch two rapid click events on video, verify `cts:camera:ptz:tap-to-center` sent.                                                         |

### OBS Preview Widget (Low Priority)

| #   | Gap                                       | Spec Reference    | Status | Notes                                                           |
| --- | ----------------------------------------- | ----------------- | ------ | --------------------------------------------------------------- |
| F37 | Widget renders with video feed            | Video Req 2       | ❌     | Requires WebSocket binary stream mock. Low value for E2E.       |
| F38 | Mute/unmute button                        | Video Req 2.7-2.8 | ❌     | Unit test covers this; E2E adds little value.                   |
| F39 | Tap-to-expand modal                       | Video Req 2.9     | ❌     |                                                                 |
| F40 | "Not Configured" / "Unavailable" messages | Video Req 2.4     | ❌     | Test: push camera state with no NDI configured, verify message. |

### Admin Pages (Low Priority)

| #   | Gap                         | Spec Reference         | Status | Notes                                                                   |
| --- | --------------------------- | ---------------------- | ------ | ----------------------------------------------------------------------- |
| F41 | Platform Management page    | Multi-platform Req 1.4 | ❌     | Test: navigate to /admin/platforms, mock API, verify list renders.      |
| F42 | Template Management page    | Multi-platform Req 3.5 | ❌     | Test: navigate to /admin/templates, verify three sections render.       |
| F43 | Camera Device configuration | Video Req 7.1          | ❌     | Test: device form with camera-ptz type, verify NDI/VISCA fields appear. |
| F44 | Camera Presets management   | Video Req 7.5-7.6      | ❌     | Test: preset list, add/edit/delete/reorder.                             |

### Notification System (Low Priority)

| #   | Gap                                        | Spec Reference      | Status | Notes                                                                   |
| --- | ------------------------------------------ | ------------------- | ------ | ----------------------------------------------------------------------- |
| F45 | Banner counter navigation ("Error 1 of 3") | Livestream Req 10.3 | ❌     | Test: push multiple banners, verify counter and navigation arrows.      |
| F46 | Banner auto-clear on resolution event      | Livestream Req 10.5 | ❌     | Test: push banner, then push resolution event, verify banner dismissed. |

### Overlay Page (All Deferred)

These tests require a full browser rendering of the overlay page with real animations. They are skipped in the existing test file (`overlay.spec.ts`) and deferred to when the overlay implementation stabilizes.

| #   | Gap                                                       | Spec Reference        |
| --- | --------------------------------------------------------- | --------------------- |
| F47 | Show command → renders lower-third → reports phases       | Lower-thirds Req 6    |
| F48 | Dismiss command → exit animation → phases → DOM empty     | Lower-thirds Req 6.5  |
| F49 | Push-up transition → content swap                         | Lower-thirds Req 6.6  |
| F50 | Scripture measurement → PageBreakdown response            | Lower-thirds Req 7    |
| F51 | Disconnect timeout → overlay locally dismisses after 15s  | Lower-thirds Req 1.10 |
| F52 | Reconnect with skipEntrance → immediate render            | Lower-thirds Req 8.9  |
| F53 | Force Clear → instant hide                                | Lower-thirds Req 5.8  |
| F54 | Resolution telemetry → isCorrect: false at wrong viewport | Lower-thirds Req 2.4  |
| F55 | OBS disconnect during stream → catastrophic modal         | Livestream Req 8.6    |

---

## Implementation Gaps — All Resolved

| #   | Spec Requirement                                                  | Resolution                                                                                           |
| --- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| IG1 | Video Req 6.6 — startMove clears activePresetId                   | **Fixed.** Added to `CameraService.startMove()`.                                                     |
| IG2 | Livestream Req 23.2 — controls disabled on socket disconnect      | **Fixed.** Added `socketConnected` to store; ObsWidget disables controls when `!socketConnected`.    |
| IG3 | Lower-thirds Req 4.6 — auto-dismiss + overlay disconnect          | **Verified working** in B16 test.                                                                    |
| IG4 | Multi-platform Req 5.4 — FFmpeg recovery with exponential backoff | **Fixed.** `onForwarderExited` now retries 3× with 2s/4s/8s backoff.                                 |
| IG5 | Multi-platform Req 7.4 — endBroadcast retry on stop               | **Fixed.** `stopSinglePlatform` retries 4× (immediate + 2s + 4s + 8s).                               |
| IG6 | Video Req 3.10 — MAX_EFFECTIVE_SPEED global cap                   | **Confirmed implemented.** `applyAdaptiveSpeed` uses `Math.min(abs, 0.6)`.                           |
| IG7 | Video Req 4.2 — Camera dropdown always rendered                   | **Fixed.** Removed `cameras.length > 1` guard; dropdown always renders, disabled when single camera. |

---

## Priority Guide for Future Work

**If you have 1 hour:** B22, B23 (simple CRUD tests for lower-third remove/edit commands)

**If you have 2 hours:** F5 (controls disabled — now implementable), F19 (no-source state), F27 (scripture pagination UI)

**If you have a day:** F30-F32 (camera joystick/zoom interactions — complex pointer events), F41-F44 (admin pages — straightforward but many routes to mock)

**Defer indefinitely:** F47-F55 (overlay page — requires animation testing infrastructure that doesn't exist yet)
