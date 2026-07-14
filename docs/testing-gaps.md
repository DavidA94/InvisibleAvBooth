# Integration Test Gap Tracking

This document tracks identified gaps in integration/E2E test coverage across the Invisible A/V Booth system. Gaps are organized by domain and severity. Each gap references the spec requirement it should cover.

**Last reviewed:** 2026-07-13

---

## Status Legend

- ❌ Not implemented
- 🔄 In progress
- ✅ Implemented

---

## Backend Integration Test Gaps

### Session Manifest Service (High Priority)

| #   | Gap                                                                                                                                                                      | Spec Reference               | Status |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------- | ------ |
| B1  | Manifest update with `titleTemplateId`/`descriptionTemplateId` verifies `interpolatedStreamTitle`, `interpolatedDescription`, `manifestReady` are computed and broadcast | Multi-platform Req 4.8, 4.10 | ✅     |
| B2  | `{verseText}` interpolation — multi-verse formatting, verse 0 handling, single verse formatting                                                                          | Multi-platform Req 9         | ✅     |
| B3  | `{Scripture}` token — verse 0 display as chapter-only, range starting at verse 0 displayed starting at 1                                                                 | Multi-platform Req 3.3       | ✅     |
| B4  | Manifest clear preserves template selections                                                                                                                             | Multi-platform design note   | ✅     |
| B5  | `manifestReady` calculation (title template selected + all tokens have non-empty values)                                                                                 | Multi-platform Req 4.10      | ✅     |
| B6  | Missing/invalid `titleTemplateId`/`descriptionTemplateId` (referencing deleted templates)                                                                                | Multi-platform Req 4.13      | ✅     |

### Streaming Platform Service — Recovery & State Machine (High Priority)

| #   | Gap                                                                                                    | Spec Reference          | Status |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------- | ------ |
| B7  | FFmpeg forwarder auto-recovery (exit → retry with backoff → poll health → recover or fail)             | Multi-platform Req 5.4  | ✅     |
| B8  | "Recovering" state (OBS reconnects to relay → platform API polled → transitions to streaming or error) | Multi-platform Req 5.10 | ✅     |
| B9  | 30-second timeout on platform start steps                                                              | Multi-platform Req 6.9  | ❌     |
| B10 | OBS not connected → reject entire start request immediately                                            | Multi-platform Req 6.10 | ✅     |
| B11 | Stop-platform with API retry logic (3 retries with backoff on end-broadcast failure)                   | Multi-platform Req 7.4  | ❌     |
| B12 | OBS stream stopped when all platforms reach idle                                                       | Multi-platform Req 7.7  | ✅     |
| B13 | Start individual platform from Error state ends previous broadcast first                               | Multi-platform Req 7.3  | ✅     |
| B14 | Stream health polling and health state broadcasts                                                      | Multi-platform Req 8    | ❌     |

### Lower-Third Service (High Priority)

| #   | Gap                                                                                   | Spec Reference        | Status |
| --- | ------------------------------------------------------------------------------------- | --------------------- | ------ |
| B15 | Template-derived library recomputation when manifest changes (items appear/disappear) | Lower-thirds Req 4.3  | ✅     |
| B16 | Auto-dismiss timer firing when overlay disconnected (phase advances server-side)      | Lower-thirds Req 4.6  | ❌     |
| B17 | 5-second phase timeout safety fallback (overlay unresponsive → force-advance)         | Lower-thirds Req 4.13 | ❌     |
| B18 | `addToLibrary` with Scripture type — verse lookup, KJV validation                     | Lower-thirds Req 3.10 | ❌     |
| B19 | Page-next / page-previous commands (paginated scripture navigation)                   | Lower-thirds Req 5.4  | ❌     |
| B20 | Transition lock enforcement (reject activate/dismiss while animation in progress)     | Lower-thirds Req 4.7  | ❌     |
| B21 | Overlay reconnect receiving `skipEntrance: true` when item was visible                | Lower-thirds Req 8.9  | ❌     |
| B22 | `remove-from-library` command                                                         | Lower-thirds Req 5.5  | ❌     |
| B23 | `edit-library-item` command                                                           | Lower-thirds Req 5.5  | ❌     |
| B24 | Overlay disconnect → `overlayStale` flag after 15 seconds                             | Lower-thirds Req 8.8  | ❌     |

### Camera Service (High Priority)

| #   | Gap                                                                               | Spec Reference   | Status |
| --- | --------------------------------------------------------------------------------- | ---------------- | ------ |
| B25 | Dead-man's switch (keepalive timeout → auto-stop issued)                          | Video Req 3.11   | ✅     |
| B26 | Preset activation — stored-on-camera vs software-only recall strategy             | Video Req 6.3    | ✅     |
| B27 | Preset activation applying toggle states (autoFocus, aiTracking, etc.)            | Video Req 6.4    | ✅     |
| B28 | `activePresetId` clearing when manual movement occurs                             | Video Req 6.6    | ✅     |
| B29 | Adaptive speed calculation (speed scaled by zoom level)                           | Video Req 3.10   | ❌     |
| B30 | Tap-to-center calculation (FOV-based offset → absolute position)                  | Video Req 5.9    | ❌     |
| B31 | AI tracking HTTP API calls (Tongveo model-specific driver)                        | Video Req 3.13   | ❌     |
| B32 | Hot-reload bus events (`BUS_CAMERA_DEVICE_CHANGED`, `BUS_CAMERA_PRESETS_CHANGED`) | Architecture doc | ❌     |

