# Implementation Tasks — Sound Board Control

Tests are part of each task's definition of done (steering `testing.md`) — a feature task is not complete until its associated test task passes. Unit/component tests (Vitest + RTL) follow the unit they cover; property-based tests use fast-check in the same file. Backend E2E tests use the shared `buildTestServer()` harness with in-memory SQLite and fakes (`createFakeMixer()`, `createFakeAudioCapture()`). Frontend E2E uses Playwright with mocked HTTP + WebSocket. No live mixer or audio hardware is available — everything is mocked at the abstraction boundary.

All work is committed directly to `main` (no feature branch). `npm run ci` must pass before any commit. Mark tasks complete in this file before committing.

---

## Phase 1: Shared Types, Constants & Registry

- [x] 1. Add shared mixer types — `MixerModel`, `MixerFeature`, `MixerCapabilities`, `MixerChannelState`, `MixerState`, `MixerPresetSummary`, `MixerPresetPayload`, `MixerChannelLevel`, `EnvelopePair`, `MixerCommand` in `packages/shared/src/types/mixer.ts`; export from `index.ts`.
  - _Requirements: 1, 2, 10, 11_

- [x] 2. Add `mixerTaper.ts` — `faderFloatToDb`, `faderDbToFloat`, `FADER_TICKS_DB`. Property-based tests: round-trip within tolerance, monotonic, endpoints (0.0→−∞, ~0.75→~0 dB, 1.0→+10 dB).
  - _Requirements: 2.6, 5.3_

- [x] 3. Add `constants/mixer.ts` — `LEVEL_AXIS_MIN_DBFS`/`MAX_DBFS`, `GAIN_WINDOW_MAX_HEIGHT_REM`, `CONTROL_SUPPRESS_MS`, `CONTROL_THROTTLE_MS`, `ENVELOPE_PAIRS_PER_SEC`, `OSC_PORT_DEFAULT`, `XREMOTE_RENEW_MS`, `METERS_RENEW_MS`, `METERS_BANK_CHANNEL_PREFADER`, `METERS_BANK_PREAMP_IN`, `NOISE_FLOOR_DBFS`, `MIXER_PROBE_TIMEOUT_MS`, `READBACK_TIMEOUT_MS`, `READBACK_MAX_RETRIES`, `CONTROLS_FRESHNESS_MS`; export.
  - _Requirements: 2, 4, 7, 8, 9, 12_

- [x] 4. Add socket event constants — `STC_MIXER_STATE`, `STC_MIXER_STATE_UPDATE`, `STC_MIXER_LEVELS`, `STC_MIXER_ERROR`, `STC_MIXER_ERROR_RESOLVED`, `CTS_MIXER_SET`, `CTS_MIXER_PRESET_ACTIVATE`, `CTS_MIXER_MONITOR_START`, `CTS_MIXER_MONITOR_STOP`, `CTS_MIXER_WIDGET_PRESENT` in `socketEvents.ts`. Update `socketEvents.test.ts`.
  - _Requirements: 11, 15.7_

- [x] 5. Add `soundboard` entry to `widgetTypeRegistry.ts` (min 3×3, unconstrained max). Update registry test.
  - _Requirements: 5.1_

- [x] 6. Add `BUS_MIXER_STATE_CHANGED`, `BUS_MIXER_LEVELS`, `BUS_MIXER_DEVICE_CHANGED`, `BUS_MIXER_CAPTURE_PATH_LOST`, `BUS_MIXER_CAPTURE_PATH_RESTORED` (catastrophic capture-path raise/resolution pair, Req 15.7) and `MixerEventMap` to backend EventBus types; extend root `EventMap`.
  - _Requirements: 9.7, 11_

---

## Phase 2: Database & Admin Persistence

- [x] 7. Add `mixer_presets` table (id, mixerId FK CASCADE, name, sortOrder, `payload` JSON, createdAt) to the `applySchema()` `CREATE TABLE IF NOT EXISTS` block — a **new table needs no `migrate*()` function** (those exist only for CHECK-constraint/column alterations on existing tables). Mirrors `camera_presets`. Confirm `device_connections.metadata` reused for mixer config (model, channelCount, features, usbSlotMap — no migration).
  - _Requirements: 9.6, 10.2_

