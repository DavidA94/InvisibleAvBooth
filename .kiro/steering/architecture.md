---
inclusion: always
---

# Invisible A/V Booth — Steering Document

## 0. Technology Stack

- **Language:** TypeScript throughout — backend and frontend, no plain JS in `packages/`
- **Backend:** Node.js (`packages/backend`), Express v5 HTTP framework, Socket.io for real-time bidirectional communication
- **Frontend:** React + Ionic React (`packages/frontend`) — Ionic provides the touch-first component library; themed via CSS custom properties in `src/theme/variables.css`. **Zustand** is used for all frontend state management (slice pattern — auth, OBS state, session manifest, notifications — see design doc). **react-router** v7 for client-side routing. **react-select** for styled dropdowns.
- **Database:** SQLite via `better-sqlite3` — single-file embedded database (`data/app.db`), no external server required. WAL mode for concurrent read performance.
- **Authentication:** JWT issued as HttpOnly cookies (`token`), bcrypt for password hashing, role-based access control (ADMIN > AvPowerUser > AvVolunteer). A non-HttpOnly `user_info` cookie (`{ id, username, role }`) is set alongside the JWT so the frontend can hydrate auth state without decoding the token.
- **Device Integration:** obs-websocket-js for OBS Studio communication. `grandi` (NDI 6 SDK native bindings with prebuilt binaries) for camera video and OBS preview — dynamically imported at runtime; if unavailable, camera features degrade gracefully while the rest of the system operates normally. VISCA over IP is required for all camera PTZ control (grandi provides video receive only; PTZ support is not yet available in the library). `ws` (WebSocket library) for dedicated binary preview stream endpoints (separate from Socket.io). Device passwords encrypted at rest with AES-256-GCM via `DEVICE_SECRET_KEY` environment variable. DistroAV OBS plugin required for OBS NDI preview output (free, cross-platform — see `docs/setup.md`).
- **Streaming Infrastructure:** `node-media-server` as a local RTMP relay (accepts OBS stream, fans out to platforms). FFmpeg child processes forward from the relay to each platform's RTMP ingest URL (`-c copy`, no re-encoding). `googleapis` npm package for YouTube Live Streaming API; native `fetch` for Facebook Graph API (v25.0). OAuth tokens encrypted at rest alongside device passwords.
- **Structure:** Monorepo with a shared root ESLint + Prettier config and a `tsconfig.base.json`. Includes `packages/shared` (`@invisible-av-booth/shared`) for constants, types, and utilities shared between frontend and backend — socket event names (`CTS_*`/`STC_*`), REST URL constants, shared TypeScript types (`ObsState`, `Notification`, `GridManifest`, etc.), `BIBLE_BOOKS` data, and interpolation/scripture utilities. Consumed via TypeScript project references — no separate build step required.
- **Code style:** See `code-style.md` for naming conventions, formatting rules, and TypeScript patterns

---

## 1. Scope

The system provides **modular control of livestream operations** for a church environment.

### Initial Release Responsibilities

- **OBS Control:** Start/stop recording, start/stop streaming (via RTMP relay).
- **Multi-Platform Streaming:** Simultaneous streaming to YouTube and Facebook from a single OBS source, with per-platform lifecycle management, health monitoring, and auto-recovery.
- **Camera Control:** Manual PTZ control via VISCA over IP (required for all camera movement commands), live video preview via NDI (`grandi`), presets for framing, tap-to-center behavior, AI tracking toggles for supported camera models, dead-man's switch safety.
- **Video Preview:** Real-time fMP4 preview streams (OBS output and camera feeds) delivered over dedicated WebSocket endpoints via GStreamer transcoding at 720p 15fps with hardware encoder auto-detection (software fallback). GStreamer with the NDI plugin (`gst-plugin-ndi`) handles NDI receive, decode, scale, encode, and mux in a single process per source. Installation via `scripts/install-gstreamer-ndi.sh`.

### Future Releases (out of scope for initial release)

- **Audio Control:** Mixer volume, mute/unmute, and monitoring.
- **Text Overlays:** Lower-thirds, speaker names, Bible verses, lyrics, etc.

### Notes

- Presets may affect multiple devices simultaneously; presets are applied as starting points, not tracked as ongoing system states.
- Auto-camera switching and multi-user dashboards are out of scope for the initial release but should be supported in future extensible design.
- Devices are configured statically; automatic device discovery is not required.

