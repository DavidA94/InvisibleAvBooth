# Design Document — Lower Thirds

## Overview

This document extends the existing system design with a lower-third overlay capability. It covers the architecture, interfaces, data models, animation state machine, component specifications, and socket communication required to display animated lower-third graphics on a livestream via OBS.

This is an extension document — it references and builds on the original design docs at `.kiro/specs/livestream-control-system/design.md` and `.kiro/specs/multi-platform-streaming/design.md`. Patterns, conventions, and components defined there remain authoritative unless explicitly superseded here.

### What This Release Adds

- Static HTML overlay wrapper (`packages/overlay/lower-thirds.html`) for OBS `file://` loading
- Overlay React page (`/overlay/lower-thirds`) with Aspect Ratio Jail and animation engine
- Unauthenticated `/overlay` Socket.io namespace for display commands
- `LowerThirdService` — backend state management, auto-dismiss timers, transition locks
- `LowerThirdModule` — Socket.io gateway module for dashboard ↔ backend communication
- Overlay namespace handler — backend ↔ overlay communication
- Lower-third widget with swipe-to-reveal action pattern
- Extension of `metadata_templates` table for lower-third templates
- `POST /api/overlay/logs` — unauthenticated, rate-limited logging endpoint for the overlay
- Blue Rhombus animation style (entrance, exit, push-up, force-clear)
- Scripture pagination protocol (measure-on-add, cached page breaks, 10s timeout fallback)

### Breaking Changes

- **`metadata_templates` table**: `category` CHECK constraint expanded from `('title', 'description')` to `('title', 'description', 'lower_third')`. Two new nullable columns added: `lowerThirdType TEXT` and `autoDismissMs INTEGER`.
- **`MetadataTemplateDao`**: `TemplateCategory` type expanded. New methods for lower-third queries.
- **Admin Templates Page**: Third section added for lower-third templates.
- **`WidgetContainer`**: Modified to hide indicators area when `connections` is empty.

### Steering Document Updates Required

This spec introduces patterns not yet documented in the steering doc. The following updates are required during implementation:
- **§3 (Interfaces & Boundaries)**: Add `file://` and `/overlay` namespace boundaries
- **§6 (Logging)**: Add `"overlay"` as a third `source` value
- **§7 (Event Naming)**: Add `cto:` and `otc:` prefix rows; add overlay namespace exception note
- **§10 (Responsive Sizing)**: Clarify rem applies to dashboard; overlay uses `cqw`/`cqh`

---

## Architecture

### Extended Topology

```mermaid
graph TD
  subgraph OBS [OBS Studio]
    BrowserSource[Browser Source — file://overlay/lower-thirds.html]
    StaticWrapper[Static Wrapper — manages iFrame lifecycle]
    OverlayPage[Overlay Page — /overlay/lower-thirds]
    StaticWrapper --> OverlayPage
  end

  subgraph Frontend [packages/frontend]
    LowerThirdWidget[Lower Third Widget — new]
    AdminTemplates[Admin Templates Page — modified]
    OverlayRoute[/overlay/lower-thirds route — new, outside ProtectedRoutes]
  end

  subgraph Backend [packages/backend]
    LowerThirdService[LowerThirdService — new]
    LowerThirdModule[LowerThirdModule — new socket module]
    OverlayNamespace[/overlay namespace — new, unauthenticated]
    SessionManifestService[SessionManifestService — existing]
    MetadataTemplateDao[MetadataTemplateDao — modified]
    EventBus[EventBus]
    OverlayLogRoute[POST /api/overlay/logs — new, unauthenticated, rate-limited]
  end

  subgraph Storage
    AppDB[(SQLite app.db)]
    TemplatesTable[(metadata_templates — modified)]
    KJV[(kjv table — existing)]
  end

  BrowserSource -->|file://| StaticWrapper
  StaticWrapper -->|iFrame + postMessage| OverlayRoute
  OverlayPage -->|Socket.io /overlay| OverlayNamespace
  OverlayPage -->|POST /api/overlay/logs| OverlayLogRoute

  LowerThirdWidget -->|Socket.io default ns| LowerThirdModule
  LowerThirdModule --> LowerThirdService
  OverlayNamespace --> LowerThirdService

  LowerThirdService --> MetadataTemplateDao
  LowerThirdService --> KJV
  MetadataTemplateDao --> TemplatesTable

  EventBus -->|bus:session:manifest:updated| LowerThirdService
  EventBus -->|bus:lower-third:state:changed| LowerThirdModule
  LowerThirdService -->|bus:lower-third:state:changed| EventBus
```