- [x] 8. Unit tests for schema — table creation, cascade delete when parent device removed, `sortOrder` ordering.
  - _Requirements: 10_

- [x] 9. Extend `adminDeviceRoutes` to handle `deviceType = "soundboard"` via a **per-type validator seam** (map `deviceType` → validate fn, avoiding more inline `if` blocks): validate model, host/port, channel count > 0, feature flags, and `usbSlotMap` (when capture enabled); store feature toggles in the **`features` column** and model/channelCount/usbSlotMap in the **`metadata` column** (mixer-specific typed parse on read). Emit `BUS_MIXER_DEVICE_CHANGED` with `action` + `mixerId` on create/update/delete (keyed off the stored `row.deviceType` on PUT/DELETE, matching the existing camera/OBS emit pattern). **Re-run the existing camera/OBS device-CRUD E2E as a regression gate** (the validator seam touches the shared handler). Note: the probe/preset endpoints do NOT live here (see Task 10/11).
  - _Requirements: 9_

- [x] 10. Implement the mixer connection **probe** as an **inline route on the `/api/admin/mixers` mount** (mirroring camera `discover`, registered so the literal `probe` segment is not captured as `:mixerId`; NOT in `adminDeviceRoutes`, which mounts at `/api/admin/devices` and cannot serve this path) — `POST /api/admin/mixers/probe`: open a UDP socket to draft host/port, send `/xinfo`, resolve `{ ok, model?, firmware? }` on reply within `MIXER_PROBE_TIMEOUT_MS`, `{ ok: false, reason }` on timeout. ADMIN-only. Unit/E2E with a fake OSC responder (reply vs. silence). (No channel-shrink validation — the admin is trusted; out-of-range preset entries are ignored on apply.)
  - _Requirements: 9.4_

- [x] 11. Create `adminMixerPresetRoutes` — a router **mounted at `/api/admin/mixers/:mixerId/presets`** (mirroring `adminPresetRoutes` for cameras): GET/POST/PUT/DELETE presets, reorder (`/order`), and `POST /api/admin/mixers/:mixerId/capture-preset` (inline on the mixers mount). ADMIN-only. Ensure route order so `probe`/`capture-preset` literals don't collide with `:mixerId`.
  - _Requirements: 10.8_

- [x] 12. Backend E2E (admin) — create/retrieve/edit device + presets; **probe** success (fake replies) vs. failure (timeout); validation errors (invalid host/port, channel count ≤ 0, invalid `usbSlotMap`, duplicate label); 403 sweep for non-admin on mixer routes.
  - _Requirements: 9, 9.5, 10_

---

## Phase 3: Mixer HAL & X Air Driver

- [x] 13. Define `MixerControlInterface` + `createMixerDriver(model, config, capture)` factory in `packages/backend/src/mixer/MixerControlInterface.ts`.
  - _Requirements: 1_

- [x] 14. Add `@mxfriend/osc` dependency (pinned exact version). Document rationale + `osc` fallback in `BehringerXAirDriver` source header.
  - _Requirements: 2.1, 14.3_

- [x] 15. Implement `BehringerXAirDriver` — OSC/UDP on `OSC_PORT_DEFAULT`; address builders (`/ch/NN/mix/fader`, `/ch/NN/mix/on` inverted, `/headamp/NNN/gain`, `/ch/NN/config/name`); fader taper via shared util; `getCapabilities()` with `gainRange {-12, 60}`; capability declaration from admin features.
  - _Requirements: 2, 3_

- [x] 16. Implement `/xremote` renewal (every `XREMOTE_RENEW_MS`) and `onStateChange` emission for external changes; `/meters/1` blob decode for the per-channel **pre-fader** meter (indices 0–15; leading 32-bit **big-endian** count, 16-bit **signed little-endian** samples ÷256 = dB, clamp `NOISE_FLOOR_DBFS`..0) and `onMeterUpdate` emission gated by `setMeteringEnabled`. Post-preamp tap (`/meters/2` or USB) is used for the gain envelope, not this bank.
  - _Requirements: 2.4, 2.5, 11.3, 12.4_

