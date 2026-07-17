# Design Document — Dashboard Enhancements

## Overview

This document covers the design for three independent dashboard improvements: stereo audio level meters on the OBS Preview widget, a VISCA "Controls" connection status indicator on the Camera widget, and a fullscreen toggle button in the global title bar.

This is an extension document — it builds on the designs at `.kiro/specs/video-control-and-preview/design.md` (preview infrastructure, camera service, widget patterns). Patterns and conventions defined there remain authoritative.

### What This Release Adds

- GStreamer `level` element pipeline for stereo peak metering (backend)
- `stc:obs:audio:levels` Socket.io event for broadcasting dB levels
- `AudioLevelMeter` component in the OBS Preview widget (frontend)
- `viscaConnected` field on `CameraState` shared type
- "Controls" connection indicator on Camera widget (frontend)
- `FullscreenButton` component in `GlobalTitleBar` (frontend)

### Breaking Changes

None. All changes are additive.

---

## Architecture

### Audio Level Metering — Data Flow

```
OBS Studio → DistroAV NDI Output → GStreamer level pipeline (backend)
                                         │
                                         ▼
                                    Parse peak dB (L/R)
                                         │
                                         ▼
                              Socket.io broadcast: stc:obs:audio:levels
                                         │
                                         ▼
                              Zustand store → AudioLevelMeter component
```

The level pipeline is a third GStreamer process per OBS source (alongside the existing MJPEG video pipeline and mono PCM audio pipeline). It does not produce output data — it only measures. The `fakesink` element discards audio samples after the `level` element computes peaks.

### Key Design Decisions

**Separate pipeline for level metering (not modifying existing audio pipeline):**
The existing audio pipeline downmixes to mono for playback. Level metering requires stereo. Rather than changing the playback pipeline to stereo (doubling bandwidth to all clients for a feature only the meter uses), a lightweight read-only pipeline runs alongside it. The `level` element adds negligible CPU — it's simple RMS/peak math with no encoding or network output.

**Socket.io for level data (not the preview WebSocket):**
Level events are small (~40 bytes), low-frequency (10Hz), and should be received by all dashboard clients regardless of whether they're viewing the OBS preview. Socket.io's broadcast semantics are ideal. The preview WebSocket is for binary media streams — mixing control data into it would complicate framing.

**GStreamer `level` with `-m` flag for structured output:**
Running `gst-launch-1.0 -m` (messages) outputs level element messages to stdout as structured text. This is simpler to parse than capturing stderr debug output. The format includes per-channel peak and RMS values in dB at each interval.

**10Hz update rate:**
Audio meters typically update at 10-30Hz. 10Hz provides smooth visual motion while keeping Socket.io traffic minimal (~400 bytes/sec broadcast). The GStreamer `level` element's `interval` property is set to 100000000 nanoseconds (100ms).

**Peak-hold on frontend only:**
The backend sends instantaneous peak values. The 1-second peak-hold indicator is computed purely in the frontend (track max over a rolling window). This keeps the backend stateless and allows different UI implementations without changing the event format.

**`viscaConnected` as a separate field (not overloading `connected`):**
The existing `connected` field reflects NDI preview availability (whether the GStreamer video pipeline can reach the camera). VISCA connectivity is independent — the camera may be reachable over NDI but have a broken VISCA TCP connection (different port, firewall, etc.). Separate fields allow the UI to show distinct indicators for video and controls. These fields are fully independent: `connected: true` + `viscaConnected: false` is a normal state (video works, PTZ offline). `connected: false` + `viscaConnected: true` is theoretically possible (NDI source down but TCP still open) though unlikely in practice.

**Level pipeline exempt from MAX_PREVIEW_STREAMS:**
The level pipeline is measurement-only — it produces no video, has no WebSocket subscribers, and uses negligible CPU (simple RMS/peak math with `fakesink`). It is architecturally distinct from preview streams and does not count against the cap. Without this exemption, OBS preview (video + audio + level = 3 pipelines) plus two cameras would exceed the default limit of 4, blocking camera previews.

**Fullscreen button hidden when unsupported (not disabled):**
A disabled button wastes space and creates "why can't I use this?" confusion for non-technical volunteers. If fullscreen isn't available (e.g., some iOS WebViews), the button simply doesn't exist — the title bar remains clean.

---

## Backend Changes

### PreviewStreamManager — Level Pipeline Extension

A new method `spawnLevelPipeline` manages the metering pipeline lifecycle, tied to the OBS source's subscriber lifecycle.

```typescript
// Addition to PreviewSource interface
interface PreviewSource {
  // ... existing fields
  levelProcess: ChildProcess | null;   // GStreamer level metering pipeline
}

// New method on PreviewStreamManager
private spawnLevelPipeline(source: PreviewSource): void;
private killLevelPipeline(source: PreviewSource): void;
```

**GStreamer pipeline command:**

```
gst-launch-1.0 -m -q ndisrc ndi-name="{ndiName}" do-timestamp=true ! \
  decodebin ! audioconvert ! audio/x-raw,channels=2 ! \
  level interval=100000000 post-messages=true ! fakesink
```