### Key Architectural Decisions

**Two-layer overlay (static wrapper + iFrame)**: The static HTML file is loaded via `file://` in OBS, making it immune to frontend/backend availability at OBS startup time. The iFrame loads the React page only when the frontend signals readiness via postMessage. This eliminates the need to refresh the OBS browser source after system startup.

**Unauthenticated `/overlay` namespace**: The overlay page runs in OBS with no user interaction — there's no way to log in. The `/overlay` namespace accepts connections without JWT but only emits display commands and accepts phase reports. No control commands are accepted on this namespace. The namespace enforces single-client: new connections forcibly disconnect the previous client.

**No Staged section — Preview Dialog instead**: Rather than a persistent "Staged" queue, the volunteer sees a Preview Dialog before activation. This reduces widget complexity (two sections instead of three), provides a clear confirmation step, and eliminates the confusion of "what does staged mean?" The preview is ephemeral — dismissing the dialog cancels the action.

**Swipe-to-reveal actions**: Each row shows one primary button. Secondary actions are revealed by swiping. This reduces visual clutter while maintaining discoverability. The pattern is consistent across all rows.

**Force Clear bypasses everything**: The emergency clear action skips animation, ignores transition locks, and immediately hides the overlay. This is the "wrong content on screen" panic button.

**Backend owns all state**: The overlay is a pure renderer. The dashboard is a pure controller. The backend is the single source of truth.

**5-second fallback timeout**: If the overlay doesn't report phase completion, the backend advances state and notifies the dashboard. This prevents permanent lock-up from a crashed overlay.

---

## Backend Services

### LowerThirdService (New)

```typescript
interface LowerThirdService {
  // Library management
  getLibrary(): LowerThirdItem[];
  addToLibrary(input: AddLowerThirdInput): Result<LowerThirdItem, string>;
  removeFromLibrary(itemId: string): Result<void, string>;
  editLibraryItem(itemId: string, patch: EditLowerThirdInput): Result<LowerThirdItem, string>;

  // Activation (directly from library)
  activate(itemId: string): Result<void, string>;
  dismissActive(): Result<void, string>;
  forceClear(): void; // always succeeds, bypasses lock

  // Pagination (scripture)
  pageNext(): Result<void, string>;
  pagePrevious(): Result<void, string>;

  // Phase tracking (called by overlay namespace handler)
  reportPhase(phase: AnimationPhase): void;
  reportPages(itemId: string, pages: PageBreakdown): void;

  // Overlay connection
  setOverlayConnected(connected: boolean): void;
  getPendingMeasurements(): LowerThirdItem[];
  handleResolutionReport(data: ResolutionReport): void;

  // State
  getFullState(): LowerThirdState;
  isTransitionLocked(): boolean;

  destroy(): void;
}
```

**Constructor dependencies**: `MetadataTemplateDao`, `Database` (for KJV queries), `SessionManifestService`.

**EventBus subscriptions**: `BUS_SESSION_MANIFEST_UPDATED` — recomputes template-derived library items.

**EventBus emissions**: `BUS_LOWER_THIRD_STATE_CHANGED` — emitted on any state change.

### Animation State Machine

```
                ┌────────────────────────────────────┐
                │                                    │
                ▼                                    │
  ┌────────┐  show   ┌─────────┐  overlay   ┌─────────┐
  │ hidden │────────▶│ showing │──reports──▶│ visible │
  └────────┘         └─────────┘            └─────────┘
       ▲                                        │
       │                                        │ dismiss / auto-dismiss
       │              ┌───────────┐             │
       └──────────────│ dismissing│◀────────────┘
          overlay     └───────────┘
          reports

  Force Clear: ANY state ──────────────────────▶ hidden (instant)
```

**Transition lock**: Locked when phase is `showing` or `dismissing`. Unlocked when `visible` or `hidden`. Force Clear bypasses the lock.

**Push-up**: `visible` → `showing` directly (no `dismissing` step). Overlay handles internally.

**5-second fallback**: If overlay doesn't report within 5s, backend advances phase and emits warning notification.

### Core Types