- [x] 17. Implement read-back reconciliation with **bounded retry** (`READBACK_TIMEOUT_MS` / `READBACK_MAX_RETRIES`, because UDP is lossy) — after each `setFader`/`setMute`/`setGain` (each a **separate** OSC address; a combined command writes+reconciles each field independently), query the address, retry on no-reply, emit the mixer-reported value as authoritative; on retry exhaustion WARN-log and mark the channel unreconciled.
  - _Requirements: 2.7, 11.2, 15.5_

- [x] 18. Implement `capturePreset()` (gather fader/mute/gain for all configured channels into address→value map, using bounded-retry read-back per channel; **fail with a descriptive error naming unconfirmed channel(s)** rather than saving a partial/stale snapshot — Req 10.8) and `activatePreset(payload)` (write each address; entries for channels beyond the current channelCount are ignored). Unit tests incl. capture-fails-on-unconfirmed-channel.
  - _Requirements: 10.1, 10.2, 10.8_

- [x] 19. Implement server-side capability enforcement — reject/ignore commands for disabled capabilities (e.g., gain without `gain-control`).
  - _Requirements: 1.7_

- [x] 20. Unit tests for driver — address/value mapping (incl. mute inversion), taper conversion, `/meters` decode (property-based), read-back reconciliation (mixer value wins), capability enforcement, `/xremote` + meters renewal cadence. Uses a fake OSC transport.
  - _Requirements: 1, 2, 3, 11_

---

## Phase 4: Audio Capture Layer

- [x] 21. Implement `AudioCaptureService` — PipeWire capture (`pipewiresrc ! audioconvert ! deinterleave`), selecting the **configured USB slot per channel** from the device's `usbSlotMap` (NOT assuming slot == channel), per-channel decimated min/max envelope (~`ENVELOPE_PAIRS_PER_SEC`), `subscribe(consumer)` fan-out with lazy spawn / last-unsubscribe teardown, `isAvailable()` runtime probe (`gst-inspect-1.0 pipewiresrc`), and crash detection (pipeline exit while consumers attached → notify consumers, attempt respawn).
  - _Requirements: 4.1, 4.4, 4.5, 4.6_

- [x] 22. Implement `createFakeAudioCapture()` — no-op capture that can push `EnvelopePair`s on demand and report availability; injected via `buildApp()` in tests.
  - _Requirements: 4_

- [x] 23. Unit/integration tests — envelope decimation shape; **multi-consumer seam** (second consumer subscribes without affecting the first, Req 4.2); lazy spawn/teardown incl. teardown on last unsubscribe; `isAvailable()` false → downgrade path.
  - _Requirements: 4.2, 4.6, 4.7_