- `-m` — print element messages to stdout (structured level data)
- `-q` — suppress progress output
- `channels=2` — preserve stereo for independent L/R metering
- `interval=100000000` — 100ms intervals = 10 updates/second
- `post-messages=true` — required for level element to emit bus messages
- `fakesink` — discard audio after measurement (no output)

**Level message parsing:**

GStreamer `level` messages output on stdout (with `-m` flag) in this format:

```
/GstPipeline:pipeline0/GstLevel:level0: peak, GstValueList:(double)-20.5, (double)-18.3;
```

The parser uses Node's `readline` interface on the stdout stream to guarantee line-complete input, regardless of OS stdout buffering behavior. This prevents partial lines from breaking the regex parser.

```typescript
import { createInterface } from "readline";

// Parser for GStreamer level output — line-buffered via readline
const LEVEL_PEAK_REGEX = /peak,\s*GstValueList:\(double\)([-\d.e+inf]+),\s*\(double\)([-\d.e+inf]+)/;

function attachLevelParser(process: ChildProcess, onLevel: (levels: { left: number; right: number }) => void): void {
  const rl = createInterface({ input: process.stdout! });

  // Coalescing: only emit the most recent reading per event loop tick.
  // If the event loop falls behind (busy with other I/O), multiple lines queue up
  // in the readline buffer. Without coalescing, all would be emitted in rapid
  // succession — broadcasting stale data to clients. This ensures only the latest
  // measurement reaches the EventBus, regardless of how many lines arrived while
  // the event loop was busy.
  let latestLevels: { left: number; right: number } | null = null;
  let emitScheduled = false;

  rl.on("line", (line) => {
    const parsed = parseLevelMessage(line);
    if (parsed) {
      latestLevels = parsed; // Always overwrite — only latest matters
      if (!emitScheduled) {
        emitScheduled = true;
        queueMicrotask(() => {
          if (latestLevels) {
            onLevel(latestLevels);
            latestLevels = null;
          }
          emitScheduled = false;
        });
      }
    }
  });
}

function parseLevelMessage(line: string): { left: number; right: number } | null {
  const match = line.match(LEVEL_PEAK_REGEX);
  if (!match) return null;
  const left = parseFloat(match[1]!);
  const right = parseFloat(match[2]!);
  // Log out-of-range values at DEBUG level for diagnostics
  if (Number.isFinite(left) && (left < -60 || left > 0)) {
    logger.debug("Audio level out of display range", { channel: "left", raw: left });
  }
  if (Number.isFinite(right) && (right < -60 || right > 0)) {
    logger.debug("Audio level out of display range", { channel: "right", raw: right });
  }
  // Clamp to display range; -Infinity from GStreamer represents silence
  return {
    left: Number.isFinite(left) ? Math.max(left, -60) : -60,
    right: Number.isFinite(right) ? Math.max(right, -60) : -60,
  };
}
```

**Why coalescing matters:** GStreamer writes level messages at a fixed 10Hz regardless of Node.js event loop availability. Under sustained load (e.g., simultaneous platform error recovery + camera state broadcasts), readline lines queue in the pipe buffer. Without coalescing, a 500ms stall would produce 5 rapid-fire stale emissions when the loop catches up. With coalescing, only the final (most recent) value is emitted — one broadcast, zero stale data. Under normal operation (one line per tick), behavior is identical to a naive implementation.

**Crash recovery:** The level pipeline uses the same restart strategy as the video pipeline — on unexpected exit, wait 2 seconds and retry if the parent OBS preview pipeline is still running. After 3 consecutive failures, enter "dormant" mode (stop retrying). The retry counter resets when a new OBS preview subscriber connects — this signals the NDI source is likely available again (e.g., OBS was restarted and is now back). This ensures meters recover after transient issues without requiring a backend restart. The `killProcess` method that tears down the OBS preview source SHALL kill all three pipelines (video, audio playback, level) to prevent orphaned processes.

**Lifecycle:** The level pipeline starts when `spawnPipeline` is called for the OBS source (first subscriber connects) and stops when the OBS source pipeline is killed (grace period expires after last subscriber disconnects). It is spawned in `spawnPipeline` alongside the existing `spawnAudioPipeline` call, gated by `source.withAudio`. The level pipeline does NOT count against `MAX_PREVIEW_STREAMS`.

**Level element detection:** At startup (alongside the existing `checkGstreamerPath()`), the backend runs `gst-inspect-1.0 level`. If it exits non-zero, level pipeline spawning is skipped entirely with a WARNING log. Meters never appear — graceful degradation.

**Event emission:** Parsed levels are emitted on the EventBus as `BUS_OBS_AUDIO_LEVELS`. The `ObsModule` subscribes and broadcasts to all connected Socket.io clients.

**Latency characteristics:** The level pipeline has lower latency than the video preview pipeline (~100ms vs ~300-500ms) because it performs no video decode, encode, or mux. Meters will visually lead the video preview by 200-400ms. This is standard broadcast meter behavior and is not a defect — audio meters in all professional environments lead their associated video monitors. The volunteer is checking "are the bars moving" and "am I clipping," not synchronizing specific syllables to lip movement.

