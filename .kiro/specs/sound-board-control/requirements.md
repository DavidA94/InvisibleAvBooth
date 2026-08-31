# Requirements Document — Sound Board Control

## Introduction

This spec extends Invisible A/V Booth with **audio mixer control**, delivering the "Sound Board" widget and its supporting backend. It introduces a **Mixer Hardware Abstraction Layer (HAL)** (protocol-agnostic mixer control), a first concrete driver for the **Behringer X Air** family (OSC over UDP), a **multi-consumer audio capture layer** for reading isolated channel audio off the mixer's USB interface, a capability-driven dashboard widget (faders, mute, per-channel level metering, gain control, board presets), and an admin device type for configuring mixers and authoring presets.

This spec depends on the foundational platform delivered by the `livestream-control-system` spec (authentication, dashboard, widget grid, event bus, notification system), the `video-control-and-preview` spec (dedicated binary `/preview/*` WebSocket transport and `PreviewStreamManager` — renamed to `VideoPreviewManager` by this spec, `AudioLevelMeter` component, capability-driven widget precedent, admin device-form + preset-before-save pattern), and the `dashboard-management` spec (widget type registry, four-grid layout system). Patterns, conventions, and components defined there remain authoritative unless explicitly superseded here.

This spec moves **Audio Control** from "Future Releases" into active implementation scope (steering §1).

### Design Priorities (from `AGENTS.md`)

Audio correctness and visibility is the highest-priority signal in this system, second only to ease of use. This shapes several requirements: mute state must be unambiguous, the widget must surface a clear health indicator, controls must degrade gracefully by capability rather than fail, and the operator must always see the true state of the board even when it is changed from the physical console or another device.

### Two Explicit Feature Additions

Beyond the core widget, two behaviors were called out during design and are first-class requirements:

1. **Widget status indicator** — a "Controls" health dot on the Sound Board widget reflecting whether fresh state is flowing from the mixer (Req 12).
2. **Interaction hold model** — while a volunteer is adjusting a fader or gain, the UI must not "jump back" when a slightly-stale value arrives from the backend. This is an **inbound-suppression window** (300 ms after the last local change, incoming updates for that control are ignored) combined with an **outbound throttle** (send at most every ~50 ms while dragging, plus a guaranteed final send on release). Discrete toggles (mute) are exempt from suppression (Req 6, Req 8).

---

## Provenance of Model-Specific Values

Per `AGENTS.md` ("if a decision is important enough to exist in code, it is important enough to be documented"), the Behringer X Air values used throughout this spec are recorded here with their sources. These are **driver/model constants**, not admin-entered configuration.

| Value                                                                | Used for                                                      | Source / Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OSC over UDP, port `10024`**                                       | Transport to the X Air                                        | The X Air family listens for OSC on UDP `10024` (the X32 uses `10023`). Confirmed by the `xair-api-python` project (`onyx-and-iris/xair-api-python`) and the unofficial Behringer World OSC wiki.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| **`/ch/NN/mix/fader` (float 0.0–1.0)**                               | Channel fader level                                           | Fader is a normalized float; `0.0`–`1.0` maps to −∞…+10 dB via the console taper. `NN` is the zero-padded 1-based channel (`/ch/01`). Source: Behringer World X-Air OSC wiki; `xair-api-python` `Mix.fader`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **`/ch/NN/mix/on` (int 0/1, 1 = ON/unmuted)**                        | Channel mute                                                  | On the X Air, `mix/on = 1` means the channel is **unmuted** (signal on); `0` = muted. This inverted sense is a common source of bugs and is called out explicitly. Source: `xair-api-python` `Mix.on`; peterdikant/xair-remote.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **`/headamp/NNN/gain` (float, −12.0…+60.0 dB)**                      | Preamp gain                                                   | The XR18's MIDAS preamps provide a **−12 dB to +60 dB** range (72 dB). Headamp index is a separate zero-padded space (`/headamp/000`). Source: `xair-api-python` `HeadAmp.gain` documents "float, from -12.0 to 60.0"; corroborated by the XR18 product specification (MIDAS preamps). **CORRECTION (verified against real hardware + behringer.world forums):** the OSC WIRE value for `/headamp/NNN/gain` is a **normalized 0.0–1.0 float** (like the fader), NOT the raw dB — `0.0` = −12 dB, `1.0` = +60 dB, mapped LINEARLY. The driver converts dB↔0–1 via `gainDbToFloat`/`gainFloatToDb`. Sending raw dB makes the console clamp to +60 dB and the official app show a different value. |
| **`/ch/NN/config/name` (string)**                                    | Channel display name                                          | The channel's name as configured on the console. Displayed verbatim on the widget. Source: `xair-api-python` `Config.name`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| **`/xremote` (subscribe, renew ≤ ~9 s)**                             | Subscribe to all state changes                                | Sending `/xremote` causes the console to push subsequent parameter changes to the sender; it must be renewed periodically (the console drops the subscriber after ~10 s of silence — we renew every ~8 s). This is how external changes (physical console, other tablets, the Behringer app) reach us. Source: Behringer World wiki; ableset.app X Air integration notes; X32 protocol docs.                                                                                                                                                                                                                                                                                                    |
| **`/xinfo` (query, ~500 ms–1 s timeout)**                            | Connection probe                                              | The X Air responds to `/xinfo` with `[ip, name, model, firmware]`. This is the standard "is anyone listening" query used by X-Air Edit and third-party controllers on connect. Because OSC/UDP is fire-and-forget, a probe means: send `/xinfo`, wait for a reply within a short timeout; a reply = reachable (and the returned model/firmware may be surfaced), a timeout = unreachable. This is the only meaningful "connection success" definition for a fire-and-forget device (Req 9.4). Source: X32/X-Air OSC protocol (Patrick-Gilles Maillot); X-Air Edit connect handshake.                                                                                                            |
| **`/meters/1` (blob subscription) — indices 0–15**                   | Always-visible per-channel meter (pre-fader)                  | `/meters/1` is the "all channels" bank: `16× channel pre-fader, aux pre L/R, fx1–4 pre L/R, bus1–6 pre, fxsend1–4 pre, main post L/R, mon L/R` (40 values). **Indices 0–15 are the per-channel PRE-FADER input levels** — the correct source for the always-visible channel meter that must be independent of fader position (Req 5.4). Source: X32/X-Air OSC meter-bank table (Patrick-Gilles Maillot, behringer.world).                                                                                                                                                                                                                                                                       |
| **`/meters/2` (blob subscription) — indices 0–15**                   | Gain-window envelope tap (post-preamp)                        | `/meters/2` is `16× preamp in, 2× aux in, 18× USB in` (36 values). **Indices 0–15 are the post-preamp / pre-processing level** — the tap the preamp gain directly affects, correct for the gain-window envelope so moving the gain visibly shifts the trace. Indices 18–35 are the **18× USB-in** meters (used to verify USB-slot routing, see USB row). Source: same meter-bank table.                                                                                                                                                                                                                                                                                                         |
| **Meter blob format**                                                | Decode of `/meters/N`                                         | Leading **32-bit big-endian** count = number of `int16` samples; each sample is a **16-bit signed little-endian** integer at **1/256 dB** resolution (`value / 256` = dB). Native push cadence is ~200 updates over 10 s (~20 Hz). Values below ~−90 dB are treated as noise floor / −∞. Source: kmitchell/pmaillot forum thread (behringer.world), confirmed working against XR18.                                                                                                                                                                                                                                                                                                             |
| **USB audio: 18-in class-compliant interface, per-channel routable** | Isolated per-channel capture (gain window, future multitrack) | The X Air presents as an 18-input USB class-compliant device. **USB send routing is user-configurable per channel** (`config/…/usbreturn`, `headamp usbinput`/`usbtrim` in the X Air OSC model), so USB input slot _N_ is **not** guaranteed to equal mixer channel _N_. The channel→USB-slot mapping (and the required pre-fader tap point) MUST therefore be captured in device configuration (Req 9) rather than assumed identity, and can be verified against the `/meters/2` USB-in meters at setup. Source: X-Air USB routing (`xair-api-python` `Config.usbreturn` / `Preamp.usbinput`); XR18 manual (USB audio interface section).                                                      |

