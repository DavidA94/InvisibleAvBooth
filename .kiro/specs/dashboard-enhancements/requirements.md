# Requirements Document — Dashboard Enhancements

## Introduction

This spec adds three small, independent features to the Invisible A/V Booth dashboard: (1) stereo audio level meters on the OBS Preview widget derived from the NDI audio tap, (2) a VISCA "Controls" connection status indicator on the Camera widget, and (3) a fullscreen toggle button in the global title bar.

This spec depends on the `video-control-and-preview` spec (OBS Preview widget, Camera widget, `PreviewStreamManager` audio pipeline, `CameraState`, `WidgetContainer` connection indicators).

These features share a common theme: improving operator confidence during live production. Audio meters provide instant visual confirmation that audio is reaching the stream. The VISCA status indicator surfaces camera control connectivity without requiring the operator to attempt a move. Fullscreen mode eliminates browser chrome on tablets, removing scroll and preventing accidental navigation away from the dashboard.

---

## Glossary

- **NDI Audio Tap**: The stereo PCM audio stream received from the OBS NDI output by the backend's GStreamer pipeline. This is the ground truth for what viewers will hear — it reflects all mixing, muting, routing, and filtering decisions made within OBS.
- **GStreamer `level` Element**: A GStreamer audio analysis element that computes per-channel peak and RMS amplitude values over configurable intervals and emits them as bus messages. Used here to derive dB levels without modifying the existing mono playback pipeline.
- **dBFS (Decibels Full Scale)**: A logarithmic amplitude scale where 0 dBFS is the maximum possible digital signal level. Silence is negative infinity; typical speech is around -20 to -12 dBFS; clipping occurs at 0 dBFS.
- **VISCA Connection**: The TCP socket connection to a camera's VISCA control port, used for all PTZ commands (pan, tilt, zoom, focus, presets). Separate from the NDI video feed.
- **Fullscreen API**: The browser's `document.documentElement.requestFullscreen()` / `document.exitFullscreen()` API, with `document.fullscreenEnabled` for feature detection.

---

## Requirements

### Requirement 1: OBS Preview Audio Level Meters

**User Story:** As a volunteer, I want to see stereo audio level meters on the OBS Preview widget that show what's actually reaching the stream, so that I can immediately detect if audio is missing, too quiet, or clipping — even when my local preview audio is muted.

#### Acceptance Criteria

1. THE Backend SHALL spawn a separate GStreamer pipeline (alongside the existing video and audio playback pipelines) for the OBS NDI source that uses the `level` element to compute per-channel peak amplitude at approximately 10 updates per second. The pipeline SHALL receive stereo audio from the same NDI source and SHALL NOT downmix — it measures the original left and right channels independently.

2. THE Backend SHALL parse the GStreamer `level` element's bus messages (emitted on stdout via the `-m` flag) to extract per-channel peak dB values. THE Backend SHALL use a coalescing strategy: if multiple level messages arrive in a single event loop tick (due to event loop stalls under load), only the most recent reading SHALL be emitted — stale intermediate values SHALL be discarded. THE Backend SHALL emit the latest values to connected dashboard clients via a new Socket.io event `stc:obs:audio:levels` with payload `{ left: number, right: number }` where values are in dBFS (0 = maximum, negative = quieter, -Infinity or a clamped floor for silence). Values outside the display range (-60 to 0 dBFS) SHALL be logged at DEBUG level before clamping, to aid diagnostics if unexpected values are observed.

3. THE `stc:obs:audio:levels` event SHALL be emitted to all connected clients (broadcast), not per-socket. THE event SHALL only be emitted when the OBS NDI preview source is active and the level pipeline is running. WHEN the level pipeline stops (OBS disconnects, no subscribers), audio level events SHALL cease. The event name constant SHALL be defined in `packages/shared/src/constants/socketEvents.ts`.

4. THE audio level pipeline SHALL be tied to the same lifecycle as the OBS preview pipeline — it starts when the first OBS preview subscriber connects and stops during the grace period teardown when the last subscriber disconnects. It SHALL NOT run independently of the preview system.

5. THE Frontend SHALL render two vertical bar indicators (left and right channels) on the right edge of the OBS Preview widget's content area. The bars SHALL be side by side with a small gap between them (~4px). The video element SHALL shrink horizontally to accommodate the meter area. The meter area width SHALL be fixed (approximately 1.5rem total for both bars plus gap).

6. THE bars SHALL represent a standard dB range from -60 dBFS (bottom) to 0 dBFS (top). Values below -60 SHALL be clamped to the bottom. The fill height SHALL be proportional to the dB value within this range (linear mapping of dB values, not linear mapping of amplitude).