### EventBus Event

```typescript
// New event in packages/backend/src/eventBus/types.ts
export const BUS_OBS_AUDIO_LEVELS = "bus:obs:audio:levels" as const;

// Payload: { left: number; right: number } — dBFS values, clamped to [-60, 0]
```

### ObsModule Extension

```typescript
// In ObsModule.register(io):
eventBus.subscribe(BUS_OBS_AUDIO_LEVELS, (levels) => {
  io.emit(STC_OBS_AUDIO_LEVELS, levels);
});
```

No `emitInitialState` for audio levels — they are ephemeral real-time data. The frontend receives the first event when the pipeline starts producing.

### Socket.io Event Constant

```typescript
// New in packages/shared/src/constants/socketEvents.ts
export const STC_OBS_AUDIO_LEVELS = "stc:obs:audio:levels" as const;
```

---

## Backend Changes — Camera VISCA Status

### CameraState Extension

```typescript
// In packages/shared/src/types/camera.ts — add to CameraState interface:
export interface CameraState {
  // ... existing fields
  viscaConnected: boolean;
}
```

### CameraService Modifications

The `CameraService` already tracks VISCA connection state via `ViscaCameraDriver.isConnected()`. The change is to:

1. Initialize `viscaConnected` in the `CameraState` object based on the VISCA driver's state after `connect()`.
2. Register an `onDisconnect` callback with the VISCA driver for sub-second disconnect detection.
3. Immediately set `viscaConnected = false` when any VISCA command throws a connection error.
4. Update `viscaConnected` when VISCA reconnects (on successful command or poll).

```typescript
// In CameraService.initialize(), after viscaDriver.connect():
if (viscaDriver) {
  // Register disconnect callback for immediate detection (sub-second)
  viscaDriver.onDisconnect = () => {
    if (instance.state.viscaConnected) {
      instance.state.viscaConnected = false;
      this.broadcastState(instance);
    }
  };

  viscaDriver.connect().then((ok) => {
    instance.state.viscaConnected = ok;
    if (ok) {
      instance.pollTimer = setInterval(() => this.pollPosition(instance), VISCA_POLL_INTERVAL_MS);
    }
    this.broadcastState(instance);
  });
}

// On any VISCA command failure (connection error) — immediate detection:
private async executeViscaCommand(instance: CameraInstance, command: () => Promise<void>): Promise<void> {
  try {
    await command();
    // Successful command — ensure viscaConnected is true (handles reconnect case)
    if (!instance.state.viscaConnected) {
      instance.state.viscaConnected = true;
      this.broadcastState(instance);
    }
  } catch (error) {
    if (isConnectionError(error)) {
      if (instance.state.viscaConnected) {
        instance.state.viscaConnected = false;
        this.broadcastState(instance);
      }
    }
    throw error;
  }
}

// Poll cycle is the BACKUP detection path:
private async pollPosition(instance: CameraInstance): Promise<void> {
  if (!instance.viscaDriver || !instance.viscaDriver.isConnected()) {
    if (instance.state.viscaConnected) {
      instance.state.viscaConnected = false;
      this.broadcastState(instance);
    }
    return;
  }
  // ... existing poll logic
  // Successful poll confirms connection:
  if (!instance.state.viscaConnected) {
    instance.state.viscaConnected = true;
    this.broadcastState(instance);
  }
}
```

The `ViscaCameraDriver` already sets `this.connected = false` on socket `close` and `error` events. With the `onDisconnect` callback, the `CameraService` is notified immediately (sub-second) rather than waiting for the next 5-second poll cycle. The poll cycle serves as a backup for edge cases where the callback might not fire (e.g., half-open TCP connections detected via failed inquiry).

**Disconnect debounce:** The transition to `viscaConnected = false` requires 2 consecutive failures before broadcasting to clients. A single transient error increments a failure counter but does not change the broadcast state. The second consecutive failure confirms the disconnect and broadcasts. This prevents the indicator from flapping red→green on brief network hiccups. The transition back to `true` has no debounce — any successful command or poll immediately restores healthy state and resets the failure counter.

```typescript
// Per-camera disconnect debounce
private viscaFailureCounts = new Map<string, number>();
const VISCA_DISCONNECT_THRESHOLD = 2;

private handleViscaFailure(instance: CameraInstance): void {
  const count = (this.viscaFailureCounts.get(instance.cameraId) ?? 0) + 1;
  this.viscaFailureCounts.set(instance.cameraId, count);
  if (count >= VISCA_DISCONNECT_THRESHOLD && instance.state.viscaConnected) {
    instance.state.viscaConnected = false;
    this.broadcastState(instance);
  }
}

private handleViscaSuccess(instance: CameraInstance): void {
  this.viscaFailureCounts.set(instance.cameraId, 0);
  if (!instance.state.viscaConnected) {
    instance.state.viscaConnected = true;
    this.broadcastState(instance);
  }
}
```