```typescript
type LowerThirdType = "Title" | "TitleSubtitle" | "Scripture";
type AnimationPhase = "hidden" | "showing" | "visible" | "dismissing";
type LowerThirdStyle = "blue_rhombus";

interface LowerThirdItem {
  id: string;
  type: LowerThirdType;
  style: LowerThirdStyle;
  content: TitleContent | TitleSubtitleContent | ScriptureContent;
  autoDismissMs: number | null;
  source: "template" | "volunteer";
  templateId: string | null;
  templateName: string | null;
  used: boolean;
  createdAt: string;
  pages: PageBreakdown | null;
}

interface TitleContent { title: string; }
interface TitleSubtitleContent { title: string; subtitle: string; }
interface ScriptureContent {
  reference: ScriptureReference;
  formattedReference: string;
  verses: VerseData[] | null;
}
interface VerseData { verseNumber: number; text: string; }

interface PageBreakdown {
  totalPages: number;
  currentPage: number;
  pages: PageInfo[];
}
interface PageInfo { pageNumber: number; startVerse: number; endVerse: number; }

interface LowerThirdState {
  active: LowerThirdItem | null;
  library: LowerThirdItem[];
  phase: AnimationPhase;
  autoDismissAt: string | null;
  overlayConnected: boolean;
  transitionLocked: boolean;
}

interface AddLowerThirdInput {
  type: LowerThirdType;
  content: TitleContent | TitleSubtitleContent | { reference: ScriptureReference };
  autoDismissMs?: number;
}

interface EditLowerThirdInput {
  content?: TitleContent | TitleSubtitleContent | { reference: ScriptureReference };
  autoDismissMs?: number;
}
```

---

## Database Schema

### Modified Table: `metadata_templates`

```sql
CREATE TABLE IF NOT EXISTS metadata_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('title', 'description', 'lower_third')),
  formatString TEXT NOT NULL,
  roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
  lowerThirdType TEXT CHECK(lowerThirdType IN ('Title', 'TitleSubtitle', 'Scripture')),
  autoDismissMs INTEGER,
  createdAt TEXT NOT NULL
);
```

**Migration strategy**: SQLite cannot alter CHECK constraints. The migration in `applySchema()` SHALL:
1. Check if `lowerThirdType` column exists (via `PRAGMA table_info(metadata_templates)`)
2. If not: create a temp table with the new schema, copy all data, drop the original, rename temp to original
3. This runs once on first startup after upgrade; subsequent startups hit `IF NOT EXISTS` and skip

**Canonical JSON**: Lower-third `formatString` values are stored with keys sorted alphabetically. The DAO normalizes on write: `JSON.stringify(obj, Object.keys(obj).sort())`. This only applies to flat objects (which all lower-third format strings are).

---

## Event Constants

```typescript
// Backend-only EventBus
export const BUS_LOWER_THIRD_STATE_CHANGED = "bus:lower-third:state:changed" as const;

// Client → Server (dashboard → backend)
export const CTS_LOWER_THIRD_COMMAND = "cts:lower-third:command" as const;

// Server → Client (backend → dashboard)
export const STC_LOWER_THIRD_STATE = "stc:lower-third:state" as const;

// Controller → Overlay (backend → overlay, /overlay namespace)
export const CTO_LOWER_THIRD_SHOW = "cto:lower-third:show" as const;
export const CTO_LOWER_THIRD_DISMISS = "cto:lower-third:dismiss" as const;
export const CTO_LOWER_THIRD_PUSH_UP = "cto:lower-third:push-up" as const;
export const CTO_LOWER_THIRD_PAGE = "cto:lower-third:page" as const;
export const CTO_LOWER_THIRD_STATE = "cto:lower-third:state" as const;
export const CTO_LOWER_THIRD_MEASURE = "cto:lower-third:measure" as const;
export const CTO_LOWER_THIRD_FORCE_CLEAR = "cto:lower-third:force-clear" as const;

// Overlay → Controller (overlay → backend, /overlay namespace)
export const OTC_LOWER_THIRD_PHASE = "otc:lower-third:phase" as const;
export const OTC_LOWER_THIRD_RESOLUTION = "otc:lower-third:resolution" as const;
export const OTC_LOWER_THIRD_PAGES = "otc:lower-third:pages" as const;
```

---

## Socket.io Gateway

### LowerThirdModule (Default Namespace)

Implements `SocketModule`. Handles dashboard commands and broadcasts state.

```typescript
type LowerThirdCommand =
  | { type: "activate"; itemId: string }
  | { type: "dismiss-active" }
  | { type: "force-clear" }
  | { type: "add-to-library"; input: AddLowerThirdInput }
  | { type: "remove-from-library"; itemId: string }
  | { type: "edit-library-item"; itemId: string; patch: EditLowerThirdInput }
  | { type: "page-next" }
  | { type: "page-previous" };
```

Command acknowledgments use the existing `CommandResult` type: `{ success: true } | { success: false; error: string }`.

### Overlay Namespace (`/overlay`)

Registered as a standalone function (not a `SocketModule`) because it is unauthenticated and cannot satisfy the `AuthenticatedSocket` interface. This is a justified divergence from the standard pattern — documented in the steering doc update notes above.