7. THE bars SHALL use standard audio meter coloring with three color zones: green (below -12 dBFS), yellow (-12 to -3 dBFS), and red (-3 to 0 dBFS). The color zones SHALL be fixed positions on the meter (like markings on a physical meter), not applied to the current level only. The filled portion up to the current level SHALL show the appropriate zone colors; the unfilled portion above the current level SHALL be dark/transparent.

8. THE meters SHALL update smoothly at the rate events arrive (~10Hz). To provide visual feedback that the meters are receiving data, a brief peak-hold behavior SHALL be implemented: the highest peak in the last 1 second SHALL be displayed as a thin horizontal line (1-2px) at its maximum position, fading after 1 second. This is standard audio meter behavior.

9. THE meters SHALL function regardless of the local mute state. Muting the preview audio (the playback mute button) SHALL NOT affect the level meters. The meters show what is on the stream, not what the operator is hearing locally.

10. WHEN the OBS preview is not active (not connected, not configured, or preview WebSocket not receiving frames), THE meters SHALL not be visible. They SHALL appear whenever the level pipeline is running and producing data — this is independent of OBS streaming or recording state (the NDI output is available whenever DistroAV is enabled in OBS). WHEN the preview is active but no `stc:obs:audio:levels` event has been received within 500ms, THE Frontend SHALL set the meter bars to zero (bottom, no fill) and transition the "Audio" connection indicator to `unhealthy` (red). The meters SHALL remain visible — they do not disappear. This communicates "metering has stopped" rather than "meters don't exist." When events resume, the bars and indicator recover immediately.

10a. THE OBS Preview widget's `WidgetContainer` SHALL include an "Audio" connection status indicator in addition to the existing "Feed" indicator. The "Audio" indicator SHALL display: (a) green dot (`healthy`) when audio level events are being received (regardless of whether audio signal is present or silent — receiving data means the metering pipeline is working), (b) red dot (`unhealthy`) when the level pipeline has stalled (no events received for >500ms while the preview is active — the metering system is broken), (c) grey dot (`inactive`) when the level pipeline is not running (GStreamer `level` element unavailable or preview not connected). This gives the volunteer an at-a-glance signal that audio metering is operational. Silence (all channels at -60 dBFS) is a valid healthy state — the volunteer can see the bars are at zero and decide if that's intentional.

11. THE meters SHALL be labeled with small text "L" and "R" below each bar (or at the bottom) for accessibility and clarity.

12. THE meters SHALL include a subtle "nominal range" visual reference between -18 dBFS and -12 dBFS — the standard broadcast target range for speech (per EBU R128 loudness guidelines). This SHALL be rendered as a slightly lighter background band or subtle tick marks on the meter track, providing a visual anchor for "levels should be around here" without requiring the volunteer to understand dB values. This is standard practice in professional audio meters and broadcast DAWs.

13. THE Frontend SHALL store audio level values in a Zustand store slice (or extend the existing `obsPreviewSlice`) so that the meter component can subscribe reactively.

14. THE Backend SHALL verify the GStreamer `level` element is available at startup by executing `gst-inspect-1.0 level`. IF the element is unavailable, THE Backend SHALL log a WARNING ("GStreamer 'level' element not found — audio metering unavailable. Install gstreamer1.0-plugins-good.") and skip level pipeline spawning. Audio meters will simply never appear on the frontend — graceful degradation with no impact on video preview.

15. THE level pipeline SHALL use the same crash recovery strategy as the video preview pipeline: on unexpected exit, restart after a 2-second delay if the parent OBS preview pipeline is still running. After 3 consecutive failed starts, enter a "dormant" state and stop retrying. WHEN a new OBS preview subscriber connects (signaling the NDI source is likely available again), THE retry counter SHALL be reset and the level pipeline SHALL be re-attempted. This ensures meters recover after transient issues (e.g., OBS restart mid-service) without requiring a backend restart. THE `killProcess` method that tears down the OBS preview source SHALL also terminate the level pipeline process to prevent orphaned processes.

16. THE level pipeline SHALL NOT count against the `MAX_PREVIEW_STREAMS` limit. It is a measurement-only process that produces no video output and has no WebSocket subscribers. It is architecturally distinct from preview streams — exempt from the cap. This ensures that audio metering does not reduce the number of available camera preview slots.

#### Integration Tests

17. **Backend Integration Test:** THE test SHALL configure a fake GStreamer spawn that emits simulated `level` element output on stdout containing known peak dB values for left and right channels. A connected socket client SHALL receive `stc:obs:audio:levels` events with the correct parsed values. THE test SHALL verify: (a) independent left and right values are correctly parsed and emitted (e.g., left=-20, right=-6), (b) identical left and right values are correctly parsed, (c) silence (very low dB) is correctly represented, (d) no events are emitted when no preview subscribers are connected, (e) level pipeline crash triggers restart and meters resume after recovery.