If any of these prove inaccurate against real hardware during implementation, the discrepancy and the corrected value SHALL be recorded here and in the driver's source comments.

---

## Glossary

- **Mixer / Sound Board**: A digital audio mixing console controlled by the system. The initial supported model family is the Behringer X Air (labeled "Behringer X Air" in the admin UI).
- **Mixer HAL (Hardware Abstraction Layer)**: The backend abstraction (`MixerControlInterface`) that normalizes mixer differences behind a common interface, so the widget, presets, and services operate protocol- and model-agnostically. Callers express intent (set fader, read channel state, monitor a channel); the driver decides internally whether that requires OSC polling, subscription, or USB capture.
- **Driver**: A concrete implementation of `MixerControlInterface` for a specific mixer model family (e.g., `BehringerXAirDriver`).
- **OSC (Open Sound Control)**: A UDP message protocol used to control the X Air. Fire-and-forget: messages are not acknowledged, so state is confirmed by read-back.
- **Channel**: A single input strip on the mixer, with a name, fader, mute, preamp gain, and input level.
- **Fader**: The channel's mix level control. On the X Air a normalized 0.0–1.0 float mapped to −∞…+10 dB via the console taper (not linear).
- **Gain (Preamp Gain)**: The analog preamp trim applied at the input, before processing. Sets how hot the signal enters the console. Distinct from the fader. Range is model-declared (X Air: −12…+60 dB).
- **Pre-fader input level**: The signal level at the channel input, independent of fader position — what a physical console's channel meter shows. Used for the always-visible per-channel meter and for the gain window.
- **dBFS (decibels relative to full scale)**: The absolute digital level scale. `0 dBFS` is the clipping ceiling; levels are negative below it. The gain window's "LEVEL (dB)" axis is fixed at `0` (top) to `−60` dBFS (bottom) — an industry-standard display range, reused from the existing `AudioLevelMeter` convention.
- **Gain Window**: The visualization shown above the gain slider when the device can capture isolated channel audio. It displays the live level **envelope** and the **Good-Range Band** on the dBFS axis. Gain is adjusted with the gain slider; the gain window is a visualization.
- **Good-Range Band**: A band drawn on the dBFS axis marking the desired capture range (default −18 to −8 dBFS), with a red fade above it (approaching clip, −6 to 0 dBFS, darkest at 0) and a blue fade below it (approaching the noise floor, −40 to −60 dBFS, darkest at −60). The operator raises or lowers gain until the live envelope sits within this band, clear of the red and blue.
- **Envelope**: A decimated min/max level trace (~60 pairs/second) of the real **post-preamp** signal, drawn as the glowing waveform band in the gain window against the absolute dBFS axis. It is a level trace, not playable PCM — the frontend draws it, never plays it. Raising gain lifts the trace toward clipping; with a steady input and steady gain it holds a steady height. The trace reaching 0 dBFS indicates actual clipping.
- **Gain Semicircle**: The knob-style visual in the gain modal. An arc that fills clockwise from empty (gain at model minimum) to full (gain at model maximum). For the X Air: 0% = −12 dB, 100% = +60 dB.
- **Audio Capture Layer**: The backend subsystem that owns the mixer's USB audio device (via PipeWire) and fans isolated channels out to multiple consumers. The gain window is the first consumer; multitrack recording is a designed-for future consumer.
- **PipeWire**: The Linux audio server that owns the USB device exclusively and shares it among consumers (OBS, our capture) without exclusive-open conflicts.
- **Preset**: A named, board-wide snapshot of every configured channel's fader, mute, and gain. Applied with one tap. Stored as an open OSC address→value map so additional parameters can be added later without a schema change.
- **Inbound-suppression window**: A 300 ms period after the last local change to a fader/gain control during which incoming backend updates for that control are ignored, preventing the control from "jumping back" mid-adjustment.
- **Outbound throttle**: The rate limit (~50 ms) on messages emitted while dragging a fader/gain, plus a guaranteed final message on release.
- **Read-back reconciliation**: After sending a fire-and-forget OSC command, the backend queries the affected address and broadcasts the mixer-reported value. The mixer is authoritative — if it reports a different value than commanded, clients reflect the mixer's value.
- **Capability / Feature**: A toggleable mixer capability (`gain-control`, `channel-metering`, `channel-audio-capture`) that determines which controls the widget shows. `fader` and `mute` are core and always assumed present.

