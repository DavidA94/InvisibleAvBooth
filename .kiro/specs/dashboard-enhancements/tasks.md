# Implementation Tasks — Dashboard Enhancements

Tests are part of each task's definition of done. Unit tests follow the unit or component they cover. Integration tests exercise the full path from socket event to client response. Frontend component tests use React Testing Library. Backend E2E tests use the shared harness with in-memory SQLite and fake device clients.

---

## Phase 1: Shared Types & Constants

- [x] 1. Add `STC_OBS_AUDIO_LEVELS` constant to `packages/shared/src/constants/socketEvents.ts`.
  - _Requirements: 1.3_

- [x] 2. Add `viscaConnected: boolean` field to `CameraState` interface in `packages/shared/src/types/camera.ts`.
  - _Requirements: 2.1_

- [x] 3. Add `BUS_OBS_AUDIO_LEVELS` constant to `packages/backend/src/eventBus/types.ts`.
  - _Requirements: 1.3_

- [x] 4. Add test ID constants to `packages/frontend/src/constants/testIds.ts`: `TEST_ID_AUDIO_METER_CONTAINER`, `TEST_ID_AUDIO_METER_LEFT`, `TEST_ID_AUDIO_METER_RIGHT`, `TEST_ID_FULLSCREEN_BUTTON`.
  - _Requirements: 1.5, 3.1_

---

## Phase 2: Backend — Audio Level Pipeline

- [x] 5. Implement `gst-inspect-1.0 level` availability check in `PreviewStreamManager.initialize()`. If unavailable, log WARNING and set a flag (`levelElementAvailable`) to skip level pipeline spawning. Include `levelElementAvailable` in the existing device capabilities broadcast (`STC_DEVICE_CAPABILITIES`) under a `preview.audioMetering` field so the frontend can set `obsLevelPipelineAvailable`.
  - _Requirements: 1.14_

- [x] 6. Add `levelProcess` field to `PreviewSource` interface. Implement `spawnLevelPipeline(source)` and `killLevelPipeline(source)` methods on `PreviewStreamManager`. The pipeline uses `gst-launch-1.0 -m -q ndisrc ... ! decodebin ! audioconvert ! audio/x-raw,channels=2 ! level interval=100000000 post-messages=true ! fakesink`. Gated by `source.withAudio && this.levelElementAvailable`.
  - _Requirements: 1.1, 1.4_

- [x] 7. Implement level message parser using Node `readline` on the level process stdout. Parse `peak, GstValueList:(double)X, (double)Y` regex. Implement coalescing via `queueMicrotask` — only emit the most recent reading per event loop tick. Log out-of-range values at DEBUG. Clamp to [-60, 0]. Emit parsed values on EventBus as `BUS_OBS_AUDIO_LEVELS`.
  - _Requirements: 1.2_

- [x] 8. Implement level pipeline crash recovery — restart after 2s delay if parent OBS preview pipeline is still running, max 3 consecutive failures then dormant. Reset retry counter when a new OBS preview subscriber connects. Ensure `killProcess` kills all three pipelines (video, audio playback, level).
  - _Requirements: 1.15_

- [x] 9. Wire level pipeline lifecycle into `spawnPipeline`/`killProcess` — spawn alongside audio playback pipeline (gated by `withAudio`), kill on source teardown. Verify level pipeline does NOT count against `MAX_PREVIEW_STREAMS`.
  - _Requirements: 1.4, 1.16_

- [x] 10. Extend `ObsModule.register(io)` to subscribe to `BUS_OBS_AUDIO_LEVELS` and broadcast `STC_OBS_AUDIO_LEVELS` to all connected clients.
  - _Requirements: 1.3_

- [x] 11. Write unit tests for level message parsing — independent L/R values, identical values, silence (`-inf` → -60), out-of-range clamping, malformed lines ignored, coalescing (multiple lines per tick → only latest emitted).
  - _Requirements: 1.2, 1.17_

- [x] 12. Write unit tests for level pipeline lifecycle — spawned when OBS preview starts (with `withAudio`), not spawned when `levelElementAvailable` is false, killed on source teardown, crash recovery respects 3-attempt limit, retry counter reset on new subscriber, not counted in `getActiveStreams()`.
  - _Requirements: 1.4, 1.14, 1.15, 1.16_