18. **Frontend Integration Test (Playwright):** THE test SHALL mock the Socket.io connection to deliver `stc:obs:audio:levels` events with known values. THE test SHALL verify: (a) the meter bars reach the expected visual height proportional to the dB value, (b) left and right meters move independently when given different values, (c) meters are not visible before first level event is received, (d) meters continue to display when local audio is muted, (e) on staleness (500ms no events), meters remain visible with bars at zero and Audio indicator shows unhealthy (red), (f) meters and indicator recover immediately when events resume.

---

### Requirement 2: Camera VISCA "Controls" Status Indicator

**User Story:** As a volunteer, I want to see at a glance whether the camera's PTZ controls are connected, so that I know before attempting a move whether it will work.

#### Acceptance Criteria

1. THE `CameraState` shared type SHALL be extended with a new field `viscaConnected: boolean`. This field SHALL be `true` when the VISCA TCP connection to the camera is established, and `false` when disconnected or never connected.

2. THE Backend `CameraService` SHALL update `viscaConnected` based on the `ViscaCameraDriver.isConnected()` state. It SHALL be set to `true` after a successful VISCA `connect()` call, and set to `false` when the TCP socket emits `close` or `error` events. Changes to `viscaConnected` SHALL trigger a `BUS_CAMERA_STATE_CHANGED` event so the frontend is updated in real time. THE `ViscaCameraDriver` SHALL expose an `onDisconnect` callback that the `CameraService` registers during initialization, providing sub-second disconnect detection rather than waiting for the next 5-second poll cycle. Additionally, WHEN any VISCA command fails with a connection error (socket closed, timeout, ECONNRESET), THE `CameraService` SHALL immediately set `viscaConnected = false` and broadcast the state change — the poll cycle is a backup detection path, not the primary one.

3. THE Frontend Camera widget SHALL include a "Controls" entry in its `WidgetContainer` connections array, in addition to the existing "Camera" (NDI preview) indicator. The "Controls" indicator SHALL display: (a) green dot (`healthy`) when `viscaConnected === true`, (b) red dot (`unhealthy`) when `viscaConnected === false`.

4. THE "Controls" indicator SHALL only be included in the connections array when the camera has VISCA-dependent features that would be visible to the current user. Specifically, it SHALL appear when the camera's feature set includes any of: `pan`, `tilt`, `zoom`, or `focus`. If the camera has no VISCA-utilizing features enabled (e.g., an NDI-only camera with no PTZ controls), THE "Controls" indicator SHALL NOT appear.

5. THE `viscaConnected` field SHALL default to `false` for cameras where `viscaEnabled` is `false` in the metadata. For such cameras, the "Controls" indicator does not appear (per criterion 4), so the field value is irrelevant to the UI but maintains type consistency.

6. WHEN VISCA reconnects (auto-reconnect on next command attempt or polling cycle), THE `viscaConnected` field SHALL be updated to `true` and broadcast to clients immediately.

6a. THE `viscaConnected` state transition to `false` SHALL require 2 consecutive failures (command error or poll failure) before broadcasting the disconnected state to clients. A single transient error SHALL NOT flip the indicator to red — it must be confirmed by a second failure. This prevents the indicator from flapping red→green→red on brief network hiccups, which would erode volunteer trust in the indicator. The transition back to `true` (reconnection) has no debounce — a single successful command or poll immediately restores the healthy state.

#### Integration Tests

7. **Backend Integration Test:** THE test SHALL configure a camera with VISCA enabled, verify that `viscaConnected` is `true` after successful connection, simulate a VISCA socket disconnect, and verify that the `stc:camera:state:update` event broadcasts `viscaConnected: false`. THE test SHALL also verify the field returns to `true` on reconnection.

8. **Frontend Integration Test (Playwright):** THE test SHALL verify: (a) when `viscaConnected: true` and the camera has PTZ features, the "Controls" indicator shows a green/healthy dot with the text "Controls", (b) when `viscaConnected: false`, the indicator shows a red/unhealthy dot, (c) when the camera has NO VISCA-using features (empty features array or only non-VISCA features), the "Controls" indicator does NOT appear regardless of `viscaConnected` value, (d) when `viscaEnabled` is `false` in metadata (NDI-only camera), no "Controls" indicator appears.

---

### Requirement 3: Fullscreen Toggle Button

**User Story:** As a volunteer using a tablet, I want to put the dashboard into fullscreen mode with one tap, so that I don't have to scroll and the browser chrome doesn't take up screen space.

#### Acceptance Criteria

1. THE Frontend SHALL render a fullscreen toggle button in the `GlobalTitleBar` component, positioned to the left of the username display. The button SHALL be a touch-friendly size (minimum 2.5rem × 2.5rem) with clear visual affordance.