**Single-client enforcement**: On new connection, forcibly disconnect any existing overlay client. Log a warning if this occurs.

```typescript
export function registerOverlayNamespace(io: Server, service: LowerThirdService): void {
  const overlay = io.of("/overlay");
  let currentSocket: Socket | null = null;

  overlay.on("connection", (socket) => {
    if (currentSocket) {
      currentSocket.disconnect(true);
      logger.warn("Previous overlay client forcibly disconnected");
    }
    currentSocket = socket;
    service.setOverlayConnected(true);

    // Initial state with skipEntrance flag
    const state = service.getFullState();
    socket.emit(CTO_LOWER_THIRD_STATE, { ...state, skipEntrance: state.phase === "visible" });

    // Pending measurements
    service.getPendingMeasurements().forEach((item) => {
      socket.emit(CTO_LOWER_THIRD_MEASURE, { itemId: item.id, verses: item.content.verses });
    });

    socket.on(OTC_LOWER_THIRD_PHASE, (phase) => service.reportPhase(phase));
    socket.on(OTC_LOWER_THIRD_RESOLUTION, (data) => service.handleResolutionReport(data));
    socket.on(OTC_LOWER_THIRD_PAGES, (data) => service.reportPages(data.itemId, data.pages));

    socket.on("disconnect", () => {
      currentSocket = null;
      service.setOverlayConnected(false);
    });
  });
}
```

---

## REST Routes

### Overlay Log Route

Mounted at `/api/overlay/logs` **without** authentication middleware. Rate-limited to 10 requests/minute per IP, max 10 entries per batch, max 1KB per entry.

```typescript
export function createOverlayLogRouter(): Router {
  const router = Router();
  router.post("/", rateLimiter, (req, res) => {
    const entries = req.body as LogEntry[];
    if (!Array.isArray(entries) || entries.length > 10) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }
    for (const entry of entries) {
      logger[entry.level ?? "info"](entry.message, { source: "overlay", ...(entry.context ? { context: entry.context } : {}) });
    }
    res.status(204).send();
  });
  return router;
}
```

---

## Frontend — Dashboard

### Zustand Slice

```typescript
interface LowerThirdSlice {
  lowerThirdState: LowerThirdState;
  setLowerThirdState: (state: LowerThirdState) => void;
}
```

### Widget: `LowerThirdWidget`

```
WidgetContainer (title: "Lower Thirds", connections: [])
├── ActiveSection
│   ├── ActiveRow (dismiss button visible, swipe-left for Force Clear)
│   │   ├── CountdownIndicator (if auto-dismiss)
│   │   └── StatusOverlay ("Dismissing...", blocks interaction)
│   └── PaginationRow (if paginated scripture)
├── LibrarySection
│   ├── TemplateItems (sorted by name)
│   │   └── Row (Show button visible, swipe-right for Go Live)
│   └── VolunteerItems (sorted by creation time)
│       └── Row (Show button visible, swipe-left for Edit/Delete, swipe-right for Go Live)
├── EmptyStates ("Nothing active", "No items available")
├── AddButton (dropdown → type → input dialog)
└── PreviewDialog (modal: content preview + Cancel/Go Live)
```

### Swipe-to-Reveal Implementation

Each row uses a swipeable container (e.g., CSS `transform: translateX()` with touch event handlers). Actions are revealed as icon+label buttons (icon on top, label below, 2.5rem × 2.5rem). Only one row may be swiped open at a time — opening a new row closes the previous.

---

## Frontend — Overlay Page

### Route Registration

```typescript
// Outside ProtectedRoutes — no auth wrapper, no layout
<Route path="/overlay/lower-thirds" element={<LowerThirdOverlay />} />
```

### Component: `LowerThirdOverlay`

- Connects to `/overlay` namespace (no auth)
- Waits for `document.fonts.ready` before sending `overlay-ready` postMessage
- Sends heartbeat postMessages every 5s to parent (static wrapper health check)
- Renders Aspect Ratio Jail + active lower-third
- Handles all CTO commands, reports phases via OTC
- Measures scripture in hidden container on `measure` command
- 15-second disconnect timeout for stuck graphic prevention
- Logs via `POST /api/overlay/logs`
- Force Clear: immediately sets `display: none`, reports `hidden`

### Animation Implementation

**Entrance**: Rhombus `scaleY(0→1)` from center (~200ms) → plate+text unfold right (~400ms)

**Exit**: Rhombus slides right as traveling curtain (~600ms) → rhombus `scaleY(1→0)` to center (~200ms)