- [x] 24a. Refactor the preview transport: **rename** `PreviewStreamManager` → `VideoPreviewManager` (`previewStreamManager.ts` → `videoPreviewManager.ts`) and **extract** `PreviewUpgradeRouter` (`packages/backend/src/services/previewUpgradeRouter.ts`). The router owns `server.on("upgrade")` for `/preview/*`, verifies the cookie JWT once, and dispatches by path (video paths → `videoPreviewManager.handleUpgrade`; `/preview/mixer/*` → `audioPreviewManager.handleUpgrade`; 401 bad token, 404 unmatched). `VideoPreviewManager` loses the upgrade registration/auth and gains `handleUpgrade(req, socket, head, user)`; its video stream logic (`spawnPipeline`, restart, grace, `MAX_PREVIEW_STREAMS`) is unchanged, and `initialize()` (encoder + level-element probe) plus `isLevelAvailable()` / OBS NDI metering **stay on `VideoPreviewManager`** (they ride NDI — do NOT migrate them to `AudioPreviewManager`).
  - **Wiring seams (must update):** the method currently named `registerEndpoints(httpServer)` moves into `PreviewUpgradeRouter.registerUpgrade(httpServer)`; `app.ts` swaps that call and constructs `PreviewUpgradeRouter(authService, videoPreviewManager, audioPreviewManager)`. `index.ts` keeps calling `videoPreviewManager.initialize()` on boot. Rename the `AppContext.previewManager` field → `videoPreviewManager` (a **breaking ctx-key rename**) and add `audioPreviewManager` + the router to `AppContext`.
  - **Enumerate ALL typed consumers of the renamed class as required updates + regression gate** (verified: they reference the type or the ctx key and will break the build otherwise): `CameraService.ts` (constructor-injected `previewManager: PreviewStreamManager` field, `setSourceAvailable`/`getSubscriberCount` calls) + `CameraService.test.ts` mock; `ObsNdiPreviewSource.ts` + `ObsNdiPreviewSource.test.ts` (types `createMockPreviewManager(): PreviewStreamManager`); the `ObsModule` closure in `app.ts` (`() => previewManager.isLevelAvailable()`); `index.ts` (destructures `previewManager`, calls `.initialize()`); `tests/integration/harness.ts` (calls `ctx.previewManager.destroy()`, imports `SpawnFn`); unit tests `previewStreamManager.{test,lifecycle.test,level.test}.ts`; integration `tests/integration/gateway/audio-levels.test.ts` (reaches `ctx.previewManager["spawnFn"]` and `.initialize()`).
  - **Fakes (correct wording):** there is **no `createFakePreviewManager` to rename** — the harness injects a fake `SpawnFn` (`previewSpawnFn`) into the **real** manager, and unit tests construct the real class with a fake `SpawnFn`. Update that real-manager construction path to the video manager, and add a new `createFakeAudioPreviewManager()` for the audio manager.
  - **Teardown/signal ownership:** register the process `SIGINT`/`SIGTERM` handlers **once** (at the `PreviewUpgradeRouter`/app level), and `destroy()` **router-first** (stop accepting upgrades) → then each manager (kill pipelines / close its own `wss`). Each manager keeps its own ping/keepalive interval (video keeps its existing ping; audio gets its own). This avoids leaked GStreamer/PipeWire children and double-cleanup.
  - **Existing video-control preview tests MUST stay green**: move auth/routing cases to a new `PreviewUpgradeRouter` test; keep video stream cases with `VideoPreviewManager`.
  - _Requirements: 1 (single-responsibility boundaries), 4.3_

- [x] 24b. Implement `AudioPreviewManager` (`packages/backend/src/services/audioPreviewManager.ts`) — owns its own `WebSocketServer({ noServer: true })`; `handleUpgrade` parses `/preview/mixer/:mixerId/channel/:channel`; on connection subscribes to `AudioCaptureService` for that channel and forwards envelope frames via the shared binary codec (`encodeEnvelopeFrame`, `float32` min/max pairs — a **separate frame namespace**, it does NOT share the video `PREVIEW_MSG_*` type-prefix bytes since it is a distinct socket/endpoint); on close/disconnect unsubscribes (→ capture teardown when no consumers remain). Reuse the ping/keepalive convention; no GStreamer, no restart/grace. **Single-owner invariant:** `AudioPreviewManager` is a **dumb forwarder** — it NEVER respawns capture (respawn is owned solely by `AudioCaptureService`, Req 15.7); on capture crash it only stops forwarding / unsubscribes. **Close-code semantics:** malformed path → 404-equivalent close; an _unknown but well-formed_ `mixerId`/`channel` (no such mixer/channel) → a defined close code distinct from "capture unavailable", so the modal can tell "no such channel" from "capture down" (mirror the video 4xx convention). Add `createFakeAudioPreviewManager()`; wire into `PreviewUpgradeRouter` in `buildApp()`. Tests: (a) a gain window opens when 4 camera/OBS video previews are already active AND assert `VideoPreviewManager.getActiveStreams()` is **unchanged** by the audio connection (not merely absent from the map); (b) audio previews never appear in the video source map; (c) on capture-crash-while-open, forwarding stops so the frontend flips to slider tier (Req 15.6) AND `AudioPreviewManager` performs **no respawn**; (d) malformed path → 404; unknown mixer/channel → the distinct close code.
  - _Requirements: 4.3, 7.4, 12.4, 15.6_

---

---

## Phase 5: Mixer Service & Socket Module

- [x] 25. Implement `MixerService` — load `soundboard` devices, create drivers via factory, connect; multi-instance routing by `mixerId`; wire driver `onStateChange`/`onMeterUpdate` → `BUS_MIXER_STATE_CHANGED`/`BUS_MIXER_LEVELS`; read-back results authoritative.
  - _Requirements: 1, 2, 11_