---

## Frontend Changes — Audio Level Meter

### Zustand Store Extension

Extend `ObsPreviewSlice` with audio level state:

```typescript
export interface ObsPreviewSlice {
  // ... existing fields
  obsAudioLevels: { left: number; right: number } | null;
  obsAudioEventsFlowing: boolean; // true = events arriving (pipeline working), false = stale (pipeline stalled)
  obsLevelPipelineAvailable: boolean; // false if gst-inspect-1.0 level failed at startup
  setObsAudioLevels: (levels: { left: number; right: number } | null) => void;
  setObsAudioEventsFlowing: (flowing: boolean) => void;
}
```

`obsAudioLevels` is set to `null` before the first event arrives (meters not yet visible).

**Staleness timeout:** The `AudioLevelMeter` component implements a 500ms staleness timeout. On each received event, a timer is reset and `obsAudioEventsFlowing` is set to `true`. If no event arrives within 500ms while the preview is active, `obsAudioEventsFlowing` is set to `false` (Audio indicator → red) and the meter bars are set to zero. The meters remain visible — they don't disappear. This communicates "metering pipeline is not responding" clearly: empty bars + red dot. When events resume, bars animate back to current levels and the indicator returns to green immediately.

### Socket Module Extension

In `obsSocketModule.ts`:

```typescript
import { STC_OBS_AUDIO_LEVELS } from "@invisible-av-booth/shared";

// Inside registerObsSocketHandlers:
socket.on(STC_OBS_AUDIO_LEVELS, (levels: { left: number; right: number }) => {
  useStore.getState().setObsAudioLevels(levels);
});
```

### AudioLevelMeter Component

Location: `packages/frontend/src/components/obs-preview/AudioLevelMeter.tsx`

```typescript
interface AudioLevelMeterProps {
  levels: { left: number; right: number } | null;
}
```

**Rendering structure:**

```
<div className="audio-meter-container">          ← fixed width ~1.5rem, full height
  <div className="audio-meter-bar-wrapper">      ← individual bar + label
    <div className="audio-meter-track">          ← background (dark), full height
      <div className="audio-meter-gradient"      ← full-height gradient, clipped by fill level
           style={{ '--fill-percent': `${percent}%` }} />
      <div className="audio-meter-nominal"/>     ← nominal range indicator band
      <div className="audio-meter-peak-hold"     ← thin line at peak position
           style={{ '--peak-percent': `${peakPercent}%` }} />
    </div>
    <span className="audio-meter-label">L</span>
  </div>
  <div className="audio-meter-bar-wrapper">      ← same for right
    ...
    <span className="audio-meter-label">R</span>
  </div>
</div>
```

**Color zone rendering approach:**

A single fixed CSS gradient covers the full height of the track. A `clip-path` reveals only the filled portion from the bottom up. Because the gradient element is always 100% height (regardless of fill level), the color zone positions never shift — green is always at the bottom, yellow always in the middle, red always at the top, at the same visual positions.

```css
.audio-meter-track {
  position: relative;
  height: 100%;
  background: var(--color-bg); /* dark unfilled area visible above the clip */
  border-radius: 2px;
  overflow: hidden;
}

.audio-meter-gradient {
  position: absolute;
  inset: 0;
  /* Fixed gradient — stops correspond to dB zone boundaries */
  background: linear-gradient(
    to top,
    var(--color-success) 0%,
    var(--color-success) 80%,
    /* green: -60 to -12 dBFS */ var(--color-warning) 80%,
    var(--color-warning) 95%,
    /* yellow: -12 to -3 dBFS */ var(--color-danger) 95%,
    var(--color-danger) 100% /* red: -3 to 0 dBFS */
  );
  /* Reveal only the bottom N% — top is clipped away */
  clip-path: inset(calc(100% - var(--fill-percent)) 0 0 0);
  transition: clip-path 50ms linear; /* smooth inter-update motion */
}

.audio-meter-nominal {
  /* Subtle band at 70-80% height (-18 to -12 dBFS) — nominal speech range */
  position: absolute;
  left: 0;
  right: 0;
  bottom: 70%;
  height: 10%; /* 70% to 80% */
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}

.audio-meter-peak-hold {
  position: absolute;
  left: 0;
  right: 0;
  bottom: var(--peak-percent);
  height: 2px;
  background: var(--color-text);
  opacity: 0.8;
  pointer-events: none;
}
```

**Why this works:** The `.audio-meter-gradient` element is always 100% of the track height. The CSS gradient percentages (80%, 95%, 100%) are relative to that full height — so green always occupies the bottom 80%, yellow the next 15%, red the top 5%. The `clip-path: inset(top 0 0 0)` hides the top portion, revealing only as much of the gradient as the current dB value requires. At 50% fill (-30 dBFS, solidly in green), you see only green. At 85% fill (-9 dBFS), green below transitioning to yellow at the top. The gradient positions never move regardless of fill level.

**dB to height conversion:**