---

## Requirements

### Requirement 1: Mixer Hardware Abstraction Layer

**User Story:** As a system architect, I want a protocol- and model-agnostic mixer control interface, so that the widget, presets, and services operate identically regardless of which mixer model or transport is used, and adding a new mixer model never requires changing callers.

#### Acceptance Criteria

1. THE Backend SHALL define a `MixerControlInterface` that normalizes mixer operations across models. The interface SHALL express **intent**, not transport mechanics — callers SHALL NOT need to know whether a given value is obtained by polling, subscription, or USB capture.
2. THE `MixerControlInterface` SHALL expose at minimum: `setFader(channel, level)` (level 0.0–1.0), `setMute(channel, muted)`, `setGain(channel, gainDb)`, `getChannelState(channel)` and `getAllChannelStates()` returning name/fader/mute/gain/level, `activatePreset(presetPayload)`, `capturePreset()` returning the current board snapshot, `connect()`, `disconnect()`, and `isConnected()`.
3. THE `MixerControlInterface` SHALL expose an intent to **observe** per-channel level metering (e.g., an `onMeterUpdate` subscription) and an intent to **start/stop isolated audio monitoring** for a single channel (e.g., `startChannelMonitor(channel)` / `stopChannelMonitor(channel)`). The driver SHALL internally decide how each is satisfied (OSC `/meters` subscription vs. USB capture).
4. THE `MixerControlInterface` SHALL expose a `getCapabilities()` result declaring which of `gain-control`, `channel-metering`, `channel-audio-capture` the device supports, and a model-declared `gainRange` of `{ minDb, maxDb }`.
5. THE Backend SHALL select the concrete driver via a **model** field on the device configuration (a driver factory keyed off model), consistent with the Camera Model precedent. The only model available in this release SHALL be **Behringer X Air**.
6. THE HAL SHALL be the single backend abstraction for all mixer communication. No widget, preset, or feature SHALL communicate with a mixer directly; all interactions SHALL flow through the HAL (steering §2, Backend as Authority).
7. WHERE a driver does not support a capability (e.g., `gain-control` disabled), THE Backend SHALL reject or ignore commands for that capability rather than forwarding them, as defense-in-depth independent of frontend gating.

---

### Requirement 2: Behringer X Air Driver (OSC)

**User Story:** As an operator, I want to control a Behringer X Air mixer over the network, so that I can adjust faders, mutes, gain, and presets from a tablet.

#### Acceptance Criteria