2. THE button SHALL use Ionic icons via `IonIcon`: `expand-outline` when NOT in fullscreen (tapping will enter fullscreen), and `contract-outline` when IN fullscreen (tapping will exit fullscreen). No additional icon dependency is needed — Ionic's `ionicons` package is already part of the project.

3. WHEN the user taps the button while not in fullscreen, THE Frontend SHALL call `document.documentElement.requestFullscreen()` to enter fullscreen mode. WHEN the user taps the button while in fullscreen, THE Frontend SHALL call `document.exitFullscreen()` to exit fullscreen mode. Both calls SHALL be wrapped in a try/catch — `requestFullscreen()` and `exitFullscreen()` return Promises that may reject (due to permissions policy, user gesture requirements, or iOS WebView restrictions). On rejection, the error SHALL be silently caught and no state change applied; the `fullscreenchange` event will not fire, so the button icon remains consistent.

4. THE Frontend SHALL listen to the `fullscreenchange` event on `document` to detect fullscreen state changes triggered by external means (e.g., user pressing Escape, browser keyboard shortcut, or OS-level gesture). The button icon SHALL always reflect the actual current fullscreen state, not just the last action taken by the button.

5. THE button SHALL only be rendered when fullscreen is supported by the browser. THE Frontend SHALL check `document.fullscreenEnabled` (and the webkit-prefixed variant `document.webkitFullscreenEnabled` for Safari) on mount. IF fullscreen is not supported, the button SHALL not be rendered at all — no disabled state, no placeholder, no space consumed.

6. THE button SHALL use a subtle styling consistent with the title bar's existing elements — not a prominent colored button. It should feel like a utility affordance, not a primary action. Use `fill="clear"` / transparent background with the icon in `color-text-muted`, brightening to `color-text` on hover/active.

7. THE fullscreen state SHALL NOT be persisted across page loads. On refresh, the page returns to normal (non-fullscreen) mode, and the button shows the `expand-outline` icon.

#### Integration Tests

8. **Frontend Integration Test (Playwright):** THE test SHALL verify: (a) the fullscreen button is visible in the title bar when `document.fullscreenEnabled` is true, (b) clicking the button calls `requestFullscreen` and the icon changes to `contract-outline`, (c) clicking the button again calls `exitFullscreen` and the icon changes back to `expand-outline`, (d) when fullscreen is exited via other means (simulating `fullscreenchange` event), the icon updates to `expand-outline` without the button being clicked, (e) when `document.fullscreenEnabled` is false (mocked), the button is not rendered, (f) when `requestFullscreen` rejects (e.g., permissions policy), no error is thrown and the icon remains unchanged.

---

## Technical Notes

### Audio Level Pipeline (Req 1)

The existing `PreviewStreamManager` spawns two pipelines for the OBS source: video (MJPEG) and audio (mono PCM for playback). The audio level metering requires a third lightweight pipeline using GStreamer's `level` element:

```
ndisrc ndi-name="..." ! decodebin ! audioconvert ! audio/x-raw,channels=2 ! level interval=100000000 ! fakesink
```

The `level` element posts bus messages with peak and RMS values per channel at the configured interval (100ms = 10Hz). These messages are emitted on GStreamer's bus and captured by the backend via the `-m` (message) flag which outputs structured level data to stdout. The backend uses Node's `readline` interface on the stdout stream to guarantee line-complete input to the parser, regardless of OS stdout buffering behavior.

The pipeline does not output audio data — it only measures. `fakesink` discards the actual samples after measurement. This means zero additional bandwidth to clients and minimal CPU overhead.

The level pipeline is measurement-only and does NOT count against `MAX_PREVIEW_STREAMS`. It has no WebSocket subscribers and produces no video output — it is architecturally distinct from preview streams.

The `level` element is part of `gstreamer1.0-plugins-good`. If unavailable, audio metering degrades gracefully (meters never appear) with no impact on video preview functionality.

**What the meters represent:** The NDI output from DistroAV is OBS's program output — post-mixing, post-effects, post-routing. It is the same audio signal sent to the RTMP relay and on to streaming platforms. The meters show what viewers will hear.

### Fullscreen Icons (Req 3)

The fullscreen button uses Ionic's built-in `expand-outline` and `contract-outline` icons via `IonIcon`. No additional icon dependency is needed.

### Scope Boundaries

- These features do not modify the database schema.
- These features do not add new REST endpoints.
- These features do not require new admin configuration pages.
- These features do not add new npm dependencies (Ionic icons already in project).
- The audio level feature extends the existing `PreviewStreamManager` with an additional pipeline and adds a new Socket.io event.
- The VISCA status feature extends an existing shared type and adjusts frontend rendering logic.
- The fullscreen feature is purely frontend with no backend involvement.