### Other Backend Gaps (Medium/Low Priority)

| #   | Gap                                                                     | Spec Reference          | Status |
| --- | ----------------------------------------------------------------------- | ----------------------- | ------ |
| B33 | Lower-third templates excluded from `GET /api/templates`                | Lower-thirds Req 3.5    | ❌     |
| B34 | Relay crash detection and restart logic (up to 3 attempts)              | Multi-platform Req 5.7  | ❌     |
| B35 | Relay state broadcast to clients (running/obsConnected)                 | Multi-platform Req 5.11 | ❌     |
| B36 | Verse text fetch by range (used by `{verseText}` interpolation)         | Multi-platform Req 9    | ❌     |
| B37 | `MAX_PREVIEW_STREAMS` limit enforcement (connection rejected with 4503) | Video Req 1.14          | ❌     |
| B38 | Hardware encoder probe at startup (fallback to software)                | Video Req 1.4           | ❌     |

---

## Frontend E2E Test Gaps

### OBS Widget — Recording (High Priority)

| #   | Gap                                                                   | Spec Reference      | Status |
| --- | --------------------------------------------------------------------- | ------------------- | ------ |
| F1  | Start Recording flow (button click → pending state → confirmed state) | Livestream Req 8.4  | ❌     |
| F2  | Stop Recording with confirmation modal                                | Livestream Req 8.11 | ❌     |
| F3  | Recording button disabled while command pending                       | Livestream Req 8.5  | ❌     |

### Socket Disconnect/Reconnect UX (High Priority)

| #   | Gap                                                                | Spec Reference      | Status |
| --- | ------------------------------------------------------------------ | ------------------- | ------ |
| F4  | "Connection lost — reconnecting…" banner on socket disconnect      | Livestream Req 23.1 | ❌     |
| F5  | Controls disabled while socket disconnected                        | Livestream Req 23.2 | ❌     |
| F6  | Reconnect → state refresh → banner dismissed → toast "Reconnected" | Livestream Req 23.4 | ❌     |

### Session Manifest Modal (High Priority)

| #   | Gap                                                                                | Spec Reference             | Status |
| --- | ---------------------------------------------------------------------------------- | -------------------------- | ------ |
| F7  | Template selection workflow (select title → select description → fields appear)    | Multi-platform Req 4.1-4.3 | ❌     |
| F8  | "Select title and description formats above to continue" message before selections | Multi-platform Req 4.2     | ❌     |
| F9  | Union of tokens across templates → one input per unique token                      | Multi-platform Req 4.3     | ❌     |
| F10 | Save button disabled until required fields filled                                  | Multi-platform Req 4.7     | ❌     |
| F11 | Field values preserved when switching templates                                    | Multi-platform Req 4.6     | ❌     |
| F12 | Scripture reference input (book search, chapter/verse validation)                  | Livestream Req 19          | ❌     |
| F13 | Save action → spinner → ack timeout → inline error                                 | Livestream Req 9.7         | ❌     |
| F14 | Metadata preview row showing interpolated title / "No session details set"         | Livestream Req 8.13        | ❌     |

### Dashboard & Navigation (High Priority)

| #   | Gap                                                           | Spec Reference          | Status |
| --- | ------------------------------------------------------------- | ----------------------- | ------ |
| F15 | ADMIN auto-redirect to `/admin` on login                      | Multi-platform Req 11.3 | ❌     |
| F16 | Invalid cached dashboard → cleared + toast + selection screen | Livestream Req 5.8      | ❌     |

### Manage Streams Modal — Error States (Medium Priority)

| #   | Gap                                                                                   | Spec Reference          | Status |
| --- | ------------------------------------------------------------------------------------- | ----------------------- | ------ |
| F17 | "No streaming platforms configured" message                                           | Multi-platform Req 6.2  | ❌     |
| F18 | Platform error state display and restart                                              | Multi-platform Req 7.3  | ❌     |
| F19 | "No Source" state display during OBS relay disconnect                                 | Multi-platform Req 5.10 | ❌     |
| F20 | "Starting…" spinner on button during start sequence                                   | Multi-platform Req 6.12 | ❌     |
| F21 | Priority sub-labels: "Streaming unavailable", "OBS not connected", "Select templates" | Multi-platform Req 12.4 | ❌     |
| F22 | Tapping disabled button opens manifest modal (priorities 3/4) vs toast (1/2)          | Multi-platform Req 12.5 | ❌     |

### Lower-Third Widget (High Priority)