1. THE Backend SHALL implement `MixerControlInterface` as `BehringerXAirDriver`, communicating via OSC over UDP on port `10024` to the configured host. The `@mxfriend/osc` library SHALL be used for OSC encoding/decoding and UDP transport, pinned to an exact version. IF `@mxfriend/osc` proves problematic in future, `osc` (osc.js) is the documented fallback; the choice SHALL be recorded in the driver source with rationale.
2. THE driver SHALL map interface operations to X Air OSC addresses as documented in "Provenance of Model-Specific Values": fader → `/ch/NN/mix/fader`, mute → `/ch/NN/mix/on` (inverted: `1` = unmuted), gain → `/headamp/NNN/gain`, name → `/ch/NN/config/name`. THE driver SHALL correctly handle the inverted mute sense so that "muted" in the interface maps to `mix/on = 0`.
3. THE driver SHALL declare capabilities `gain-control`, `channel-metering`, and `channel-audio-capture` as available for the X Air (subject to the admin's per-device feature toggles, Req 9), and a `gainRange` of `{ minDb: -12, maxDb: 60 }`.
4. THE driver SHALL maintain the `/xremote` subscription by re-sending it on a fixed interval (~8 s) while at least one consumer needs live state, so that changes made externally (physical console, other tablets, the Behringer app) are received and propagated.
5. THE driver SHALL subscribe to per-channel level metering via the `/meters/1` blob subscription (bank indices 0–15 = per-channel **pre-fader** input, per the provenance table) only while metering is needed (Req 12 lifecycle), decode the blob (leading 32-bit **big-endian** count of samples; each sample a 16-bit **signed little-endian** integer at 1/256 dB; values below ~−90 dB treated as −∞), and emit per-channel dBFS levels via the HAL's meter-observation intent. WHERE the gain-window envelope requires a post-preamp tap, THE driver/capture layer SHALL use the post-preamp source (`/meters/2` indices 0–15, or the USB pre-processing tap per Req 4.5), NOT the pre-fader meter bank.
6. THE driver SHALL implement the fader taper conversion between the interface's dB values and the console's normalized 0.0–1.0 fader float, matching the standard X Air/X32 taper (0 dB at approximately 75% of travel; −∞ at 0.0; +10 dB at 1.0). The conversion SHALL round-trip within display tolerance.
7. THE driver SHALL treat OSC as fire-and-forget and SHALL implement **read-back reconciliation** with **bounded retry** (chosen because UDP has no delivery guarantee): after issuing a set command, it SHALL query the affected address; IF no read-back reply arrives within a short timeout, it SHALL re-issue the query up to a small fixed retry count (a per-field OSC write maps to its own query + retry). It SHALL emit the mixer-reported value as authoritative (Req 11). Each optional field in a combined command (`fader`/`muted`/`gainDb`) is a **separate** OSC address, so each is written and reconciled independently (Req 11). Retry bounds SHALL be defined as constants; on retry exhaustion the driver SHALL WARN-log and surface the affected channel as unreconciled (Req 15).
8. THE driver SHALL support satisfying `startChannelMonitor(channel)` via the Audio Capture Layer (Req 4), not via OSC. `channel-metering` (the always-visible level bar) and `channel-audio-capture` (the gain window envelope) are independent capabilities served by different mechanisms.

---

### Requirement 3: Behringer X Air Family Model Coverage

**User Story:** As an installer, I want one driver to cover the X Air family, so that mixers with different channel counts work without a new integration each time.

#### Acceptance Criteria

1. THE `BehringerXAirDriver` SHALL support the X Air family (e.g., XR18/XR16/XR12/X18) which share the OSC protocol, differing primarily in channel count. THE driver SHALL NOT hardcode a channel count.
2. THE number of channels exposed SHALL be determined by the admin-configured **channel count** for the device (Req 9), not by the model name. The X Air does not reliably report its physical channel count over OSC, so the admin value is trusted. IF the admin over-declares (e.g., 16 on an XR12), the extra strips SHALL degrade harmlessly: commands to non-existent channels are fire-and-forget OSC the console ignores, and their meters/read-backs simply never report (the strips show the inactive/−∞ meter state, Req 5.4, and — for mute — "Audio: Unknown", Req 6.6). The system SHALL NOT crash or block on over-declared channels; correcting the count is an admin action.
3. THE admin UI SHALL label the model **"Behringer X Air"** (not a specific SKU), consistent with the research that the family shares the protocol.

---

### Requirement 4: Multi-Consumer Audio Capture Layer

**User Story:** As a system architect, I want a shared audio-capture subsystem that can serve multiple consumers from one USB device, so that the gain window works today and multitrack recording can be added later without major refactoring.

#### Acceptance Criteria

1. THE Backend SHALL provide an **Audio Capture Layer** that reads isolated channel audio from the mixer's USB interface via **PipeWire** (GStreamer `pipewiresrc` → `audioconvert` → `deinterleave`), selecting individual channels from the multichannel device. Because X Air USB send routing is **user-configurable per channel** (a mixer channel's audio is not guaranteed to land on the same-numbered USB slot — provenance table), THE layer SHALL select the USB slot from the admin-configured **channel→USB-slot mapping** (Req 9), NOT by assuming USB slot _N_ == channel _N_.
2. THE Audio Capture Layer SHALL be designed to support **multiple concurrent consumers** reading disjoint or overlapping channel subsets from a single device capture, without requiring changes to existing consumers when a new consumer is added. This is a non-functional requirement enforced by the design (a subscribe/fan-out seam), and by tests that add a second consumer.
3. THE gain window SHALL be the first consumer, requesting a single channel while a gain modal is open. Multitrack recording is explicitly **out of scope for implementation** in this spec but SHALL be accommodated by the layer's design and documented as a future consumer. The requirements and design SHALL not preclude it (channel tap point, per-channel access, fan-out).
4. THE Audio Capture Layer SHALL produce, for the gain window, a **decimated min/max envelope** stream (~60 pairs/second) computed on the backend, NOT raw PCM. The frontend draws the envelope and never plays audio. This bounds bandwidth and avoids a choppy graph.
5. THE captured tap SHALL be **post-preamp, pre-processing** (pre-fader), so the envelope reflects the level the preamp gain affects (enabling clip/quiet judgment) and so it is the correct tap for future multitrack rebalancing. The mixer-side USB routing required to achieve this — the per-channel tap-point selection AND the channel→USB-slot assignment — SHALL be documented as a setup prerequisite (Req 14) and captured in device config (Req 9). Setup SHALL be able to verify the routing landed correctly by comparing the `/meters/2` USB-in meters (indices 18–35) against the expected channel.
6. THE Audio Capture Layer SHALL spawn its capture pipeline lazily (only when a consumer subscribes) and tear it down when the last consumer unsubscribes, including on client disconnect without an explicit stop.
7. WHERE PipeWire or the GStreamer PipeWire plugin is unavailable at runtime, or the device cannot be captured, THE Audio Capture Layer SHALL report `channel-audio-capture` as unavailable so the gain window degrades gracefully to the slider tier (Req 8), rather than erroring. Runtime unavailability SHALL override admin configuration.

---

### Requirement 5: Sound Board Widget — Layout & Channel Strip

**User Story:** As a volunteer, I want a clear per-channel sound board on my dashboard, so that I can adjust levels, mutes, and gain confidently during a service.

#### Acceptance Criteria

1. THE Frontend SHALL render a "Sound Board" widget, registered with widgetId `"soundboard"` in the widget type registry, with a minimum size of **3×3** grid cells and no maximum (uses extra space for more channels/presets).
2. THE widget SHALL render one **vertical channel strip** per configured channel. A strip SHALL contain, top to bottom: the channel **name** (verbatim from the mixer), an **Adjust Gain** button (Req 7), a **vertical fader** with a **per-channel level meter** beside it (both the same height), and a **mute/unmute button** (Req 6).
3. THE vertical fader SHALL display a real dB scale with tick marks reflecting the console taper (e.g., +10, 0, −5, −10, −20, −30, −∞), NOT a linear 0–100% scale.
4. THE per-channel level meter SHALL be a **mono** variant of the existing `AudioLevelMeter` visual language, showing the **pre-fader input level** (independent of fader position, matching a physical console), fixed to the 0…−60 dBFS scale with the established color zones and peak hold. WHEN meter data has stopped flowing (metering not subscribed, or stalled), THE meter SHALL render a **visually distinct inactive/−∞ state** (e.g., a dimmed/"no-signal" treatment) that is unambiguously different from a live meter reading true silence — so a volunteer can tell "meters are off" apart from "the channel is genuinely quiet." This inactive state is separate from the "Controls" indicator, which may remain green while meters are inactive (Req 12.3).
5. THE height of each channel strip SHALL be derived from the widget's available height minus the space reserved for the presets area (Req 10).
6. THE widget SHALL always support however many channels are configured. On the smallest supported size (small-portrait grid, ~3 strip columns), THE widget SHALL show a **minimum of three channel strips when all channels fit, or a minimum of two channel strips when pagination is present** (the last of the three slots becomes the pagination control, Req 13.2). The number of channel strips shown SHALL be computed from available width via a `ResizeObserver`, recomputing on resize/orientation change. This resolves the boundary at exactly-three-slots-with-overflow in favor of showing two channels plus the pager, rather than cramming a third.
7. THE widget SHALL expose `data-status` (`online` / `offline`) and its stateful controls SHALL expose `data-state` for test assertions (code-style §data-attributes).

---

