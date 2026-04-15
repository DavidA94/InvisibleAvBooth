---
inclusion: always
---

# Invisible A/V Booth — Steering Document

## 0. Technology Stack

- **Language:** TypeScript throughout — backend and frontend, no plain JS in `packages/`
- **Backend:** Node.js (`packages/backend`)
- **Frontend:** React + Ionic React (`packages/frontend`) — Ionic provides the touch-first component library; themed via CSS custom properties in `src/theme/variables.css`. **Zustand** is used for all frontend state management (slice pattern — auth, OBS state, session manifest, notifications — see design doc).
- **Structure:** Monorepo with a shared root ESLint + Prettier config and a `tsconfig.base.json`. Includes `packages/shared` for constants shared between frontend and backend (currently `BIBLE_BOOKS` — the `bookId` → display name mapping for KJV scripture references). `packages/shared` is a local workspace package (`@invisible-av-booth/shared`) with its own `tsconfig.json` extending `tsconfig.base.json`, consumed via TypeScript project references — no separate build step required.
- **Code style:** See `code-style.md` for naming conventions, formatting rules, and TypeScript patterns

---

## 1. Scope

The system provides **modular control of livestream operations** for a church environment.

### Initial Release Responsibilities

- **OBS Control:** Start/stop recording, start/stop streaming.

### Future Releases (out of scope for initial release)

- **Camera Control:** Manual PTZ control, presets for framing, tap-to-center behavior.
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

- **Frontend ↔ Backend:** JSON-based commands and status updates; backend mediates all device communication.
- **Backend ↔ Devices:** Handles all network/API calls to devices and reconciling reported states.
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

See `logging.md` for the full logging philosophy and conventions.

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

The dashboard is designed for tablet-first use. All sizing uses `rem` units so that a single root font-size adjustment scales the entire UI proportionally. Widget grid cells use percentages so they always fill the available viewport.

### Target Viewport Range

| Breakpoint        | Viewport              | Behavior                                                                   |
| ----------------- | --------------------- | -------------------------------------------------------------------------- |
| Minimum supported | 1024×768px            | Base design target — all layouts verified at this size                     |
| Comfortable range | 1024×768 – 1280×800px | More breathing room; additional status indicator labels may become visible |
| Large displays    | > 1280×800px          | UI scales up proportionally — everything gets bigger                       |
| Small displays    | < 1024×768px          | UI scales down proportionally — layout remains usable                      |

Phone-sized viewports are explicitly out of scope for this release and will be addressed in a future iteration.

### Root Font Size and Scaling

The base `font-size` on `<html>` is set to `16px` — the browser default. This is the reference point for all `rem` values.

For viewports outside the 1024–1280px range, a viewport-relative scaling approach is used:

```css
html {
  /* Scale the root font size proportionally to viewport width.
     - At 1024px: font-size = 16px (1rem = 16px)
     - At 1280px: font-size = 20px (1rem = 20px)
     - At 800px:  font-size = 12.5px (1rem = 12.5px)
     clamp() ensures the font never goes below 12px or above 24px,
     preventing unusable extremes on very small or very large screens. */
  font-size: clamp(12px, 1.5625vw, 24px);
}
```

`1.5625vw` is derived from `16 / 1024 * 100` — it produces exactly 16px at 1024px viewport width. This means every `rem` value in the codebase scales automatically with the viewport without any JavaScript or media query breakpoints.

**DPI handling**: Use CSS logical pixels throughout. The browser handles device pixel ratio (DPR) scaling automatically via the viewport meta tag (`<meta name="viewport" content="width=device-width, initial-scale=1">`). Do not use physical pixel values or attempt to detect DPR in application code.

**Pixel values in documentation**: Pixel equivalents may appear in documentation and comments as illustrative examples (e.g., "2.5rem ≈ 40px at base viewport"). They must never appear in component CSS, inline styles, or any runtime code. All implementation uses rem.

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

Widget cells are sized as percentages of the available grid area (viewport minus outer padding and gaps). The grid always fills the full viewport — widgets expand to fill their cells.

The following are illustrative pixel values at the 1024×768px base viewport only. No code should use these values — all implementation uses rem and percentages.

At 1024×768px landscape with `--space-screen-edge: 1rem` (≈16px) and `--space-grid-gap: 0.75rem` (≈12px):

- Available width: 1024 − 32px (2×edge) − 48px (4×gap between 5 cols) ≈ 944px → each column ≈ 188.8px
- Available height: 768 − 32px (2×edge) − 24px (2×gap between 3 rows) ≈ 712px → each row ≈ 237.3px

A 2×2 widget occupies ≈ 377.6px × 474.6px at the base viewport. These are examples only — see the OBS widget rem layout specification in the design doc for the authoritative rem-based layout.