- [x] 13. Write backend integration test (`tests/integration/gateway/audio-levels.test.ts`) — fake spawn emits simulated level output, socket client receives correct `stc:obs:audio:levels` events. Verify: independent L/R values, identical values, silence clamping, no events when no preview subscribers, level pipeline crash triggers restart and events resume, stops retrying after 3 failures, does not count against MAX_PREVIEW_STREAMS, after entering dormant state (3 failures) a new preview subscriber resets retry counter and re-attempts level pipeline spawn.
  - _Requirements: 1.17_

---

## Phase 3: Backend — Camera VISCA Status

- [x] 14. Add `onDisconnect` callback field to `ViscaCameraDriver`. Invoke the callback on socket `close` and `error` events (alongside existing `this.connected = false`).
  - _Requirements: 2.2_

- [x] 15. Update `CameraService` initialization — set `viscaConnected` in `CameraState` after `connect()` result. Register `onDisconnect` callback on each VISCA driver for immediate disconnect detection. Implement 2-consecutive-failure debounce (`viscaFailureCounts` map) — single failure increments counter, second consecutive failure broadcasts `viscaConnected: false`. Any success resets counter and broadcasts `viscaConnected: true`.
  - _Requirements: 2.2, 2.6, 2.6a_

- [x] 16. Update poll cycle in `CameraService.pollPosition()` — on `isConnected() === false`, increment failure counter (respecting debounce). On successful poll, call `handleViscaSuccess`. Ensure VISCA command failures (in `startMove`, `applySet`, etc.) also trigger `handleViscaFailure`.
  - _Requirements: 2.2_

- [x] 17. Update all places that construct `CameraState` objects (initialization, `reloadCamera`, hot-reload) to include `viscaConnected: false` as the default value.
  - _Requirements: 2.5_

- [x] 18. Write unit tests for VISCA disconnect detection — `onDisconnect` callback triggers `handleViscaFailure`, debounce requires 2 failures before broadcast, single failure does not broadcast, successful command resets counter, poll cycle backup detection works.
  - _Requirements: 2.2, 2.6a_

- [x] 19. Write backend integration test (extend `tests/integration/camera/camera.test.ts`) — verify `viscaConnected: true` after successful connect, `viscaConnected: false` after socket disconnect (via onDisconnect), immediate detection on command failure, reconnection restores `viscaConnected: true`, poll cycle as backup.
  - _Requirements: 2.7_

---

## Phase 4: Frontend — Audio Level Meter

- [x] 20. Extend `ObsPreviewSlice` with `obsAudioLevels: { left: number; right: number } | null`, `obsAudioEventsFlowing: boolean`, `obsLevelPipelineAvailable: boolean`, and corresponding setters.
  - _Requirements: 1.13_

- [x] 21. Extend `obsSocketModule.ts` — register `STC_OBS_AUDIO_LEVELS` handler that calls `setObsAudioLevels`. Handle `STC_DEVICE_CAPABILITIES` event to read `preview.audioMetering` field and set `obsLevelPipelineAvailable`.
  - _Requirements: 1.3, 1.14_

- [x] 22. Create `AudioLevelMeter` component (`packages/frontend/src/components/obs-preview/AudioLevelMeter.tsx`) — two vertical bars (L/R), fixed 1.5rem width container, CSS gradient with clip-path for fill level, three color zones (green < -12, yellow -12 to -3, red -3 to 0 dBFS), `dBToPercent` conversion, "L"/"R" labels, nominal range indicator band at 70-80% height (-18 to -12 dBFS).
  - _Requirements: 1.5, 1.6, 1.7, 1.11, 1.12_

- [x] 23. Implement peak-hold logic in `AudioLevelMeter` — track highest peak per channel over rolling 1-second window, render as 2px horizontal line at peak position, decay to -60 after 1 second of no new peak.
  - _Requirements: 1.8_

- [x] 24. Implement staleness timeout in `AudioLevelMeter` (or a parent wrapper) — 500ms timer reset on each level event. On timeout: set `obsAudioEventsFlowing: false`, set meter bars to zero (no fill). On event resume: restore bars and set `obsAudioEventsFlowing: true`. Meters remain visible throughout — never disappear.
  - _Requirements: 1.10_