```typescript
// Linear mapping of dB within the -60 to 0 range
function dBToPercent(dB: number): number {
  const clamped = Math.max(-60, Math.min(0, dB));
  return ((clamped + 60) / 60) * 100;
}
```

**Peak hold logic (frontend-only):**

```typescript
const [peakLeft, setPeakLeft] = useState(-60);
const [peakRight, setPeakRight] = useState(-60);
const peakTimerRef = useRef<ReturnType<typeof setTimeout>>();

useEffect(() => {
  if (levels) {
    if (levels.left > peakLeft) setPeakLeft(levels.left);
    if (levels.right > peakRight) setPeakRight(levels.right);
    // Decay peaks after 1 second of no new peak
    clearTimeout(peakTimerRef.current);
    peakTimerRef.current = setTimeout(() => {
      setPeakLeft(-60);
      setPeakRight(-60);
    }, 1000);
  }
}, [levels]);
```

### ObsPreviewWidget Layout Change

The widget content area layout changes from:

```
[─────────── video ───────────────]
```

To:

```
[──────── video ────────][meters]
```

CSS approach:

```css
.preview-video-container {
  display: flex;
  flex-direction: row;
  /* existing styles preserved */
}

.preview-video-area {
  flex: 1;
  min-width: 0;
  /* contains img, overlays, mute button */
}

.audio-meter-container {
  width: 1.5rem;
  display: flex;
  flex-direction: row;
  gap: 2px;
  padding: 0.25rem 0;
  align-items: stretch;
}
```

The meters only render when the OBS preview widget is active (connected to the preview WebSocket and has received at least one level event since mount). Once visible, meters remain visible for the lifetime of the widget — they never disappear mid-session. On staleness (500ms no events) or silence (both channels ≤-60dBFS for >3s), the bars drop to zero and the Audio indicator goes red, but the meter UI persists. This is independent of OBS streaming/recording state — the NDI output (and therefore the level pipeline) is available whenever DistroAV is enabled in OBS, including during pre-service setup and idle monitoring.

### OBS Preview Widget — Connection Status Indicators

The OBS Preview widget now exposes TWO connection indicators in its `WidgetContainer`:

```typescript
function deriveObsPreviewConnections(
  wsState: WebSocketState,
  framesRecent: boolean,
  ndiSourceConfigured: boolean,
  levelPipelineAvailable: boolean, // gst-inspect-1.0 level succeeded at startup
  audioEventsFlowing: boolean, // receiving stc:obs:audio:levels events (not stale)
): ConnectionStatus[] {
  const connections: ConnectionStatus[] = [];

  // Feed (video) — existing indicator
  if (!ndiSourceConfigured) {
    connections.push({ label: "Feed", status: "inactive" });
  } else if (wsState === "connected" && framesRecent) {
    connections.push({ label: "Feed", status: "healthy" });
  } else {
    connections.push({ label: "Feed", status: "unhealthy" });
  }

  // Audio (metering pipeline health)
  if (!levelPipelineAvailable) {
    // level element not installed — metering permanently unavailable
    connections.push({ label: "Audio", status: "inactive" });
  } else if (audioEventsFlowing) {
    // Events arriving — pipeline is working (regardless of signal level)
    connections.push({ label: "Audio", status: "healthy" });
  } else {
    // Events stopped (500ms timeout) — pipeline crashed or stalled
    connections.push({ label: "Audio", status: "unhealthy" });
  }

  return connections;
}
```

**Audio health logic:**

- `audioActive`: true when level events are being received (resets to false on 500ms timeout with no events)
- `audioHealthy`: `audioActive` — that's it. If events are arriving, the metering pipeline is working and the indicator is green. Silence (both channels ≤ -60 dBFS) is a valid healthy state — the bars show zero and the volunteer can see that and decide if it's intentional (e.g., muted during a break). The indicator only goes red when the pipeline itself has failed (no data arriving).
- The 500ms threshold catches pipeline crashes quickly without false-triggering on normal event loop jitter.

**ConnectionStatus mapping:** The "Audio" indicator uses the existing `ConnectionStatus` type (same as "Feed", "Controls", and all other widget indicators). The mapping is: green = `{ label: "Audio", status: "healthy" }`, red = `{ label: "Audio", status: "unhealthy" }`, grey = `{ label: "Audio", status: "inactive" }`. No new indicator model is needed — this fits cleanly into the existing `connections: ConnectionStatus[]` array passed to `WidgetContainer`.

**Data channel clarification:** The level pipeline's _lifecycle_ is tied to OBS preview subscribers (starts/stops with the video pipeline), but the level _data_ flows via Socket.io (`stc:obs:audio:levels`), NOT via the binary `/preview/obs` WebSocket. The binary WebSocket carries fMP4 video (and mono PCM audio for playback); the level event is a small JSON payload (~40 bytes) broadcast to all connected clients via the SocketModule pattern. These are separate channels that happen to share a lifecycle trigger.

**Zustand store extension:**