---

## 2. Core Concepts & Responsibilities

### Modular Plugin Architecture

- Each device or device group is controlled by its own plugin/widget.
- Widgets communicate with the backend, which handles device APIs and state management.
- Widgets can control multiple devices, but should not override one another; multiple effects from a preset or manual adjustment are permitted.

### Event Bus / Subscription Model

- The backend exposes an internal event bus. Services and HAL components that need to react to state changes (e.g., Session_Manifest updates, device state changes) **subscribe** to the relevant events themselves.
- No service or module shall be hard-coded as a recipient of another module's output. Adding a new service must never require modifying an existing service or the event emitter.
- This applies to all internal backend pub/sub: Session_Manifest changes, device state changes, error events, and capability updates are all emitted on the bus; interested services subscribe independently.

### Backend as Authority

- All commands flow through the backend for authentication, error handling, and state management.
- For devices that **cannot be polled**, the backend maintains authoritative state to ensure continuity across clients (e.g., if a tablet changes).
- Each hardware or software integration must have a single backend abstraction layer responsible for all communication with that device or system.
- No widget, preset, or feature may communicate with a device directly; all interactions must go through the appropriate backend abstraction.
- This abstraction layer is responsible for:
  - Device communication
  - State reconciliation (polling vs. commanded state)
  - Error handling and reporting
- This constraint ensures consistency, prevents duplicated logic, and avoids conflicting commands to the same device.

### Widget-Centric State Visibility

- Each widget displays the real-time status of the device(s) it controls.
- Manual adjustments immediately reflect on the widget; presets are applied but not tracked as ongoing system states.

---

## 3. Interfaces & Boundaries

- **Reverse Proxy (Caddy):** All traffic flows through Caddy on port 443 (HTTPS). Caddy routes `/api/*`, `/socket.io/*`, and `/preview/*` to the Express backend on port 3001; all other requests go to the frontend (Vite dev server in development, static files in production). This eliminates CORS, simplifies cookie scoping, and ensures the frontend never needs to know the backend's port. See `Caddyfile` (production) and `Caddyfile.dev` (development).
- **Frontend ↔ Backend:** JSON-based commands and status updates over REST and Socket.io; backend mediates all device communication. All requests use relative URLs (`/api/...`, `/socket.io/...`) — Caddy handles routing to the correct server.
- **Backend ↔ Preview Clients:** Dedicated `/preview/*` WebSocket endpoints deliver binary fMP4 video streams to dashboard widgets (OBS preview and camera preview). These use the `ws` library (not Socket.io) for minimal-overhead binary transport. Authentication uses the same HttpOnly JWT cookie — the browser sends it automatically on same-origin WebSocket upgrade requests routed through Caddy. One endpoint per source: `/preview/obs` for the OBS NDI output, `/preview/camera/:cameraId` for each camera. The `ndiOutputName` field in OBS device metadata enables OBS preview via NDI (decoupled from RTMP relay — preview works even when not streaming). `PreviewStreamManager` handles lazy GStreamer spawn, fan-out to subscribers, grace period teardown, and hardware encoder selection.
- **Backend ↔ Devices:** Handles all network/API calls to devices and reconciling reported states.
- **Backend ↔ Streaming Platforms:** `StreamingPlatformService` orchestrates the full broadcast lifecycle (create → stream → end) via platform-specific clients (`YouTubeClient`, `FacebookClient`). OBS streams to a local RTMP relay; per-platform FFmpeg forwarders read from the relay and push to platform ingest URLs. The relay runs for the lifetime of the backend process. Platform configurations are hot-reloaded after admin CRUD operations (`reloadPlatforms()`) — no server restart required for new connections to take effect.
- **OBS Browser Source ↔ Overlay:** A static HTML file (`packages/overlay/lower-thirds.html`) is loaded via `file://` in OBS. It wraps an iFrame pointing at the frontend-served overlay page (`/overlay/lower-thirds`). The overlay page connects to the backend via an unauthenticated `/overlay` Socket.io namespace for display commands and phase reporting. Logging from the overlay uses `POST /api/overlay/logs` (unauthenticated, rate-limited).
- **Widget Responsibilities:**
  - Display device state and updates.
  - Communicate errors or alerts to the frontend via the `WidgetErrorOverlay` component (full scrim with action card) for unavailable states, and via the notification system for recoverable errors.
  - Respect device capabilities (disable or overlay controls for unsupported features).
  - Render a `WidgetContainer` as the outermost element, passing the widget's own title and connection state.