**Push-up**: Container `overflow: hidden`, old `translateY(-100%)` + new `translateY(0)` (~300ms), plate height transitions

**Force Clear**: `display: none` — instant, no animation

### Aspect Ratio Jail CSS

```css
.aspect-ratio-jail {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-end;
  justify-content: flex-start;
  aspect-ratio: 16 / 9;
  max-width: 100vw;
  max-height: 100vh;
  margin: auto;
  container-type: size;
  container-name: overlay;
}
.lower-third-container { margin-bottom: 15cqh; margin-left: 3cqw; }
```

---

## Static Wrapper

### File: `packages/overlay/lower-thirds.html`

This is a static file directory, NOT an npm package. It does not participate in the build system. It is loaded directly by OBS via `file://` and documented in `docs/setup.md`.

```html
<!DOCTYPE html>
<html>
<head><meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
  iframe { border: none; width: 100%; height: 100%; display: none; }
</style>
</head>
<body data-overlay-url="https://invisible.av/overlay/lower-thirds">
<iframe id="overlay"></iframe>
<script>
const URL = document.body.dataset.overlayUrl;
const iframe = document.getElementById('overlay');
let heartbeatTimer = null;

function load() {
  iframe.src = URL;
  setTimeout(() => { if (iframe.style.display === 'none') { iframe.src = ''; setTimeout(load, 3000); } }, 10000);
}

window.addEventListener('message', (e) => {
  if (e.data?.type === 'overlay-ready') {
    iframe.style.display = 'block';
    resetHeartbeat();
  } else if (e.data?.type === 'overlay-heartbeat') {
    resetHeartbeat();
  }
});

function resetHeartbeat() {
  clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(() => { iframe.style.display = 'none'; iframe.src = ''; setTimeout(load, 3000); }, 10000);
}

load();
</script>
</body>
</html>
```

---

## Correctness Properties

1. **At most one active lower-third**: The service atomically swaps via push-up or clears via dismiss.
2. **Transition lock prevents race conditions**: No activate or dismiss accepted during `showing`/`dismissing`. Force Clear bypasses.
3. **Auto-dismiss timer isolation**: Each timer is per-item. Cancellation is explicit. A timer never dismisses a different item.
4. **Backend phase is authoritative**: 5-second fallback advances state if overlay is unresponsive.
5. **Canonical JSON prevents false duplicates**: Stored in sorted-key form; compared directly.
6. **Library items are stable**: Template items keyed by template ID. Volunteer items maintain creation-time order regardless of edits.
7. **Single overlay client**: New connections forcibly disconnect the previous. No doubled graphics.

---

## Testing Strategy

### Unit Tests
- `LowerThirdService` — state transitions, transition lock, auto-dismiss lifecycle, template resolution, force clear
- `MetadataTemplateDao` — lower-third CRUD, canonical JSON, duplicate detection
- `LowerThirdModule` — command handling, ack responses, initial state
- `LowerThirdWidget` — sections, swipe actions, preview dialog, countdown
- `LowerThirdOverlay` — phase reporting, measurement, disconnect timeout, force clear

### Integration Tests
- Full flow: add scripture → measure → activate via preview → paginate → dismiss
- Auto-dismiss: activate with timer → verify dismiss fires → verify phase transitions
- Push-up: activate A → activate B → verify push-up command
- Template resolution: update manifest → verify library recomputes
- Overlay reconnect: disconnect → reconnect → verify skipEntrance
- Force Clear: mid-animation → force clear → verify instant hidden

### Overlay Integration Tests (Playwright)
- **Show**: backend sends show → overlay renders → reports `showing` then `visible`
- **Dismiss**: backend sends dismiss → overlay animates → reports `dismissing` then `hidden`
- **Push-up**: activate A → push-up B → verify content swap → reports `showing` then `visible`
- **Measurement**: send measure → verify correct PageBreakdown response
- **Disconnect timeout**: disconnect → wait 15s → verify local dismiss
- **Reconnect skipEntrance**: activate → disconnect → reconnect → immediate render, reports `visible`
- **Reconnect after timer**: activate with auto-dismiss → disconnect → timer fires → reconnect → no render
- **Force Clear**: mid-animation → force-clear → instant hide, reports `hidden`
- **Resolution telemetry**: non-1920×1080 viewport → reports `isCorrect: false`

### Manual Testing
- OBS at 1920×1080: verify positioning, animations
- OBS wrong resolution: verify dashboard banner
- Scene switch: verify overlay stays connected
- Backend restart: verify overlay dismisses after 15s, reconnects cleanly