- [x] 25. Update `ObsPreviewWidget` layout — wrap video in a `.preview-video-area` flex child, add `AudioLevelMeter` as sibling on the right. Meters only render when `obsAudioLevels !== null` (first event received). Add CSS for flex row layout, meter container sizing.
  - _Requirements: 1.5, 1.9, 1.10_

- [x] 26. Add "Audio" connection indicator to `ObsPreviewWidget` — update `WidgetContainer` connections array to include `{ label: "Audio", status }` derived from `obsLevelPipelineAvailable` and `obsAudioEventsFlowing`. Green = events flowing, red = stale (500ms timeout), grey = level element unavailable.
  - _Requirements: 1.10a_

- [x] 27. Write unit tests for `AudioLevelMeter` — correct fill height for known dB values, color zones at correct positions, peak hold appears and decays, L/R labels rendered, nominal range band present, meters at zero when levels are { left: -60, right: -60 }.
  - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.11, 1.12_

- [x] 28. Write unit tests for staleness timeout — timer resets on event, bars go to zero after 500ms, `obsAudioEventsFlowing` transitions to false, recovery on event resume.
  - _Requirements: 1.10_

- [x] 29. Write unit tests for `ObsPreviewWidget` with meters — meters not visible before first level event, meters visible after first event, meters persist when muted, Audio indicator reflects event flow state.
  - _Requirements: 1.9, 1.10, 1.10a_

- [x] 30. Write Playwright e2e test (`playwright/e2e/obs-audio-meters.spec.ts`) — mock socket delivers level events, verify meter fill heights proportional to dB, L/R meters move independently, meters not visible before first event, meters visible when muted, staleness behavior (bars to zero + red Audio indicator), nominal range band position.
  - _Requirements: 1.18_

---

## Phase 5: Frontend — Camera VISCA Status

- [ ] 31. Update `CameraWidget` — replace single `deriveConnection` with `deriveConnections` returning an array. Include "Controls" indicator when `hasViscaFeatures(state.features)` is true (`features` includes any of `pan`, `tilt`, `zoom`, `focus`). Status derived from `state.viscaConnected`.
  - _Requirements: 2.3, 2.4_

- [ ] 32. Update `CameraWidget` unit tests — verify "Controls" indicator present when PTZ features exist and `viscaConnected` is true/false, verify "Controls" NOT present when no VISCA features, verify "Controls" NOT present for NDI-only camera (empty features).
  - _Requirements: 2.8_

- [ ] 33. Write Playwright e2e test (extend `playwright/e2e/camera-widget.spec.ts`) — mock camera state with various feature/viscaConnected combinations, verify Controls indicator appears/disappears correctly, verify dot color matches healthy/unhealthy.
  - _Requirements: 2.8_

---

## Phase 6: Frontend — Fullscreen Toggle

- [ ] 34. Create `FullscreenButton` component (`packages/frontend/src/components/FullscreenButton.tsx`) — feature detection via `document.fullscreenEnabled` (+ webkit prefix), return null if unsupported. State tracks `document.fullscreenElement`. Listen to `fullscreenchange`/`webkitfullscreenchange` events. Toggle calls `requestFullscreen()`/`exitFullscreen()` in try/catch. Icons: `expandOutline`/`contractOutline` from ionicons via `IonIcon`. Styling: transparent background, `color-text-muted` → `color-text` on hover, 2.5rem × 2.5rem touch target.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

- [ ] 35. Integrate `FullscreenButton` into `GlobalTitleBar` — render immediately before the username span (after `fill-remaining`).
  - _Requirements: 3.1_

- [ ] 36. Write unit tests for `FullscreenButton` — renders when `fullscreenEnabled` is true, returns null when false, icon toggles on fullscreenchange event, toggle calls requestFullscreen/exitFullscreen, handles rejection gracefully (no throw), aria-label changes with state.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 37. Write unit tests for `GlobalTitleBar` with fullscreen button — button present in expected position, does not break existing title bar layout/tests.
  - _Requirements: 3.1_

- [ ] 38. Write Playwright e2e test (`playwright/e2e/fullscreen-toggle.spec.ts`) — button visible when fullscreenEnabled, click enters fullscreen and icon changes, second click exits and icon reverts, external fullscreen exit updates icon, button hidden when fullscreenEnabled is false, requestFullscreen rejection handled gracefully.
  - _Requirements: 3.8_