---

## 4. Failure Modes & Handling

### Notification Channels

1. **Toast Notifications:** Short-lived messages (~5s).
2. **Warning/Error Banners:** Persistent messages that can display multiple errors (“Error 1 of X”), dismissable by the user.
3. **Catastrophic Errors:** Modals, which can be auto-cleared when the backend emits a resolution event (e.g., OBS reconnects). The widget does not clear modals directly — it responds to backend-emitted resolution events.

### Error Sources

- Device offline
- Command failure
- OBS failure

### Recovery

- Widgets should poll device states where possible.
- Backend maintains persistent state for non-pollable devices to ensure consistency.
- Users are informed when errors resolve automatically.

---

## 5. Performance & Feedback

- Adjustments should propagate **as soon as possible** to widgets.
- **Optimistic UI updates** are acceptable where feasible, but backend reconciliation ensures accuracy.
- Boolean operations (start/stop recording or streaming) should show pending state until confirmation from the backend.
- Polling ensures device connectivity and reflects any changes in real time.

---

## 6. Logging

The system uses a unified log file (`logs/app.log`) that captures entries from both the backend and the frontend. Frontend log entries are forwarded to the backend via `POST /api/logs` and written by the backend logger, tagged with `"source": "frontend"`. This gives a single trace of what both sides were doing at the time of any failure.

The backend uses **winston** with two simultaneous transports: structured JSON to file (for parsing) and human-readable output to console (for live monitoring). Log rotation is handled by `winston-daily-rotate-file` with a 20MB cap — the oldest content is trimmed automatically when the limit is reached.

Log levels are `DEBUG / INFO / WARN / ERROR`. `DEBUG` is off by default and enabled via `LOG_LEVEL=debug`. All entries include a timestamp, source, level, message, and optional structured context. Any entry triggered by a user action includes the `userId`.

The `source` field identifies the origin: `"backend"` (default), `"frontend"` (via `POST /api/logs`), or `"overlay"` (via `POST /api/overlay/logs` — unauthenticated, rate-limited).

See `logging.md` for the full logging philosophy and conventions.

---

## 7. Event Naming Convention & Socket Module Pattern

### Event Name Prefixes

All event names in the system use a prefix that identifies the communication boundary:

| Prefix | Boundary                         | Direction          | Example                                                 |
| ------ | -------------------------------- | ------------------ | ------------------------------------------------------- |
| `bus:` | Internal EventBus (backend only) | Service → Service  | `bus:obs:state:changed`, `bus:session:manifest:updated` |
| `stc:` | Socket.io server-to-client       | Backend → Frontend | `stc:obs:state`, `stc:session:manifest:updated`         |
| `cts:` | Socket.io client-to-server       | Frontend → Backend | `cts:obs:command`, `cts:request:initial:state`          |
| `sto:` | Socket.io server-to-overlay      | Backend → Overlay  | `sto:lower-third:show`, `sto:lower-third:dismiss`       |
| `ots:` | Socket.io overlay-to-server      | Overlay → Backend  | `ots:lower-third:phase`, `ots:lower-third:resolution`   |

All event name constants are defined in `packages/shared/src/constants/socketEvents.ts` and exported from `@invisible-av-booth/shared`. Both frontend and backend import these constants — event names are never hardcoded as strings.

**Exception:** The `notification` socket event does not follow the `stc:` convention. This is a known inconsistency from the initial implementation.

**Exception:** The `/overlay` Socket.io namespace is unauthenticated and does not use the `SocketModule` interface. It is registered as a standalone namespace handler (`registerOverlayNamespace`) because it serves a non-interactive renderer (OBS browser source) that cannot authenticate via JWT. See `packages/backend/src/gateway/overlayNamespace.ts`.

**Exception:** The `/preview/*` WebSocket endpoints are raw binary transport (fMP4 video chunks via the `ws` library) and do not use Socket.io or the event naming convention. They have no named events — the server sends binary `Buffer` frames and the client receives them as `MessageEvent` data. Authentication is cookie-based (same HttpOnly JWT), and the endpoints are managed by `PreviewStreamManager`, not the `SocketGateway`. These are data streams, not command/event channels.