- [x] 26. Implement metering lifecycle — **per-mixer** ref-counted `setWidgetPresence(mixerId, present)` → `setMeteringEnabled` (viewing mixer A must not subscribe mixer B's meters); capture (`startChannelMonitor`/`stopChannelMonitor`) delegated to `AudioCaptureService`/preview endpoint. Add **mixer capture-path health monitoring & recovery** (Req 15.7, scoped to the mixer's OWN capture path — NOT a stream-audio guarantee): detect USB-device-lost / capture-crash / subscription-failure, attempt automatic recovery, and on unrecoverable failure emit a **catastrophic-tier event → frontend MODAL** (`NotificationLevel: "modal"`, like `OBS_UNREACHABLE`) with an auto-clear resolution event on recovery. `AudioCaptureService` is the **single owner** of capture-pipeline respawn (gain-modal stall detection reacts only).
  - _Requirements: 12.4, 4.6, 15.7_

- [x] 27. Implement `reloadMixer(action)` subscribing to `BUS_MIXER_DEVICE_CHANGED` — add/refresh/remove instance without restart, re-broadcast state; **connection-preserving** reload (Req 9.8): reconnect only when host/port/model changed, otherwise update capabilities/`usbSlotMap`/channel count in place without dropping the OSC connection or `/xremote`/`/meters` subscriptions. **`/xremote` renewal decoupled from widget presence** — renew whenever the mixer is connected and any authenticated client is online (Req 12.4), so external changes are never missed while the widget is unmounted. Runtime-availability downgrade of `channel-audio-capture` when capture unavailable.
  - _Requirements: 9.7, 9.8, 4.7, 15.1, 12.4_

- [x] 28. Implement `createFakeMixer()` — records commands (fader/mute/gain/preset); queryable stateful values (seedable to differ from commanded, for reconciliation); unsolicited external push method; fake meter stream; fake envelope stream. Inject via `buildApp()`.
  - _Requirements: 11_