| #   | Gap                                                                  | Spec Reference        | Status |
| --- | -------------------------------------------------------------------- | --------------------- | ------ |
| F23 | Active section display (item, dismiss button, countdown)             | Lower-thirds Req 5.3  | ❌     |
| F24 | Library section display (template-derived + volunteer-added, sorted) | Lower-thirds Req 5.5  | ❌     |
| F25 | Show (preview dialog) → "Go Live" activation                         | Lower-thirds Req 5.13 | ❌     |
| F26 | Add button → type dropdown → dialog → save to library                | Lower-thirds Req 5.10 | ❌     |
| F27 | Scripture pagination controls (Previous/Next buttons)                | Lower-thirds Req 5.4  | ❌     |
| F28 | Empty state messages ("Nothing active" / "No items available")       | Lower-thirds Req 5.17 | ❌     |
| F29 | Overlay connection status indicator states                           | Lower-thirds Req 5.1  | ❌     |

### Camera Widget (High Priority)

| #   | Gap                                                      | Spec Reference    | Status |
| --- | -------------------------------------------------------- | ----------------- | ------ |
| F30 | Camera dropdown selector switching between cameras       | Video Req 4.2     | ❌     |
| F31 | Virtual joystick interaction (drag → move commands sent) | Video Req 5.2-5.3 | ❌     |
| F32 | Zoom slider interaction                                  | Video Req 5.4     | ❌     |
| F33 | Preset list display and activation                       | Video Req 6.1-6.2 | ❌     |
| F34 | Compact vs expanded mode based on widget size            | Video Req 4.4-4.5 | ❌     |
| F35 | Camera offline state display                             | Video Req 4.9     | ❌     |
| F36 | Double-tap-to-center on video                            | Video Req 5.9     | ❌     |

### OBS Preview Widget (Medium Priority)

| #   | Gap                                                   | Spec Reference    | Status |
| --- | ----------------------------------------------------- | ----------------- | ------ |
| F37 | Widget rendering with video feed placeholder          | Video Req 2       | ❌     |
| F38 | Mute/unmute button interaction                        | Video Req 2.7-2.8 | ❌     |
| F39 | Tap-to-expand modal                                   | Video Req 2.9     | ❌     |
| F40 | "OBS Preview Not Configured" / "Unavailable" messages | Video Req 2.4     | ❌     |

### Admin Pages (Medium Priority)

| #   | Gap                                                                    | Spec Reference         | Status |
| --- | ---------------------------------------------------------------------- | ---------------------- | ------ |
| F41 | Platform Management page (list, detail, OAuth)                         | Multi-platform Req 1.4 | ❌     |
| F42 | Template Management page (three sections, create/edit/delete/validate) | Multi-platform Req 3.5 | ❌     |
| F43 | Camera Device configuration (model, features, NDI/VISCA)               | Video Req 7.1          | ❌     |
| F44 | Camera Presets management (list, reorder, add/edit/delete)             | Video Req 7.5-7.6      | ❌     |

### Notification System (Medium Priority)

| #   | Gap                                                     | Spec Reference      | Status |
| --- | ------------------------------------------------------- | ------------------- | ------ |
| F45 | Banner display with counter navigation ("Error 1 of 3") | Livestream Req 10.3 | ❌     |
| F46 | Banner auto-clear on resolution event from backend      | Livestream Req 10.5 | ❌     |

### Overlay (All Deferred)

| #   | Gap                                                           | Spec Reference        | Status |
| --- | ------------------------------------------------------------- | --------------------- | ------ |
| F47 | Show command → renders lower-third → reports phases           | Lower-thirds Req 6    | ❌     |
| F48 | Dismiss command → exit animation → reports phases → DOM empty | Lower-thirds Req 6.5  | ❌     |
| F49 | Push-up transition → content swap                             | Lower-thirds Req 6.6  | ❌     |
| F50 | Scripture measurement → PageBreakdown response                | Lower-thirds Req 7    | ❌     |
| F51 | Disconnect timeout → overlay locally dismisses after 15s      | Lower-thirds Req 1.10 | ❌     |
| F52 | Reconnect with skipEntrance → immediate render                | Lower-thirds Req 8.9  | ❌     |
| F53 | Force Clear → instant hide                                    | Lower-thirds Req 5.8  | ❌     |
| F54 | Resolution telemetry → isCorrect: false at wrong viewport     | Lower-thirds Req 2.4  | ❌     |
| F55 | OBS disconnect during stream → catastrophic modal             | Livestream Req 8.6    | ❌     |

---

## Implementation Priority Order

### Phase 1 — Core Backend Gaps (B1–B6, B15, B25–B26)

Session manifest interpolation, lower-third template recomputation, camera dead-man's switch and presets.

### Phase 2 — Streaming Recovery (B7–B13)

FFmpeg recovery, recovering state, stop-with-retry.

### Phase 3 — Frontend Core Flows (F1–F6, F15)

Recording, socket disconnect/reconnect, ADMIN redirect.

### Phase 4 — Frontend Session Manifest (F7–F14)

Template selection, field generation, scripture input.

### Phase 5 — Remaining Backend (B16–B32)

Lower-third edge cases, camera state machine details.

### Phase 6 — Frontend Widgets (F23–F36)

Lower-third widget, camera widget.

### Phase 7 — Medium/Low Priority (all remaining)

Admin pages, OBS preview, notifications, overlay.