### Hot-Reload Bus Events

Admin configuration changes must take effect immediately without a server restart. Each domain that holds startup-loaded state subscribes to a bus event emitted by the admin route handler that modified the data. On receiving the event, the service reloads the affected data from the database and re-broadcasts state to connected clients.

| Event                        | Emitted by                                       | Subscribers           | Effect                                                                             |
| ---------------------------- | ------------------------------------------------ | --------------------- | ---------------------------------------------------------------------------------- |
| `BUS_CAMERA_DEVICE_CHANGED`  | `adminDeviceRoutes` (POST/PUT/DELETE camera-ptz) | `CameraService`       | Adds, updates, or removes camera instance (VISCA connection, NDI preview, polling) |
| `BUS_CAMERA_PRESETS_CHANGED` | `adminPresetRoutes` (POST/PUT/DELETE/reorder)    | `CameraService`       | Updates `instance.state.presets` so `activatePreset` uses current data             |
| `BUS_OBS_CONFIG_CHANGED`     | `adminDeviceRoutes` (POST/PUT/DELETE obs)        | `ObsNdiPreviewSource` | Re-reads `ndiOutputName`, re-registers/unregisters preview source                  |
| `BUS_TEMPLATES_CHANGED`      | `adminTemplateRoutes` (POST/PUT/DELETE)          | `LowerThirdService`   | Calls `recomputeTemplateItems()` to add/remove template-based lower-thirds         |

**Pattern:** The emitting route includes an `action` field (`"created"`, `"updated"`, or `"deleted"`) and the relevant ID. Subscribers use this to decide whether to add, refresh, or remove internal state. After reloading, subscribers broadcast updated state to frontends via the normal `BUS_*_STATE_CHANGED` → `STC_*` pipeline.

### Socket Module Pattern

Both backend and frontend use a modular pattern for organizing socket event handlers by domain.

**Backend** (`src/gateway/modules/`): Each module implements the `SocketModule` interface:

- `register(io)` — called once at startup; wires EventBus events to Socket.io broadcasts
- `registerSocket(auth)` — called per authenticated connection; registers per-socket `cts:` handlers
- `emitInitialState(auth)` — called when a client emits `cts:request:initial:state` (on connect and reconnect)

**Frontend** (`src/providers/socketModules/`): Each module exports a function that registers `socket.on()` listeners and wires incoming events to Zustand store actions. `SocketProvider` calls all modules on connect and cleans up on disconnect.

To add a new domain (e.g., audio mixer): create one backend module and one frontend module, register them in `socketGateway.ts` and `SocketProvider.tsx` respectively. No existing modules need modification.

---

## 8. Extensibility Considerations

- New device types or protocols can be added via additional widgets/plugins without requiring UI redesign.
- System design should not preclude multi-dashboard or multi-user operation in the future.
- Persistent backend state allows client continuity across tablets or devices when polling is unavailable.

---

## 9. UI Color Scheme

The system uses a dark-background, high-contrast theme optimized for touch use in a dimly lit church environment.

| Token                  | Value     | Usage                                                         |
| ---------------------- | --------- | ------------------------------------------------------------- |
| `color-primary`        | `#C0392B` | Primary accent — buttons, active states, brand                |
| `color-primary-hover`  | `#A93226` | Hover/pressed state for primary elements                      |
| `color-bg`             | `#1A1A1A` | Page/app background                                           |
| `color-surface`        | `#2C2C2C` | Widget/card backgrounds                                       |
| `color-surface-raised` | `#3A3A3A` | Elevated surfaces, dropdowns                                  |
| `color-text`           | `#F5F5F5` | Primary text                                                  |
| `color-text-muted`     | `#A0A0A0` | Secondary/disabled text                                       |
| `color-danger`         | `#FF4444` | Error states, destructive actions (distinct from primary red) |
| `color-success`        | `#27AE60` | Live/active/confirmed states (e.g., "Stream is Live")         |
| `color-warning`        | `#F39C12` | Warning banners, caution states                               |
| `color-border`         | `#444444` | Subtle borders and dividers                                   |