```typescript
export interface ObsPreviewSlice {
  // ... existing fields
  obsAudioLevels: { left: number; right: number } | null;
  obsAudioEventsFlowing: boolean; // true = events arriving (pipeline working), false = stale (pipeline stalled)
  obsLevelPipelineAvailable: boolean; // false if gst-inspect-1.0 level failed at startup
  setObsAudioLevels: (levels: { left: number; right: number } | null) => void;
  setObsAudioEventsFlowing: (flowing: boolean) => void;
}
```

---

## Frontend Changes — Camera VISCA Status

### Connection Derivation

The `CameraWidget` currently derives a single connection indicator:

```typescript
function deriveConnection(state: CameraState | null): ConnectionStatus {
  if (!state) return { label: "Camera", status: "inactive" };
  if (state.connected) return { label: "Camera", status: "healthy" };
  return { label: "Camera", status: "unhealthy" };
}
```

This expands to return an array:

```typescript
function deriveConnections(state: CameraState | null): ConnectionStatus[] {
  const connections: ConnectionStatus[] = [];

  // Camera (NDI preview) — always present
  if (!state) {
    connections.push({ label: "Camera", status: "inactive" });
  } else if (state.connected) {
    connections.push({ label: "Camera", status: "healthy" });
  } else {
    connections.push({ label: "Camera", status: "unhealthy" });
  }

  // Controls (VISCA) — only present if camera has VISCA-using features
  if (state && hasViscaFeatures(state.features)) {
    connections.push({
      label: "Controls",
      status: state.viscaConnected ? "healthy" : "unhealthy",
    });
  }

  return connections;
}

const VISCA_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom", "focus"];

function hasViscaFeatures(features: CameraFeature[]): boolean {
  return features.some((f) => VISCA_FEATURES.includes(f));
}
```

**Decision: the "Controls" indicator appears based on the camera's `features` array, not on `viscaEnabled` metadata.** The features array represents what the UI exposes to the user. If no VISCA-dependent features are enabled (even if VISCA is technically connected), there's no point showing a "Controls" status — the user has no controls to use.

### WidgetContainer Usage

The `CameraWidget` currently passes `connections={[connection]}`. This changes to `connections={connections}` (the array from `deriveConnections`).

---

## Frontend Changes — Fullscreen Toggle

### FullscreenButton Component

Location: `packages/frontend/src/components/FullscreenButton.tsx`

```typescript
import { useState, useEffect, useCallback } from "react";
import { IonIcon } from "@ionic/react";
import { expandOutline, contractOutline } from "ionicons/icons";

export function FullscreenButton(): ReactNode | null {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Feature detection — don't render if unsupported
  const supported = typeof document !== "undefined" &&
    (document.fullscreenEnabled || (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled);

  useEffect(() => {
    const handler = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  const toggle = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Fullscreen not permitted (permissions policy, iOS WebView restrictions, etc.)
      // The fullscreenchange event won't fire, so the button icon remains consistent.
      // No user-visible error — the button simply doesn't take effect.
    }
  }, []);

  if (!supported) return null;

  return (
    <button
      data-testid={TEST_ID_FULLSCREEN_BUTTON}
      className="fullscreen-button"
      onClick={toggle}
      aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
    >
      <IonIcon icon={isFullscreen ? contractOutline : expandOutline} />
    </button>
  );
}
```

### GlobalTitleBar Integration

The `FullscreenButton` is placed immediately before the username span:

```tsx
<span className="fill-remaining" />
<FullscreenButton />
<span data-testid={TEST_ID_TITLE_BAR_USERNAME} className="margin-right-tight">
  {user.username}
</span>
```

### Styling

```css
.fullscreen-button {
  background: transparent;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 4px;
  margin-right: 0.5rem;
  transition: color 0.15s ease;
}

.fullscreen-button:hover,
.fullscreen-button:active {
  color: var(--color-text);
}

.fullscreen-button ion-icon {
  font-size: 1.25rem;
}
```

---

## Shared Package Changes

### Socket Events (`packages/shared/src/constants/socketEvents.ts`)

```typescript
// New — audio metering
export const STC_OBS_AUDIO_LEVELS = "stc:obs:audio:levels" as const;
```

### Camera Types (`packages/shared/src/types/camera.ts`)

```typescript
export interface CameraState {
  // ... existing fields
  viscaConnected: boolean;
}
```

---

## Test IDs

New constants in `packages/frontend/src/constants/testIds.ts`:

```typescript
export const TEST_ID_AUDIO_METER_CONTAINER = "audio-meter-container";
export const TEST_ID_AUDIO_METER_LEFT = "audio-meter-left";
export const TEST_ID_AUDIO_METER_RIGHT = "audio-meter-right";
export const TEST_ID_FULLSCREEN_BUTTON = "fullscreen-button";
```

---

## Integration Test Design

### Backend — Audio Level Events

**File:** `packages/backend/tests/integration/gateway/audio-levels.test.ts`

**Approach:** Use the existing test harness. The fake spawn (`createFakeSpawn`) is extended to support simulating GStreamer level output on stdout for the level pipeline process.