### Requirement 6: Mute / Unmute

**User Story:** As a volunteer, I want an obvious mute control per channel, so that I never mistake whether a channel's audio is live.

#### Acceptance Criteria

1. THE mute control SHALL render as a physical-button affordance (pressed/unpressed appearance) with light-grey "Mute" label text on the button.
2. ABOVE the button, THE widget SHALL display the channel's audio state unambiguously as text (not color alone): **"Audio: On"** with a green dot when unmuted, or **"Audio: Off"** with a red dot when muted. The text is the authoritative signal; the dot is a secondary reinforcement.
3. WHEN the user toggles the mute button, THE Frontend SHALL send the corresponding mute command to the backend for that channel, and THE Backend SHALL forward it to the mixer (correctly mapping to the inverted `mix/on` sense). **The mute control SHALL optimistically show the commanded On/Off state immediately** — a discrete command is trusted to have gone through, so a normal toggle must not flash "Audio: Unknown". A confirmation timer of `MUTE_CONFIRM_TIMEOUT_MS` (500 ms) runs: IF the mixer confirms the commanded value (read-back success or `/xremote` push) before it fires, the optimistic value is simply confirmed and the timer is cancelled; IF the window elapses with no confirming value, THE control SHALL fall back to the **unconfirmed** state ("Audio: Unknown", yellow dot — Req 6.6), surfacing a genuinely lost/failed command rather than continuing to assert a value the mixer never acknowledged. (Superseded design note: an earlier revision entered "Unknown" immediately on every toggle; that flashed "Unknown" on each normal mute and was changed to optimistic-with-timeout. The audio-safety guarantee is preserved differently — a false "Audio: Off" is only ever shown for at most the 500 ms confirm window, after which an unconfirmed command surfaces as "Unknown".)
4. WHEN the backend reports a mute-state change for a channel (from any origin, including external changes), THE widget SHALL update the button appearance and the "Audio: On/Off" text and dot to the mixer-reported value accordingly (clearing any unconfirmed state).
5. THE mute control SHALL be **exempt from the inbound-suppression window** (Req 8) — a discrete toggle, backend mute changes reflect immediately.
6. THE mute control SHALL show an explicit **unconfirmed** state — a **yellow dot with the text "Audio: Unknown"** — when the mixer has not confirmed the mute state: (a) after a local toggle, only once the `MUTE_CONFIRM_TIMEOUT_MS` (500 ms) confirm window has elapsed with no confirming value (before that window it optimistically shows the commanded On/Off, Req 6.3), and (b) if a mute command's read-back cannot be confirmed after bounded retry (Req 2.7 — the backend surfaces this via the channel's unreconciled flag). The state SHALL resolve to the mixer-reported On/Off as soon as the mixer confirms the value (via read-back success or an `/xremote` push). This is the mute case of the general unreconciled-state handling (Req 8/Req 15).
7. THE `fader` and `mute` controls are **core** and SHALL always be present on every channel strip, independent of the optional feature toggles (`gain-control`, `channel-metering`, `channel-audio-capture`). There is no `fader` or `mute` capability toggle — a mixer without faders or mutes is not a supported concept. (Only `gain-control`, `channel-metering`, and `channel-audio-capture` gate whether their respective controls render.)

---

### Requirement 7: Gain Control & Gain Window

**User Story:** As a volunteer, I want to set a channel's preamp gain with clear visual feedback about clipping and noise, so that the signal is captured cleanly.

#### Acceptance Criteria

1. WHERE the device has `gain-control`, THE channel strip SHALL show an **Adjust Gain** button that opens a per-channel gain modal. WHERE `gain-control` is absent, THE button SHALL NOT be rendered.
2. THE gain modal SHALL adjust gain with a **horizontal gain slider**. THE modal SHALL display, at the top-left, the text "Gain for Channel X (\<Channel Name\>)", and at the top-right, the **gain semicircle** (arc filling clockwise; 0% = model `gainRange.minDb`, i.e. −12 dB for X Air; 100% = `gainRange.maxDb`, +60 dB). THE semicircle SHALL reflect the slider's current value.
3. THE gain slider SHALL emit gain changes using the **outbound throttle** (~50 ms + final on release) and SHALL be subject to the **inbound-suppression window** (300 ms) (Req 8). THE semicircle SHALL update whether the change originated from the slider or from a backend update.
4. WHERE the device has `channel-audio-capture` (available at runtime, Req 4.7), THE modal SHALL additionally render, above the slider, a gain-window visualization:
   1. A vertical "LEVEL (dB)" axis from `0` to `−60` dBFS with tick marks, occupying the available vertical space (max height governed by an easily-changed code constant, default ~400px equivalent).
   2. A **Good-Range Band** drawn on the axis at fixed dB bounds (default `−18` to `−8` dBFS) marking the target capture range, with a **red fade** above it (default `−6` to `0` dBFS, darkest at `0`, "approaching clip") and a **blue fade** below it (default `−40` to `−60` dBFS, darkest at `−60`, "approaching the noise floor"). The band and fade bounds SHALL be easily-changed named constants with defaults derived from standard gain-staging guidance (average target ≈ −18 dBFS; safe zone ≈ −10 to −20 dBFS; peaks below ≈ −6 dBFS).
   3. A live **envelope** of the real **post-preamp** signal drawn on the axis. WHEN the operator changes gain with the slider, THE envelope SHALL move vertically (raising gain lifts it toward `0` dBFS); with a steady input and steady gain it SHALL hold a steady height. THE trace reaching `0` dBFS SHALL indicate actual clipping. The operator raises or lowers gain until the envelope sits within the Good-Range Band.
   4. WHEN the modal opens, THE Frontend SHALL send a **start-monitor** message for the channel; WHEN it closes or the client disconnects, THE Frontend SHALL send (or the backend SHALL infer) a **stop-monitor**.
5. WHERE the device does NOT have `channel-audio-capture`, THE modal SHALL render the slider and semicircle only, with no gain-window visualization and no monitor request. WHERE this is because capture became unavailable at runtime (rather than admin-disabled), THE modal SHALL show a calm inline note (e.g., "Live audio view unavailable — basic gain control shown").