### Verified Contrast Ratios (WCAG 2.1)

| Pair                                            | Ratio   | Result                                                             |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `color-text` on `color-bg`                      | ~16.5:1 | ✅ AAA                                                             |
| `color-text` on `color-surface`                 | ~11.6:1 | ✅ AAA                                                             |
| `color-text` on `color-primary` (button labels) | ~4.7:1  | ✅ AA                                                              |
| `color-text` on `color-primary-hover`           | ~5.5:1  | ✅ AA                                                              |
| `color-text` on `color-success` (status badge)  | ~3.8:1  | ✅ AA Large only — use bold/large text only on success backgrounds |
| `color-text-muted` on `color-bg`                | ~5.3:1  | ✅ AA                                                              |
| `color-text-muted` on `color-surface`           | ~3.7:1  | ⚠️ Disabled/secondary text only — WCAG exempt for inactive UI      |
| `color-danger` on `color-bg`                    | ~5.0:1  | ✅ AA                                                              |
| `color-warning` on `color-bg`                   | ~8.6:1  | ✅ AAA                                                             |

### Rationale

- Dark background reduces glare on tablet screens in dim environments and makes colored status indicators pop.
- Deep red primary (`#C0392B`) is distinct from the brighter danger red (`#FF4444`), so accent and error states are never confused.
- Green success state is essential — "stream is live" must be unambiguous at a glance. Only use large/bold text on `color-success` backgrounds; if small text is ever needed on green, darken to `#219A52`.
- `color-text-muted` on `color-surface` is intentionally low-contrast for disabled/inactive labels, which are WCAG-exempt under 1.4.3.

---

## 10. Responsive Sizing System

The dashboard is designed for tablet-first use. All sizing uses `rem` units with a fixed root font size of `16px`, ensuring consistent text and element dimensions regardless of viewport width. The grid container uses percentage-based sizing with `max-width` and `max-height` constraints to adapt to different screen sizes without scaling the font.

### Target Viewport Range

| Breakpoint        | Viewport              | Behavior                                                                   |
| ----------------- | --------------------- | -------------------------------------------------------------------------- |
| Minimum supported | 1024×768px            | Base design target — all layouts verified at this size                     |
| Comfortable range | 1024×768 – 1280×800px | More breathing room; additional status indicator labels may become visible |
| Large displays    | > 1280×800px          | Grid stops growing at max-width/max-height; centered horizontally          |
| Small displays    | < 1024×768px          | Grid fills viewport; cells shrink proportionally via percentage sizing     |

Phone-sized viewports are explicitly out of scope for this release and will be addressed in a future iteration.

### Root Font Size

The `font-size` on `<html>` is set to a fixed `16px`. This is the reference point for all `rem` values. Unlike the previous `clamp()`-based approach, the font size does not change with viewport width — this eliminates inconsistent text rendering, unpredictable element sizes, and visual artifacts caused by fractional rem-to-pixel conversions at different viewport widths.

Viewport adaptation is handled entirely by the grid container:

- `width: 100%; max-width: 1400px` — fills the viewport horizontally up to a cap
- `height: 100%; max-height: 900px` — fills the viewport vertically up to a cap
- `margin: 0 auto` — centers the grid when the viewport exceeds the max dimensions

```css
html {
  font-size: 16px;
}
```

**DPI handling**: Use CSS logical pixels throughout. The browser handles device pixel ratio (DPR) scaling automatically via the viewport meta tag (`<meta name="viewport" content="width=device-width, initial-scale=1">`). Do not use physical pixel values or attempt to detect DPR in application code.

**Overlay page sizing**: The rem-based sizing system applies to the dashboard UI. The overlay page (`/overlay/lower-thirds`) runs inside an OBS browser source at a fixed resolution and uses container-relative units (`cqw`, `cqh`) based on a CSS container query (`container-type: size`) locked to 16:9 aspect ratio. This is a different rendering domain with different constraints — `cqw`/`cqh` ensure proportional scaling regardless of output resolution.

**Pixel values in documentation**: Pixel equivalents may appear in documentation and comments as illustrative examples (e.g., "2.5rem ≈ 40px"). They must never appear in component CSS, inline styles, or any runtime code. All implementation uses rem.

### Spacing Tokens

All spacing is defined in `rem` and applied consistently across the UI. These tokens are defined as CSS custom properties in `src/theme/variables.css`:

| Token                  | Value     | Usage                                                              |
| ---------------------- | --------- | ------------------------------------------------------------------ |
| `--space-screen-edge`  | `1rem`    | Dashboard outer padding (all four sides)                           |
| `--space-grid-gap`     | `0.75rem` | Gap between widgets in the dashboard grid                          |
| `--space-widget-inner` | `0.75rem` | WidgetContainer inner padding (all sides, uniformly enforced)      |
| `--space-control-gap`  | `0.75rem` | Gap between interactive controls (buttons, inputs) within a widget |

Using a single value (`0.75rem`) for grid gap, widget inner padding, and control gap is intentional — it creates visual rhythm where the space between widgets equals the space inside them, and the space between buttons matches both. This makes the layout feel consistent without requiring per-widget spacing decisions.

### Touch Target Standards

All interactive elements must meet WCAG 2.5.5 touch target guidelines:

| Target type                       | Minimum size                        | Recommended size  |
| --------------------------------- | ----------------------------------- | ----------------- |
| Primary action buttons            | 2.75rem × 2.75rem (44×44px at base) | 3rem × 3rem       |
| Secondary / icon buttons          | 2.5rem × 2.5rem (40×40px at base)   | 2.75rem × 2.75rem |
| Informational / display-only rows | No minimum                          | —                 |

Pixel values in this table are illustrative only (equivalent at 1024px base viewport). All implementation must use rem values.

The `WidgetContainer` title bar is 2.5rem (40px at base) — it is interactive (opens a popover) but is a secondary affordance not expected to be used frequently during live operation. This is a deliberate tradeoff: keeping it compact preserves vertical space for primary controls while remaining above the absolute minimum.

### Responsive Width Measurement in React

When a component needs to switch between display modes based on available width (e.g., `WidgetContainer` expanded vs. collapsed indicators), use a `ResizeObserver` via a custom `useResizeObserver` hook. This is the established React pattern for this use case:

- Fires automatically on orientation changes, window resizes, and any layout shift — no media query breakpoints needed
- Integrates cleanly with React state (`useState` + `useEffect`)
- Works correctly inside Ionic's layout system
- CSS container queries are an alternative but are less predictable inside Ionic's Shadow DOM component model

```typescript
// Pattern: observe an element's width and derive display mode
const titleBarRef = useRef<HTMLDivElement>(null);
const [isCollapsed, setIsCollapsed] = useState(false);

useEffect(() => {
  const observer = new ResizeObserver(([entry]) => {
    // Switch to collapsed when available width is below threshold
    setIsCollapsed(entry.contentRect.width < COLLAPSE_THRESHOLD_REM * BASE_FONT_SIZE);
  });
  if (titleBarRef.current) observer.observe(titleBarRef.current);
  return () => observer.disconnect();
}, []);
```

The threshold is defined in rem and converted to pixels at runtime using the current computed root font size, so it scales correctly with the viewport.

### Widget Grid Sizing

Widget cells are sized as percentages of the available grid area (grid container minus outer padding and gaps). The grid fills the viewport up to its maximum dimensions (`max-width: 1400px`, `max-height: 900px`), then centers horizontally.

The grid uses a 10×6 layout in landscape and 6×10 in portrait. This doubled cell count (from the original 5×3 / 3×5) allows finer-grained widget placement — widgets that previously occupied 2×2 cells in the coarser grid now occupy the same physical space but can be positioned with more precision, and smaller 1×1 widgets become practical.

The following are illustrative pixel values at the 1024×768px base viewport only. No code should use these values — all implementation uses rem and percentages.

At 1024×768px landscape with `--space-screen-edge: 1rem` (16px) and `--space-grid-gap: 0.75rem` (12px):

- Available width: 1024 − 32px (2×edge) − 108px (9×gap between 10 cols) ≈ 884px → each column ≈ 88.4px
- Available height: 768 − 32px (2×edge) − 60px (5×gap between 6 rows) ≈ 676px → each row ≈ 112.7px

A 2×2 widget occupies ≈ 188.8px × 237.4px at the base viewport. A 4×4 widget occupies ≈ 389.6px × 486.8px. These are examples only — see the OBS widget rem layout specification in the design doc for the authoritative rem-based layout.