```typescript
describe("OBS Audio Level Broadcasting", () => {
  it("emits stc:obs:audio:levels with correct L/R values from level pipeline", async () => {
    // 1. Build test server with OBS NDI source configured
    // 2. Connect a preview WebSocket subscriber (triggers pipeline spawn)
    // 3. Simulate level pipeline stdout: "peak, GstValueList:(double)-20.5, (double)-6.3;"
    // 4. Assert socket client receives { left: -20.5, right: -6.3 }
  });

  it("emits correct values when L and R are identical", async () => {
    // Simulate: "peak, GstValueList:(double)-15.0, (double)-15.0;"
    // Assert: { left: -15, right: -15 }
  });

  it("clamps silence to -60", async () => {
    // Simulate: "peak, GstValueList:(double)-inf, (double)-inf;"
    // Assert: { left: -60, right: -60 }
  });

  it("does not emit audio levels when no preview subscribers", async () => {
    // No WS connection → level pipeline not spawned → no events
  });

  it("restarts level pipeline on crash and resumes events", async () => {
    // 1. Connect subscriber, verify events flowing
    // 2. Simulate level process exit (non-zero)
    // 3. Verify restart after 2s delay
    // 4. Simulate stdout from new process
    // 5. Assert socket client receives resumed events
  });

  it("stops retrying after 3 consecutive failures", async () => {
    // Simulate 3 consecutive process exits
    // Assert no further spawn attempts
    // Assert no stale events emitted
  });

  it("does not count against MAX_PREVIEW_STREAMS", async () => {
    // Configure MAX_PREVIEW_STREAMS=4
    // Connect OBS preview subscriber (spawns video + audio + level = 3 processes)
    // Connect 2 camera preview subscribers (spawns 2 more video processes)
    // Assert all 5 connections succeed — level pipeline is exempt from the cap
  });
});
```

### Backend — Camera VISCA Connection Status

**File:** `packages/backend/tests/integration/camera/camera.test.ts` (extend existing)

```typescript
describe("VISCA connection status", () => {
  it("broadcasts viscaConnected=true after successful VISCA connect", async () => {
    // Fake VISCA driver returns connect() → true
    // Socket client receives camera state with viscaConnected: true
  });

  it("broadcasts viscaConnected=false immediately on socket disconnect (via onDisconnect callback)", async () => {
    // Fake VISCA driver triggers onDisconnect callback
    // Socket client receives state update with viscaConnected: false within <100ms
    // (Not waiting for 5s poll cycle)
  });

  it("broadcasts viscaConnected=false immediately on command failure (connection error)", async () => {
    // Issue a PTZ command that throws ECONNRESET
    // Socket client receives viscaConnected: false immediately
  });

  it("broadcasts viscaConnected=true on reconnection (successful command after disconnect)", async () => {
    // After disconnect, issue command that succeeds (auto-reconnect)
    // Socket client receives viscaConnected: true
  });

  it("poll cycle detects half-open connection as backup", async () => {
    // Simulate case where onDisconnect didn't fire but isConnected() returns false
    // Wait for poll cycle
    // Socket client receives viscaConnected: false
  });
});
```

### Frontend (Playwright) — Audio Meters

**File:** `packages/frontend/playwright/e2e/obs-audio-meters.spec.ts`

```typescript
describe("OBS Audio Level Meters", () => {
  it("displays meters at correct height for given dB values", async () => {
    // Mock socket to emit stc:obs:audio:levels with known values
    // Assert meter fill heights correspond to dB→percent mapping
  });

  it("moves L and R meters independently", async () => {
    // Emit { left: -6, right: -30 }
    // Assert left meter is taller than right meter
  });

  it("hides meters when no level events received", async () => {
    // Don't emit any stc:obs:audio:levels events
    // Assert audio-meter-container is not visible (levels === null)
  });

  it("displays meters regardless of mute state", async () => {
    // Click mute button, then check meters still visible and updating
  });

  it("drops meters to zero and shows unhealthy Audio indicator on staleness", async () => {
    // Emit level events, verify meters visible with fill
    // Stop emitting events, wait 600ms
    // Assert meters still visible but bars at zero (no fill)
    // Assert Audio connection indicator shows unhealthy (red)
  });

  it("shows nominal range indicator band at correct position", async () => {
    // Assert the nominal range visual element exists between 70-80% height
  });
});
```

### Frontend (Playwright) — Camera Controls Status

**File:** `packages/frontend/playwright/e2e/camera-widget.spec.ts` (extend existing)

```typescript
describe("Camera Controls status indicator", () => {
  it("shows Controls healthy when viscaConnected is true and PTZ features enabled", async () => {
    // Mock camera state with viscaConnected: true, features: ["pan", "tilt", "zoom"]
    // Assert "Controls" text visible with healthy status dot
  });

  it("shows Controls unhealthy when viscaConnected is false", async () => {
    // Mock camera state with viscaConnected: false, features: ["pan", "tilt", "zoom"]
    // Assert "Controls" text visible with unhealthy status dot
  });

  it("does not show Controls indicator when no VISCA features", async () => {
    // Mock camera state with features: [] (or only non-VISCA features)
    // Assert "Controls" text NOT present
  });

  it("does not show Controls indicator for NDI-only camera", async () => {
    // Mock camera state with viscaConnected: false, features: []
    // Assert only "Camera" indicator present
  });
});
```