---

### Requirement 8: Interaction Hold Model (Suppress-In / Throttle-Out)

**User Story:** As a volunteer carefully adjusting a fader or gain, I don't want my control to jump back to an older value when a slightly-stale update arrives from the backend.

#### Acceptance Criteria

1. WHILE the user is actively adjusting a fader or a gain control (pointer/touch down), AND for **300 ms after the last local change** to that control, THE Frontend SHALL treat the local value as authoritative for that specific control and SHALL **ignore** incoming backend updates for it.
2. A backend update for a control that arrives **during** its suppression window SHALL be dropped (not queued). A backend update that arrives **after** the window SHALL be applied.
3. WHILE dragging, THE Frontend SHALL emit outbound change messages at most every ~50 ms (throttled), and SHALL emit a **guaranteed final message** on release reflecting the exact released value.
4. THE suppression window SHALL apply per-control — each channel's fader and each channel's gain slider independently.
5. THE suppression window SHALL NOT apply to discrete controls (mute, preset activation) — those reflect backend state immediately.

---

### Requirement 9: Admin Mixer Device Type

**User Story:** As an admin, I want to configure a mixer and its capabilities on the Device Management page, so that operators get exactly the controls the hardware supports.

#### Acceptance Criteria

1. THE admin Device Management page SHALL support a new device type registered with key `"soundboard"` and display name **"Sound Board"** (or "Mixer"), following the existing device type registry and list+detail-panel pattern.
2. THE device form SHALL allow specifying: a **label**, the **model** (react-select; only "Behringer X Air" available now), the **host** and **port** (default `10024`), the **number of audio channels**, the available **features** (`gain-control`, `channel-metering`, `channel-audio-capture`) as toggles, and — WHERE `channel-audio-capture` is enabled — a **channel→USB-slot mapping** (which USB input slot carries each channel's post-preamp tap; defaults to identity `channel N → slot N` but is editable because X Air USB routing is user-configurable, provenance table / Req 4). `fader` and `mute` are core and are not toggles.
3. THE gain range SHALL NOT be an admin field — it is model-declared by the driver (Req 1.4, provenance table). No dB-axis or gain-range value SHALL be requested from the admin.
4. THE form SHALL provide a **connection probe** result (success/failure with reason), consistent with the camera device form. Because OSC/UDP is fire-and-forget with no ACK, the mixer probe SHALL be defined as: open a UDP socket to the draft host/port, send `/xinfo`, and wait for a reply within a short timeout (a defined constant, ~500 ms–1 s). A reply within the window = **success** (and the returned model/firmware MAY be surfaced in the result); a timeout = **failure** with a "no response from mixer at host:port" reason. THE probe SHALL be exposed as an ADMIN-only backend endpoint (see design REST table) so it can run against the draft device before save.
5. Mixer configuration SHALL be ADMIN-only. Live operation (fader/mute/gain/presets) SHALL be available to AvVolunteer and above.
6. THE device configuration SHALL be stored using the existing `device_connections` table, splitting fields exactly as camera and OBS do: capability toggles (`gain-control`, `channel-metering`, `channel-audio-capture`) in the dedicated **`features` column** (`Record<string, boolean>`), and `model` / channel count / channel→USB-slot mapping in the **`metadata` column** (JSON). Because `metadata` is generically typed `Record<string, string>`, the numeric channel count and USB-slot map SHALL be read with a mixer-specific typed parse. The X Air OSC protocol is unauthenticated; there is no device password to encrypt. IF a future model requires a secret, it SHALL be encrypted at rest via the existing `DEVICE_SECRET_KEY` mechanism.
7. WHEN a mixer device is created, updated, or deleted, THE Backend SHALL hot-reload the affected mixer instance without a server restart via a `BUS_MIXER_DEVICE_CHANGED` bus event, following the established hot-reload pattern (steering §7). The mixer service SHALL add, refresh, or remove the instance and re-broadcast state.
8. Hot-reload SHALL NOT interrupt live audio. Editing a mixer device during a service is **not an expected workflow** (configuration is a soundcheck-time activity), but IF it occurs, a reload that changes only non-connection fields (feature toggles, channel→USB-slot mapping, presets) SHALL preserve the existing OSC connection and `/xremote`/`/meters` subscriptions rather than tearing them down and reconnecting. Only a change to connection fields (host/port/model) SHALL reconnect. The mixer control path SHALL never affect the OBS main-mix audio that feeds the livestream/recording (that path is owned by OBS via PipeWire, Req 4/14).

---

### Requirement 10: Board Presets

**User Story:** As a volunteer, I want one-tap presets that adjust the whole board, so that I can move quickly between common states (e.g., singers to speaker).

#### Acceptance Criteria

1. A preset SHALL be a **board-wide snapshot** capturing **fader, mute, and gain for every configured channel**. Channel names are device configuration, not part of a preset.
2. A preset SHALL be stored as an **open OSC address→value map** (not three fixed columns), so additional parameters (e.g., EQ) can be captured in a future release without a schema change. In this release the captured set SHALL be exactly fader/mute/gain for all configured channels. Only values the system can **set** are captured (Req 10.8).
3. THE widget SHALL render preset buttons **below the channel strips**, wrapping to at most **two rows** based on preset count and available width. Preset names are admin-configured.
4. IF there are more presets than fit in two rows, THE widget SHALL show a **"View all presets"** button that opens a modal listing all presets. The modal SHALL use the same visual style/layout as the widget's preset area and SHALL scroll vertically as needed.
5. WHEN the user taps a preset (in the widget or the modal), THE Frontend SHALL send a preset-activate message to the backend and THE Backend SHALL apply all relevant values to the mixer. WHEN activated from the modal, the modal SHALL auto-close.
6. WHEN a preset is applied, THE widget SHALL show a brief confirmation **toast** (e.g., "Applied: \<preset name\>") and the board SHALL visibly update as reconciled state arrives.
7. Preset application SHALL be applied **silently with respect to muting** — a preset MAY mute or unmute any channel as authored, without warning or confirmation, because rapid mute/unmute (e.g., singers→speaker) is the primary use case. The resulting mute states SHALL be clearly reflected per Req 6.
8. Preset **authoring** (create/edit/delete/name) SHALL be ADMIN-only. Capturing a snapshot SHALL gather the current value of every setting the system can set for all configured channels (full, deterministic snapshot), by querying the mixer. Because queries are over lossy UDP, capture SHALL use the same bounded-retry read-back as commands (Req 2.7). IF any channel's value is still unconfirmed after retries, THE capture SHALL **fail with a descriptive error** naming the affected channel(s) and SHALL NOT save a partial/stale snapshot — a preset silently storing a wrong value would later be applied live as an audio fault. The admin retries the capture once the mixer is reachable.

---

### Requirement 11: State Authority, Reconciliation & External Changes

**User Story:** As an operator, I want the widget to always show the true state of the board, even when it's changed physically or from another device.

#### Acceptance Criteria

1. THE Backend SHALL be the authority for mixer state exposed to clients. Because the X Air is subscribable/queryable, live channel state (fader/mute/gain/name) is read from the mixer and need NOT be persisted across restarts; only device configuration and presets are persisted.
2. AFTER any set command, THE Backend SHALL perform **read-back reconciliation** (query the address, broadcast the mixer-reported value). IF the mixer reports a value different from the commanded value, clients SHALL reflect the **mixer's** value.
3. WHEN a change originates externally (physical console, another tablet, other software) and arrives via `/xremote`, THE Backend SHALL broadcast the change to all connected clients so every widget reflects it (subject to each client's per-control suppression window).
4. WHEN a client connects or reconnects and emits `cts:request:initial:state`, THE Backend SHALL emit the full current mixer state (all channels' name/fader/mute/gain, capabilities, presets) for each configured mixer, following the `emitInitialState` pattern.
5. THE Backend SHALL broadcast state changes via the `bus:` → `stc:` pipeline; the frontend socket module SHALL wire incoming events to the Zustand store (steering §7 Socket Module Pattern). Adding this domain SHALL require only one backend module and one frontend module plus registration — no existing module changes.

---

### Requirement 12: Widget Status Indicator & Metering Lifecycle

**User Story:** As a volunteer, I want a clear health indicator for the sound board, so that I know at a glance whether my controls are actually reaching the mixer.

#### Acceptance Criteria

1. THE `WidgetContainer` for the Sound Board SHALL display a connection status indicator labeled **"Controls"**: **green** when fresh mixer state (control state and/or meter data) has been received within a freshness window, **red** when state is stale or the mixer is offline/unreachable.
2. THE freshness determination SHALL follow the existing `eventsFlowing` / `framesRecent` pattern used by the OBS preview and camera widgets, using a defined timeout constant (e.g., no fresh state within N seconds → unhealthy). Liveness evidence SHALL include **any confirmed round-trip with the mixer** — a successful `/xremote` renewal acknowledgement, any read-back/query reply, or an unsolicited `/xremote` push — NOT only unsolicited external pushes. This keeps an idle-but-healthy board (no external changes mid-sermon) green, while a genuinely lapsed subscription or unreachable mixer (no round-trips succeeding) turns "Controls" red. `CONTROLS_FRESHNESS_MS` SHALL be sanity-checked against `XREMOTE_RENEW_MS` so a healthy board is never marked stale between renewals: because a single renewal reply can be lost over UDP, the freshness window SHALL clear **at least twice** the renewal interval plus margin (the guaranteed periodic liveness signal on a quiet board is the renewal round-trip, and one dropped reply must not trip a false red).
3. Metering-stopped-but-control-alive SHALL be considered **green** for the "Controls" indicator (control liveness is what "Controls" reflects); the per-channel level bars have their own inactive state when meter data stops.
4. THE Backend SHALL subscribe to the full `/meters` bank only while at least one client has the Sound Board widget present for that mixer (per-mixer ref-count), and SHALL stop metering subscription when no clients need it. **`/xremote` SHALL be renewed whenever the mixer is connected and at least one authenticated client is online — NOT gated on widget presence** — so external changes (physical console, Behringer app) are never missed during a gap when the widget happens to be unmounted (Req 11.3). Single-channel isolated audio capture SHALL run only while a gain modal is open (Req 4.6).
5. WHEN the mixer is offline or unreachable, THE widget SHALL display the established `WidgetErrorOverlay` scrim and controls SHALL be non-interactive, consistent with the camera/OBS widgets.

---

### Requirement 13: Pagination Across Channels

**User Story:** As a volunteer on a small screen, I want to page through channels when there are more than fit, so that I can reach every channel without a cramped layout.

#### Acceptance Criteria

1. WHEN the number of configured channels exceeds the number of channel strips that fit in the available width, THE final visible strip slot SHALL be replaced with a **pagination control**. Pagination SHALL NOT appear when all channels fit.
2. THE number of channels visible per page SHALL be `(strips that fit) − 1` when pagination is present (the last slot is the pagination control), computed from available width via `ResizeObserver`.
3. On the **first page**, THE pagination control SHALL be a single button labeled to advance to the next range, e.g., "See channels 4–6 of 9".
4. On a **middle page** (both a previous and a next range exist), THE pagination control SHALL show two buttons: the previous-range button (e.g., "See channels 1–3 of 9") and the next-range button (e.g., "See channels 7–9 of 9").
5. On the **first page** only the next-range button is applicable; on the **last page** only the previous-range button is applicable.
6. THE previous-range and next-range buttons SHALL each occupy a **fixed position** within the pagination control — the previous-range button anchored at the **top** of the slot and the next-range button anchored at the **bottom** — and each SHALL remain in that same position regardless of whether one or both are currently shown. WHEN only one button is applicable (first or last page), the other button's position SHALL remain empty rather than being reflowed; the visible button SHALL NOT move. This gives the operator a stable target that never jumps between pages.
7. Pagination SHALL step **one page at a time** (adjacent ranges), not jump to first/last. Range labels SHALL be accurate for the current fit.
8. WHILE on any page, adjusting a control for a visible channel SHALL send an update for that channel's **correct channel index**, regardless of page offset.

---

### Requirement 14: Setup, Dependencies & Documentation

**User Story:** As an installer, I want setup to install and verify the audio dependencies and document the required mixer routing, so that the gain window and multi-consumer capture work reliably.

#### Acceptance Criteria

1. `scripts/setup-dev-environment.sh` SHALL verify PipeWire and install it if missing (`pipewire`, `pipewire-pulse`, `wireplumber`, and `gstreamer1.0-pipewire` for the `pipewiresrc` element), and SHALL verify the mixer USB device can enumerate as a PipeWire device.
2. `docs/setup.md` SHALL document: (a) that the mixer must be owned by PipeWire and NOT grabbed as a raw ALSA `hw:` device by any process, **including OBS's own audio source** (OBS must consume via PipeWire, not raw ALSA, or the two consumers will contend for the device); (b) the required USB routing — OBS consumes the **main LR (post-processing) mix**, while our capture reads **per-channel post-preamp/pre-processing input taps** on their configured USB slots (X Air USB routing is per-channel configurable, so the channel→USB-slot mapping entered in the device form MUST match the mixer's actual routing); (c) an ordered **first-run installer checklist** — plug in USB → set the X Air USB source routing (on the console / X-Air Edit app, not in this software) → confirm PipeWire enumerates the device → confirm OBS is set to consume via PipeWire → verify a test tone appears on the expected channel's gain window (or via `/meters/2` USB-in); (d) for headless servers, enabling PipeWire as a lingering user service (`loginctl enable-linger`).
3. THE `@mxfriend/osc` dependency SHALL be added with a pinned exact version; the fallback (`osc`) SHALL be noted in code comments and docs.
4. THE steering document SHALL be updated during implementation: §0 (add `@mxfriend/osc` and PipeWire/GStreamer audio capture to the stack), §1 (move Audio Control to active scope), §3 (add the Mixer HAL and Audio Capture Layer boundaries, and the mixer channel-audio `/preview/*` endpoint), §7 (add `BUS_MIXER_DEVICE_CHANGED` to the hot-reload table).
5. **Accepted limitation (in-product USB-routing verification is out of scope for this release).** The channel→USB-slot map is validated only for shape (Req 9), not against the mixer's actual routing. IF the admin's map does not match the mixer's real USB send routing, the gain window will show a different channel's envelope with no in-product error — mitigated only by the setup checklist (14.2c). An active safeguard (e.g., reading `/meters/2` USB-in at save to confirm the slot carries the expected channel's signal) was considered and **deliberately deferred**: this is a setup-time, admin-only concern (the volunteer never touches USB routing during a service), so it is acceptable to revisit only if it proves to be a real problem in practice. Recorded here so the tradeoff is not lost.

---

### Requirement 15: Graceful Degradation & Failure Handling

**User Story:** As a volunteer, I want the sound board to keep working (with reduced fidelity) when parts of the system are unavailable, so that a partial failure never leaves me without core audio control.

#### Acceptance Criteria

1. WHERE `channel-audio-capture` is unavailable (admin-disabled OR unavailable at runtime per Req 4.7), THE gain modal SHALL fall back to the slider tier (Req 7.4) rather than failing to open.
2. WHEN meter data stops flowing but control state is alive, THE per-channel level bars SHALL show their inactive/−∞ state while faders/mutes/gain remain operable and the "Controls" indicator stays green.
3. WHEN the mixer disconnects, THE widget SHALL show the `WidgetErrorOverlay` scrim (Req 12.5) and, on reconnection, resume showing live state without a page reload.
4. WHEN there are **zero presets**, the preset area SHALL take no space (no empty row). WHEN there are **zero configured channels**, the widget SHALL render a sensible placeholder and SHALL NOT crash.
5. OSC command loss (UDP) SHALL be tolerated: **bounded read-back retry** (Req 2.7) re-queries a lost set/read-back a small fixed number of times, and read-back reconciliation (Req 11.2) corrects any UI that drifted from the mixer's actual state. IF retries are exhausted for a control, the affected channel/control SHALL be surfaced as unreconciled (Req 15.8) rather than silently showing a possibly-wrong value.
6. IF the capture pipeline dies while a gain modal is open (GStreamer/PipeWire process crash), THE gain modal SHALL detect the envelope stream stopping, flip live to the slider tier (Req 7.4) with a calm inline note, and SHALL NOT leave a frozen/stale envelope that could be misread as live. The capture layer SHALL attempt teardown/respawn so a subsequent open works.
7. THE Backend SHALL monitor the **mixer's own capture path** (its USB device presence in PipeWire, the capture pipeline, and its subscriptions) and attempt automatic recovery when a fault is detected (respawn/re-subscribe/reconnect). `AudioCaptureService` SHALL be the single owner of capture-pipeline respawn (the gain-modal stall detection in Req 15.6 reacts by flipping tiers but does not independently respawn, so two owners never race). IF automatic recovery is not possible, THE system SHALL raise a **catastrophic-tier modal** (steering §4 — `NotificationLevel: "modal"`, the same tier as `OBS_UNREACHABLE`, NOT a dismissible banner) via a **named raise event** (`BUS_MIXER_CAPTURE_PATH_LOST` → `stc:`), and SHALL **auto-clear** it via a **named resolution event** (`BUS_MIXER_CAPTURE_PATH_RESTORED`) when the path recovers — the same raise/resolution contract as `OBS_UNREACHABLE`, so the modal can never be left un-clearable. **Scope:** this covers the mixer's capture-path health only; it does **not** claim to guarantee the audio reaching the livestream/recording (that path is OBS → PipeWire → main-LR, which this system does not own — stream connectivity/platform health is already covered by the streaming service, and silent-but-connected outgoing audio is an OBS-level concern out of scope here). This honest scoping avoids giving false confidence that a green mixer widget means the stream has audio.
8. WHEN a fader or gain control's read-back is exhausted (Req 2.7/15.5), THE widget SHALL represent that control as **unreconciled** via a `data-state` value (e.g., `data-state="unreconciled"`) and a subtle visual treatment, rather than silently presenting the unconfirmed local value as authoritative. The unreconciled state SHALL clear automatically on the next confirmed value (read-back success or `/xremote` push). (Mute uses the explicit "Audio: Unknown" yellow-dot form of this, Req 6.6.)