- [x] 29. Implement `MixerSocketModule` (`SocketModule`) — `register` (bus→stc broadcasts, including `BUS_MIXER_CAPTURE_PATH_LOST` → `STC_MIXER_ERROR { errorCode: "MIXER_CAPTURE_PATH_LOST", mixerId, message, level: "modal" }` and `BUS_MIXER_CAPTURE_PATH_RESTORED` → `STC_MIXER_ERROR_RESOLVED { errorCode: "MIXER_CAPTURE_PATH_LOST" }`, mirroring `obsModule`'s error/resolved wiring), `registerSocket` (`CTS_MIXER_SET`, `CTS_MIXER_PRESET_ACTIVATE`, `CTS_MIXER_MONITOR_START`/`STOP`, `CTS_MIXER_WIDGET_PRESENT` with payload `{ mixerId, present }`; AvVolunteer+; server-side capability re-check), `emitInitialState` (full state on connect/reconnect). Widget-presence is **per-mixer + per-socket ref-counted**, and a per-socket `disconnect` handler MUST decrement all presence the socket held (prevents metering-subscription leak when a tablet crashes/backgrounds). Register in `socketGateway.ts`.
  - _Requirements: 1.7, 9.5, 11.4, 11.5, 12.4, 15.7_

- [x] 30. Backend E2E (widget/service) — fader/mute/gain forwarded to fake with correct address/value (mute inversion), each field a **separate** write+read-back; preset activate writes all addresses; meter data → `STC_MIXER_LEVELS`; **read-back reconciliation** (fake value wins) + **bounded retry** on lost read-back; **external change** broadcast; **emitInitialState**; subscription lifecycle (xremote renew, meters per-mixer on widget-present / off when none); capture lifecycle (monitor-start spawns, monitor-stop AND disconnect tear down); capability enforcement; multiple-mixer routing; **connection-preserving hot-reload** (feature-only edit keeps connection/subscriptions alive; host/port change reconnects); **audio-path monitoring** (device-lost/capture-crash → recovery attempt → unrecoverable emits `BUS_MIXER_CAPTURE_PATH_LOST` → catastrophic modal; recovery emits `BUS_MIXER_CAPTURE_PATH_RESTORED` → modal auto-clears — assert both the raise and the resolution).
  - _Requirements: 1, 2, 4, 9, 11, 12, 15.7_

---

## Phase 6: Frontend State & Socket Wiring

- [x] 31. Add `mixerSlice` (Zustand) — `mixerStates`, `mixerLevels`, setters/appliers. Unit tests.
  - _Requirements: 11_

- [x] 32. Add `mixerSocketModule` (frontend) — wire `STC_MIXER_STATE`/`STC_MIXER_STATE_UPDATE`/`STC_MIXER_LEVELS` to slice; wire `STC_MIXER_ERROR` → `addNotification({ id: errorCode, level: "modal", severity: "error", message, errorCode })` and `STC_MIXER_ERROR_RESOLVED` → `removeNotification(errorCode)` (identical to `obsSocketModule`'s error handling — the `id === errorCode` linkage is what auto-clears the modal); emit `CTS_MIXER_WIDGET_PRESENT { mixerId, present }` on widget mount/unmount (per mixer). Register in `SocketProvider`. Unit tests incl. modal raise + auto-clear.
  - _Requirements: 11, 12.4, 15.7_

---

## Phase 7: Widget Building Blocks

- [x] 33. Implement `useHeldControl` hook — suppress-in (`CONTROL_SUPPRESS_MS`, drop during window, apply after), throttle-out (`CONTROL_THROTTLE_MS`), guaranteed final emit on release. Unit tests: during-window drop, after-window apply, final emit, throttle spacing.
  - _Requirements: 8_

- [x] 34. Refactor `AudioLevelMeter` to extract a shared **mono** meter (`ChannelLevelMeter`) — lift both the private `MeterBar` AND the **per-channel peak-hold decay logic that currently lives in the parent** into the mono meter; OBS stereo meter then composes two mono meters. Preserve the `--fill-percent` CSS-var inline-style exception. Add a **distinct inactive/−∞ visual** (dimmed "no-signal" state) separate from live silence (Req 5.4). Keep existing OBS `AudioLevelMeter` tests green. Add mono-meter + inactive-state tests.
  - _Requirements: 5.4, 15.2_

- [x] 35. Implement `VerticalFader` — vertical **MUI `Slider`** (`@mui/material`, `orientation="vertical"`, as used by the camera zoom control; not `ion-range`) with dB tick `marks` (`FADER_TICKS_DB`), value via `faderFloatToDb`, `useHeldControl`, emits `CTS_MIXER_SET { fader }`. `data-state` incl. an **`unreconciled`** state (read-back exhausted, Req 15.8) with subtle visual, auto-clearing on next confirmed value. Unit tests incl. suppression/throttle + unreconciled set/clear.
  - _Requirements: 5.3, 8, 15.8_

- [x] 36. Implement `MuteButton` — physical-button affordance, "Audio: On"/"Audio: Off" + green/red dot, "Mute" label; `data-state=muted/active`; discrete (bypasses the fader/gain hold model but is NOT optimistic); emits `CTS_MIXER_SET { muted }`. On toggle it enters `data-state="unknown"` / "Audio: Unknown" / yellow dot **immediately** and stays there until the mixer confirms (read-back or `/xremote`), then resolves to the mixer-reported value — never showing an unconfirmed On/Off (Req 6.3/6.6). Also enters the unknown state on read-back exhaustion. Reflects external backend changes to the mixer-reported value. Unit tests: toggle→Unknown→resolve-on-confirm; false On/Off never shown pre-confirm; read-back-exhausted → Unknown; external change reflected.
  - _Requirements: 6_

- [x] 37. Implement `GainSemicircle` — arc fills clockwise 0%=`minDb` → 100%=`maxDb`. Updates from local + backend. Unit tests.
  - _Requirements: 7.2, 7.6_

- [x] 38. Implement `EnvelopeCanvas` — draw the real post-preamp **envelope** on the dBFS axis (0..−60), plus the `GoodRangeBand` (`GOOD_RANGE_BAND_DBFS`) and the red/blue fades (`RED_FADE_DBFS`/`BLUE_FADE_DBFS`) at their dB positions. The envelope maps dBFS→screen position so it moves vertically when gain changes (driven by the slider). Draw-only, never plays audio; `requestAnimationFrame` with a ring buffer sized to the visible window. Unit tests: band/fade render at the configured dB values; envelope y-position tracks a changing gain value.
  - _Requirements: 7.4_

---

## Phase 8: Sound Board Widget Assembly

- [x] 39. Implement `HorizontalGainSlider` (horizontal **MUI `Slider`** from `@mui/material`, matching the camera controls — not `ion-range`; `useHeldControl`, emits `CTS_MIXER_SET { gainDb }`) and `GainModal` — header ("Gain for Channel X (\<Name\>)") + `GainSemicircle` + the gain slider. When the device has `channel-audio-capture`, mount `EnvelopeCanvas` above the slider, open WS `/preview/mixer/:id/channel/:ch`, and emit `CTS_MIXER_MONITOR_START`/`STOP`; otherwise render the slider only with no monitor request. On runtime capture-unavailable OR capture-crash-while-open, drop to the slider-only view with a calm inline note ("Live audio view unavailable — basic gain control shown") rather than a frozen envelope (Req 15.6). Unit tests: slider drives gain (suppression/throttle + final on release); envelope moves as gain changes; monitor start/stop; no monitor request without capture; crash-to-slider fallback.
  - _Requirements: 7, 15.6_

- [x] 40. Implement `ChannelStrip` — name, Adjust Gain button (if `gain-control`), `VerticalFader` (core, always), `ChannelLevelMeter` (if `channel-metering`, pre-fader, same height as fader), `MuteButton` (core, always). Unit tests: `it.each` over the **three optional** features (`gain-control`/`channel-metering`/`channel-audio-capture`) → respective control present/absent; plus a positive test that the fader and mute button are always rendered regardless of feature config (including all optional features off).
  - _Requirements: 5.2, 5.4, 6.7, 7.1, 15.2_

- [x] 41. Implement pagination — `ResizeObserver` computes strips that fit; last slot → pagination when channels overflow; previous-range button anchored top, next-range button anchored bottom, each in a **fixed position** with the unused position reserved (empty, not reflowed) so a visible button never moves between first/middle/last pages; accurate range labels; one-page stepping; off-page channel commands use absolute index. **Boundary (Req 5.6/13.2):** at the smallest size where exactly 3 strips fit and channels overflow, show **2 channels + the pager** (min 3 visible only when all fit; min 2 when paginating). Unit tests for boundary math (incl. the 3-fit-with-overflow case), labels, correct-channel routing, and that the prev/next buttons stay at the same coordinates across first/middle/last pages.
  - _Requirements: 13, 5.6_

- [x] 42. Implement `PresetsArea` + `ViewAllPresetsModal` — buttons wrap ≤2 rows; overflow → "View all presets" (widget-styled, scrolls); activation emits `CTS_MIXER_PRESET_ACTIVATE`, shows toast, modal auto-closes; zero presets → no space. Unit tests incl. toast + auto-close + overflow.
  - _Requirements: 10.3, 10.4, 10.5, 10.6, 15.4_

- [x] 43. Assemble `SoundBoardWidget` — `WidgetContainer` with "Controls" status indicator (freshness derivation), mixer dropdown (disabled if one), strip row (height minus preset area), `WidgetErrorOverlay` when offline; register in `widgetRenderer`. Unit tests: status green/stale/offline, offline scrim non-interactive, empty-channel placeholder.
  - _Requirements: 5, 11, 12, 15.3, 15.4_

---

## Phase 9: Admin Frontend

- [ ] 44. Implement `soundBoardDeviceFormLogic` (testable pure logic) — field validation, dirty-check, and metadata serialize/parse. **Feature toggles go in the dedicated `features` object (`Record<string, boolean>`); `model`/`channelCount`/`usbSlotMap` go in `metadata`.** Since the frontend `DeviceRecord.metadata` is typed `Record<string, string>`, the numeric `channelCount` and the `usbSlotMap` (`Record<string, number>`) MUST be explicitly serialized to / parsed from strings at this boundary (do not assume they round-trip as numbers). Unit tests incl. numeric metadata round-trip and usbSlotMap defaults-to-identity + edit.
  - _Requirements: 9_

- [ ] 45. Implement `SoundBoardDeviceForm` — connection (label/model/host/port/channel count) + feature toggles (no gain-range field) + **channel→USB-slot mapping editor** (shown when `channel-audio-capture` enabled; defaults to identity) + probe result (calls `POST /api/admin/mixers/probe`); register in `deviceTypeRegistry`. Unit tests: features + usbSlotMap round-trip on reopen; probe success/failure render.
  - _Requirements: 9_

- [ ] 46. Implement `PresetConfigModal` — reuses widget channel controls to drive the mixer **live before save** (draft), name input, capture snapshot, captured summary. Unit tests.
  - _Requirements: 10.8_

- [ ] 47. Frontend E2E (Playwright, admin) — unsaved-changes warning (creating with changes; switching device with changes; no-fire when unchanged, both cases); enter connection info; author presets for non-saved device (live control to backend) and saved device; save creates/updates; reopen recalls connection + presets; delete cascades presets.
  - _Requirements: 9, 10_

---

## Phase 10: Widget E2E, Setup, Docs & Steering

- [ ] 48. Frontend E2E (Playwright, widget) — capability gating over optional features (no meter when `channel-metering` off; no gain button when `gain-control` off; slider-only gain modal when `channel-audio-capture` off); fader + mute always present regardless of feature config; mute toggle + text/dot + backend reflection; fader emits + during/after suppression + final on release; level updates + inactive; gain modal open, slider vs window tier, monitor start/stop request (and none on slider tier), semicircle updates, gain slider suppression + envelope moves with gain; "Controls" green/red; preset tap + toast; "View all" modal + auto-close; pagination both directions + correct channel + prev/next buttons stay in fixed positions across pages; offline scrim.
  - _Requirements: 5, 6, 7, 8, 10, 12, 13, 15_

- [ ] 49. Update `scripts/setup-dev-environment.sh` — verify/install PipeWire (`pipewire`, `pipewire-pulse`, `wireplumber`, `gstreamer1.0-pipewire`); verify `pipewiresrc`; informational USB-device enumeration check.
  - _Requirements: 14.1_

- [ ] 50. Update `docs/setup.md` — PipeWire ownership (not raw ALSA `hw:`, **including OBS's own audio source**); USB routing (OBS = main LR post, capture = per-channel post-preamp taps on their configured USB slots; channel→USB-slot map must match the mixer's actual routing); ordered **first-run installer checklist** (plug USB → set X-Air USB routing → confirm PipeWire enumeration → confirm OBS consumes via PipeWire → verify test tone on the expected channel's gain window / `/meters/2` USB-in); headless `loginctl enable-linger`.
  - _Requirements: 14.2_

- [ ] 51. Update `.kiro/steering/architecture.md` — §0 (`@mxfriend/osc` + PipeWire/GStreamer capture), §1 (Audio Control → active scope), §3 (Mixer HAL + Audio Capture Layer boundaries + `/preview/mixer/*`; ALSO rename the "Backend ↔ Preview Clients" bullet's `PreviewStreamManager` → `VideoPreviewManager` and reattribute `/preview/*` upgrade + cookie-JWT auth to `PreviewUpgradeRouter`), §7 (`BUS_MIXER_DEVICE_CHANGED` hot-reload row; ALSO update the "`/preview/*` managed by `PreviewStreamManager`" line to `VideoPreviewManager`/`PreviewUpgradeRouter`). Note: the `video-control-and-preview` spec references are already handled via supersession notes in that spec — no edit needed there.
  - _Requirements: 14.4_

- [ ] 51b. Wire the mixer stack into the **production entrypoint** `index.ts` (NOT just `buildApp`, which only the E2E harness exercises — omitting this passes CI but leaves the mixer dead in production): on `httpServer.listen`, call `mixerService.initialize()` (mirroring the existing `previewManager.initialize()`/`cameraService.initialize()` boot pattern); on `shutdown()`, tear down the mixer/capture/preview stack (`mixerService.destroy()`, `audioCaptureService.destroy()`, preview router/managers) in the defined order (router-first, then managers — Task 24a). Define the catastrophic capture-path event pair used by Req 15.7 — e.g. `MIXER_CAPTURE_PATH_LOST` (raise) and its resolution id — in the socketEvents/bus additions so the modal auto-clear is testable (Task 30 asserts it), mirroring `OBS_UNREACHABLE`.
  - _Requirements: 15.7, 1_

- [ ] 52. Full verification — run `npm run ci` (lint, format, build, test:coverage across all packages); fix any failures; confirm coverage thresholds (90% lines/statements, 85% branches) hold per package.
  - _Requirements: all_