### Frontend (Playwright) — Fullscreen Toggle

**File:** `packages/frontend/playwright/e2e/fullscreen-toggle.spec.ts`

```typescript
describe("Fullscreen Toggle", () => {
  it("shows fullscreen button when fullscreenEnabled is true", async () => {
    // Default browser supports fullscreen
    // Assert button with expand-outline icon is visible
  });

  it("enters fullscreen on click and changes icon to contract-outline", async () => {
    // Click the button
    // Assert requestFullscreen was called
    // Simulate fullscreenchange event
    // Assert icon changed to contract-outline
  });

  it("exits fullscreen on second click and changes icon back", async () => {
    // Enter fullscreen, then click again
    // Assert exitFullscreen was called
    // Simulate fullscreenchange event
    // Assert icon changed to expand-outline
  });

  it("updates icon when fullscreen exited via other means", async () => {
    // Enter fullscreen via button
    // Simulate fullscreenchange with fullscreenElement = null (user pressed Escape)
    // Assert icon is back to expand-outline without button click
  });

  it("does not render button when fullscreenEnabled is false", async () => {
    // Mock document.fullscreenEnabled = false
    // Assert button not in DOM
  });

  it("handles requestFullscreen rejection gracefully", async () => {
    // Mock requestFullscreen to reject
    // Click button
    // Assert no error thrown, icon unchanged
  });
});
```

Note: Playwright can interact with the Fullscreen API in headed mode. In headless mode, `requestFullscreen()` may not actually change the visual state, but the API calls and events can still be tested by evaluating `document.fullscreenElement` and dispatching `fullscreenchange` events programmatically.

---

## File Summary

### New Files

| Path                                                                    | Purpose                                        |
| ----------------------------------------------------------------------- | ---------------------------------------------- |
| `packages/frontend/src/components/obs-preview/AudioLevelMeter.tsx`      | Stereo audio level bar component               |
| `packages/frontend/src/components/obs-preview/AudioLevelMeter.test.tsx` | Unit tests for meter rendering and peak hold   |
| `packages/frontend/src/components/FullscreenButton.tsx`                 | Fullscreen toggle button component             |
| `packages/frontend/src/components/FullscreenButton.test.tsx`            | Unit tests for fullscreen detection and toggle |
| `packages/frontend/playwright/e2e/obs-audio-meters.spec.ts`             | Playwright e2e for audio meters                |
| `packages/frontend/playwright/e2e/fullscreen-toggle.spec.ts`            | Playwright e2e for fullscreen                  |
| `packages/backend/tests/integration/gateway/audio-levels.test.ts`       | Backend e2e for level event broadcasting       |

### Modified Files

| Path                                                                | Change                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `packages/shared/src/constants/socketEvents.ts`                     | Add `STC_OBS_AUDIO_LEVELS`                                                                                   |
| `packages/shared/src/types/camera.ts`                               | Add `viscaConnected` to `CameraState`                                                                        |
| `packages/backend/src/eventBus/types.ts`                            | Add `BUS_OBS_AUDIO_LEVELS`                                                                                   |
| `packages/backend/src/services/previewStreamManager.ts`             | Add level pipeline spawn/kill/parse                                                                          |
| `packages/backend/src/gateway/modules/obs/obsModule.ts`             | Subscribe to `BUS_OBS_AUDIO_LEVELS`, broadcast                                                               |
| `packages/backend/src/camera/CameraService.ts`                      | Set/update `viscaConnected` on state, register onDisconnect callback, immediate detection on command failure |
| `packages/backend/src/camera/ViscaCameraDriver.ts`                  | Add `onDisconnect` callback field, invoke on socket close/error                                              |
| `packages/frontend/src/store/obsPreviewSlice.ts`                    | Add `obsAudioLevels`, `obsAudioEventsFlowing`, `obsLevelPipelineAvailable` state                             |
| `packages/frontend/src/providers/socketModules/obsSocketModule.ts`  | Handle `STC_OBS_AUDIO_LEVELS`                                                                                |
| `packages/frontend/src/components/obs-preview/ObsPreviewWidget.tsx` | Add `AudioLevelMeter` to layout, add "Audio" connection indicator                                            |
| `packages/frontend/src/components/camera/CameraWidget.tsx`          | Expand connections array with Controls                                                                       |
| `packages/frontend/src/components/GlobalTitleBar.tsx`               | Add `FullscreenButton`                                                                                       |
| `packages/frontend/src/constants/testIds.ts`                        | Add new test ID constants                                                                                    |
| `packages/frontend/playwright/e2e/camera-widget.spec.ts`            | Add Controls indicator tests                                                                                 |
| `packages/backend/tests/integration/camera/camera.test.ts`          | Add viscaConnected tests                                                                                     |
