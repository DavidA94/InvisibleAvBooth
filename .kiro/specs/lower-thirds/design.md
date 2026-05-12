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
- Overlay socket module — backend ↔ overlay communication
- Lower-third widget for the volunteer dashboard
- Extension of `metadata_templates` table for lower-third templates
- `POST /api/overlay/logs` — unauthenticated logging endpoint for the overlay
- Blue Rhombus animation style (entrance, exit, push-up transitions)
- Scripture pagination protocol (measure-on-add, cached page breaks)

### Breaking Changes

- **`metadata_templates` table**: `category` CHECK constraint expanded from `('title', 'description')` to `('title', 'description', 'lower_third')`. Two new nullable columns added: `lowerThirdType TEXT` and `autoDismissMs INTEGER`.
- **`MetadataTemplateDao`**: `TemplateCategory` type expanded. New methods for lower-third queries.
- **Admin Templates Page**: Third section added for lower-third templates.

---

## Architecture

### Extended Topology

```mermaid
graph TD
  subgraph OBS [OBS Studio]
    BrowserSource[Browser Source — file://overlay/lower-thirds.html]
    StaticWrapper[Static Wrapper — polls frontend, manages iFrame]
    OverlayPage[Overlay Page — /overlay/lower-thirds]
    StaticWrapper --> OverlayPage
  end

  subgraph Frontend [packages/frontend]
    LowerThirdWidget[Lower Third Widget — new]
    AdminTemplates[Admin Templates Page — modified]
    OverlayRoute[/overlay/lower-thirds route — new]
  end

  subgraph Backend [packages/backend]
    LowerThirdService[LowerThirdService — new]
    LowerThirdModule[LowerThirdModule — new socket module]
    OverlayNamespace[/overlay namespace — new]
    SessionManifestService[SessionManifestService — existing]
    MetadataTemplateDao[MetadataTemplateDao — modified]
    EventBus[EventBus]
    OverlayLogRoute[POST /api/overlay/logs — new]
  end

  subgraph Storage
    AppDB[(SQLite app.db)]
    TemplatesTable[(metadata_templates — modified)]
    KJV[(kjv table — existing)]
  end

  BrowserSource -->|file://| StaticWrapper
  StaticWrapper -->|iFrame src| OverlayRoute
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

### New Communication Boundaries

| Boundary | Protocol | Notes |
|----------|----------|-------|
| Static Wrapper → Frontend | HTTP HEAD poll | Checks if `/overlay/lower-thirds` returns 200 |
| Static Wrapper ↔ Overlay Page | postMessage | Only `{ type: "overlay-ready" }` from iFrame to parent |
| Overlay Page ↔ Backend | Socket.io `/overlay` ns | Unauthenticated; display commands + phase reports |
| Dashboard ↔ Backend (lower-thirds) | Socket.io default ns | Authenticated; control commands + state updates |
| Overlay Page → Backend (logs) | REST POST | `POST /api/overlay/logs` — unauthenticated |
| Backend → KJV table | SQLite query | Verse text lookup for scripture lower-thirds |

### Key Architectural Decisions

**Two-layer overlay (static wrapper + iFrame)**: The static HTML file is loaded via `file://` in OBS, making it immune to frontend/backend availability at OBS startup time. The iFrame loads the React page only when the frontend is confirmed healthy. This eliminates the need to refresh the OBS browser source after system startup.

**Unauthenticated `/overlay` namespace**: The overlay page runs in OBS with no user interaction — there's no way to log in. The `/overlay` namespace accepts connections without JWT but only emits display commands and accepts phase reports. No control commands (promote, dismiss, etc.) are accepted on this namespace.

**Backend owns all state**: The overlay is a pure renderer — it displays what the backend tells it to and reports animation phases back. The dashboard is a pure controller — it sends commands and displays state. The backend is the single source of truth for what's active, staged, in the library, and what animation phase the system is in.

**Measurement-on-add for scripture**: Scripture pagination is computed when an item is added to the library (not when activated). The overlay measures in a hidden container and reports page breaks. The backend caches results so activation is instant. This gives the volunteer immediate visibility into page counts before staging.

**Auto-dismiss timers are backend-owned**: Timers fire regardless of dashboard or overlay connectivity. The backend transitions its own phase state when a timer fires. This ensures correct behavior even if the overlay disconnects mid-countdown.

---

## Backend Services

### LowerThirdService (New)

Manages the full lower-third lifecycle: library, staging, activation, animation phase tracking, auto-dismiss timers, and transition locks.

```typescript
interface LowerThirdService {
  // Library management
  getLibrary(): LowerThirdItem[];
  addToLibrary(input: AddLowerThirdInput): Result<LowerThirdItem, string>;
  removeFromLibrary(itemId: string): Result<void, string>;
  editLibraryItem(itemId: string, patch: EditLowerThirdInput): Result<LowerThirdItem, string>;

  // Staging
  getStaged(): LowerThirdItem | null;
  promoteToStaged(itemId: string): Result<void, string>;
  demoteFromStaged(): Result<void, string>;

  // Activation
  getActive(): LowerThirdItem | null;
  promoteToActive(): Result<void, string>; // from staged
  dismissActive(): Result<void, string>;

  // Pagination (scripture)
  pageNext(): Result<void, string>;
  pagePrevious(): Result<void, string>;

  // Phase tracking (called by overlay namespace handler)
  reportPhase(phase: AnimationPhase): void;
  reportPages(itemId: string, pages: PageBreakdown): void;

  // State
  getFullState(): LowerThirdState;
  getAnimationPhase(): AnimationPhase;
  isTransitionLocked(): boolean;

  destroy(): void;
}
```

**Constructor dependencies**: `MetadataTemplateDao`, `Database` (for KJV queries), `SessionManifestService` (to read current manifest for template resolution).

**EventBus subscriptions**:
- `BUS_SESSION_MANIFEST_UPDATED` — recomputes template-derived library items

**EventBus emissions**:
- `BUS_LOWER_THIRD_STATE_CHANGED` — emitted on any state change (active, staged, library, phase, pages)

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
```

**Transition lock**: The system is locked (rejects promote/dismiss commands) when phase is `showing` or `dismissing`. Unlocked when phase is `visible` or `hidden`.

**Push-up transition**: When promoting a new item while one is already active, the phase goes directly from `visible` → `showing` (no `dismissing` step). The overlay handles the push-up animation internally.

**Backend phase transitions without overlay**:
- Auto-dismiss timer fires → backend sets phase to `dismissing` (even if overlay offline)
- After a configurable timeout (5s) with no `hidden` report from overlay → backend sets phase to `hidden` and clears active item (safety fallback for crashed overlay)

### Core Types

```typescript
type LowerThirdType = "Title" | "TitleSubtitle" | "Scripture";
type AnimationPhase = "hidden" | "showing" | "visible" | "dismissing";
type LowerThirdStyle = "blue_rhombus"; // extensible in future

interface LowerThirdItem {
  id: string;
  type: LowerThirdType;
  style: LowerThirdStyle;
  content: TitleContent | TitleSubtitleContent | ScriptureContent;
  autoDismissMs: number | null;
  source: "template" | "volunteer";
  templateId: string | null; // non-null for template-derived items
  templateName: string | null; // display name from template
  used: boolean; // has been active this session
  createdAt: string;
  pages: PageBreakdown | null; // non-null for scripture items after measurement
}

interface TitleContent {
  title: string;
}

interface TitleSubtitleContent {
  title: string;
  subtitle: string;
}

interface ScriptureContent {
  reference: ScriptureReference; // structured { bookId, chapter, verse, verseEnd? }
  formattedReference: string; // display string e.g. "Genesis 1:1-3"
  verses: VerseData[] | null; // populated by backend from KJV table; null until lookup
}

interface VerseData {
  verseNumber: number;
  text: string;
}

interface PageBreakdown {
  totalPages: number;
  currentPage: number;
  pages: PageInfo[];
}

interface PageInfo {
  pageNumber: number;
  startVerse: number;
  endVerse: number;
}

interface LowerThirdState {
  active: LowerThirdItem | null;
  staged: LowerThirdItem | null;
  library: LowerThirdItem[];
  phase: AnimationPhase;
  autoDismissAt: string | null; // ISO timestamp, null if no timer
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

### Template-Derived Library Computation

When `BUS_SESSION_MANIFEST_UPDATED` fires, the service:

1. Queries `MetadataTemplateDao` for all lower-third templates accessible to the minimum role (AvVolunteer — library items are visible to all)
2. For each template, parses the JSON `formatString` and checks if all tokens are resolvable from the current manifest
3. For resolvable templates, interpolates the format strings and creates/updates library items
4. For templates that are no longer resolvable, removes their library items (unless currently active/staged — those retain their last-interpolated content)
5. For Scripture templates, triggers a measurement request to the overlay (if connected)

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

**Migration**: The existing table is altered via `ALTER TABLE` statements in `applySchema()`:
- `ALTER TABLE metadata_templates ADD COLUMN lowerThirdType TEXT CHECK(...)`
- `ALTER TABLE metadata_templates ADD COLUMN autoDismissMs INTEGER`
- The `category` CHECK constraint cannot be altered in SQLite — the schema creation uses `IF NOT EXISTS` so existing tables keep their constraint. A migration step recreates the table with the new constraint if needed (copy data → drop → recreate → restore).

**`formatString` column semantics**:
- For `category = 'title'` or `'description'`: plain string (e.g., `"{Date} – {Speaker} – {Title}"`)
- For `category = 'lower_third'`: JSON object in canonical form (keys sorted alphabetically). Shape depends on `lowerThirdType`:
  - Title: `{"title":"{Speaker}"}`
  - TitleSubtitle: `{"subtitle":"{Title}","title":"{Speaker}"}`
  - Scripture: `{"title":"{Scripture}"}`

**Canonical JSON**: All lower-third `formatString` values are stored with keys sorted alphabetically and no extraneous whitespace. The DAO normalizes on write: `JSON.stringify(obj, Object.keys(obj).sort())`. Duplicate detection compares the normalized form.

---

## Event Constants

### Backend-Only EventBus Constants

Added to `packages/backend/src/eventBus/types.ts`:

```typescript
export const BUS_LOWER_THIRD_STATE_CHANGED = "bus:lower-third:state:changed" as const;
```

### EventMap Extension

```typescript
interface LowerThirdEventMap {
  [BUS_LOWER_THIRD_STATE_CHANGED]: LowerThirdState;
}

// Root EventMap gains the new slice
export interface EventMap extends ObsEventMap, SessionManifestEventMap, RelayEventMap, PlatformEventMap, LowerThirdEventMap {}
```

### Shared Socket.io Event Constants

Added to `packages/shared/src/constants/socketEvents.ts`:

```typescript
// Client → Server (dashboard → backend, authenticated)
export const CTS_LOWER_THIRD_COMMAND = "cts:lower-third:command" as const;

// Server → Client (backend → dashboard, authenticated)
export const STC_LOWER_THIRD_STATE = "stc:lower-third:state" as const;

// Controller → Overlay (backend → overlay page, /overlay namespace)
export const CTO_LOWER_THIRD_SHOW = "cto:lower-third:show" as const;
export const CTO_LOWER_THIRD_DISMISS = "cto:lower-third:dismiss" as const;
export const CTO_LOWER_THIRD_PUSH_UP = "cto:lower-third:push-up" as const;
export const CTO_LOWER_THIRD_PAGE = "cto:lower-third:page" as const;
export const CTO_LOWER_THIRD_STATE = "cto:lower-third:state" as const;
export const CTO_LOWER_THIRD_MEASURE = "cto:lower-third:measure" as const;

// Overlay → Controller (overlay page → backend, /overlay namespace)
export const OTC_LOWER_THIRD_PHASE = "otc:lower-third:phase" as const;
export const OTC_LOWER_THIRD_RESOLUTION = "otc:lower-third:resolution" as const;
export const OTC_LOWER_THIRD_PAGES = "otc:lower-third:pages" as const;
export const OTC_LOWER_THIRD_LOG = "otc:lower-third:log" as const;
```

---

## Socket.io Gateway

### LowerThirdModule (New — Default Namespace)

Handles dashboard ↔ backend communication for lower-third control. Implements `SocketModule`.

```typescript
export class LowerThirdModule implements SocketModule {
  constructor(private readonly lowerThirdService: LowerThirdService) {}

  register(io: Server): void {
    eventBus.subscribe(BUS_LOWER_THIRD_STATE_CHANGED, (state) => {
      io.emit(STC_LOWER_THIRD_STATE, state);
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    auth.socket.on(CTS_LOWER_THIRD_COMMAND, (command: LowerThirdCommand, ack) => {
      const result = this.handleCommand(command);
      ack(result);
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    auth.socket.emit(STC_LOWER_THIRD_STATE, this.lowerThirdService.getFullState());
  }

  private handleCommand(command: LowerThirdCommand): CommandResult { /* ... */ }
}
```

### LowerThirdCommand Type

```typescript
type LowerThirdCommand =
  | { type: "promote-to-active" }
  | { type: "dismiss-active" }
  | { type: "promote-to-staged"; itemId: string }
  | { type: "demote-from-staged" }
  | { type: "add-to-library"; input: AddLowerThirdInput }
  | { type: "remove-from-library"; itemId: string }
  | { type: "edit-library-item"; itemId: string; patch: EditLowerThirdInput }
  | { type: "page-next" }
  | { type: "page-previous" };
```

### Overlay Namespace (New — `/overlay`)

A separate Socket.io namespace with no authentication middleware. Registered in `socketGateway.ts` alongside the default namespace.

```typescript
export function registerOverlayNamespace(io: Server, lowerThirdService: LowerThirdService): void {
  const overlay = io.of("/overlay");

  overlay.on("connection", (socket) => {
    lowerThirdService.setOverlayConnected(true);

    // Send initial state
    const state = lowerThirdService.getFullState();
    const skipEntrance = state.phase === "visible";
    socket.emit(CTO_LOWER_THIRD_STATE, { ...state, skipEntrance });

    // Send pending measurement requests
    lowerThirdService.getPendingMeasurements().forEach((item) => {
      socket.emit(CTO_LOWER_THIRD_MEASURE, { itemId: item.id, verses: item.content.verses });
    });

    // Resolution telemetry
    socket.on(OTC_LOWER_THIRD_RESOLUTION, (data: { width: number; height: number; isCorrect: boolean }) => {
      lowerThirdService.handleResolutionReport(data);
    });

    // Phase reports
    socket.on(OTC_LOWER_THIRD_PHASE, (phase: AnimationPhase) => {
      lowerThirdService.reportPhase(phase);
    });

    // Page breakdown reports
    socket.on(OTC_LOWER_THIRD_PAGES, (data: { itemId: string; pages: PageBreakdown }) => {
      lowerThirdService.reportPages(data.itemId, data.pages);
    });

    // Logging
    socket.on(OTC_LOWER_THIRD_LOG, (entries: LogEntry[]) => {
      for (const entry of entries) {
        logger[entry.level ?? "info"](entry.message, {
          source: "overlay",
          ...(entry.context ? { context: entry.context } : {}),
        });
      }
    });

    socket.on("disconnect", () => {
      lowerThirdService.setOverlayConnected(false);
    });
  });
}
```

---

## REST Routes

### Overlay Log Route (New)

Mounted at `/api/overlay/logs` without authentication middleware.

```typescript
export function createOverlayLogRouter(): Router {
  const router = Router();

  router.post("/", (request: Request, response: Response): void => {
    const entries = request.body as LogEntry[];
    if (!Array.isArray(entries)) {
      response.status(400).json({ error: "body must be an array of log entries" });
      return;
    }
    for (const entry of entries) {
      logger[entry.level ?? "info"](entry.message, {
        source: "overlay",
        ...(entry.context ? { context: entry.context } : {}),
      });
    }
    response.status(204).send();
  });

  return router;
}
```

### Modified Admin Template Routes

The existing admin template CRUD routes are extended to handle `category: 'lower_third'` with the additional fields (`lowerThirdType`, `autoDismissMs`). The validation endpoint accepts JSON `formatString` for lower-third templates and validates tokens within the JSON values.

---

## Frontend — Dashboard

### Zustand Slice: `lowerThirdSlice`

```typescript
interface LowerThirdSlice {
  lowerThirdState: LowerThirdState;
  setLowerThirdState: (state: LowerThirdState) => void;
}
```

The slice stores the full `LowerThirdState` received from the backend. The widget reads from this slice; the socket module writes to it.

### Socket Module: `lowerThirdSocketModule`

Registers `socket.on(STC_LOWER_THIRD_STATE, ...)` and wires to `useStore.getState().setLowerThirdState()`.

### Widget: `LowerThirdWidget`

Located at `packages/frontend/src/components/lower-thirds/LowerThirdWidget.tsx`.

**Structure**:
```
WidgetContainer (title: "Lower Thirds", connections: [])
├── ActiveSection
│   ├── ActiveItem (with dismiss button, countdown, status overlay)
│   └── PaginationRow (if scripture with pages)
├── StagedSection
│   └── StagedItem (with promote/demote/edit buttons)
├── LibrarySection
│   ├── TemplateItems (sorted by name, no delete/edit)
│   └── VolunteerItems (sorted by creation time, with delete/edit)
└── AddButton (dropdown → type selection → input dialog)
```

**Sub-components** (all presentational, receive props):
- `LowerThirdRow` — shared row component for all sections (title, subtitle, action buttons, used indicator, status overlay)
- `ActiveCountdown` — circular countdown indicator, receives `autoDismissAt`
- `PaginationControls` — Previous/Next buttons with current page reference display
- `AddLowerThirdDialog` — modal with type-specific input fields
- `EditLowerThirdDialog` — modal pre-populated with existing values

**Hook**: `useLowerThirdState()` — reads from store, provides `sendCommand(command)` via socket.

### Widget Registration

The Lower Thirds widget is registered in the widget system with `widgetId: "lower-thirds"`. It is configurable per-dashboard via the `widget_configurations` table, following the same pattern as the OBS widget.

---

## Frontend — Overlay Page

### Route: `/overlay/lower-thirds`

A dedicated React route with no layout wrapper, no `IonPage`, no navigation. Renders only the overlay content with a transparent background.

```typescript
// In router configuration
{ path: "/overlay/lower-thirds", element: <LowerThirdOverlay /> }
```

### Component: `LowerThirdOverlay`

Located at `packages/frontend/src/overlay/LowerThirdOverlay.tsx`.

**Responsibilities**:
- Connects to `/overlay` Socket.io namespace (no auth)
- Manages animation state machine locally (as safety backup to backend)
- Renders the Aspect Ratio Jail container
- Renders the active lower-third with the appropriate style component
- Handles show/dismiss/push-up/page commands from backend
- Reports phase changes back to backend
- Measures scripture items in hidden container on `measure` command
- Sends `postMessage({ type: "overlay-ready" })` to parent on mount
- Implements 30-second disconnect timeout for stuck graphic prevention
- Sends logs via `POST /api/overlay/logs`

**No visible UI other than lower-thirds**: No error messages, no loading indicators, no diagnostic boxes. Fully transparent when no lower-third is active.

### Component: `BlueRhombusStyle`

Located at `packages/frontend/src/overlay/styles/BlueRhombusStyle.tsx`.

Renders the Blue Rhombus visual:
- Thin royal blue rhombus (CSS `transform: skewX()` or clip-path)
- Dark semi-transparent plate (`rgba(0, 0, 0, 0.85)`)
- Text content area with type-specific layout (Title / TitleSubtitle / Scripture)
- All sizing in `cqw`/`cqh` units relative to the Aspect Ratio Jail container

### Animation Implementation

Animations use CSS transitions and keyframes where possible, with JavaScript coordination for sequenced multi-step animations.

**Entrance (show)**:
1. Rhombus: `scaleY(0)` → `scaleY(1)` with `transform-origin: center` (~200ms)
2. Plate + text: `width: 0; opacity: 0` → `width: auto; opacity: 1` (~400ms, starts after step 1)

**Exit (dismiss)**:
1. Rhombus slides right across plate width (~600ms) — plate/text masked by `overflow: hidden` on a wrapper that shrinks from the left as rhombus moves
2. Rhombus: `scaleY(1)` → `scaleY(0)` with `transform-origin: center` (~200ms)

**Push-up**:
- Container has `overflow: hidden`
- Old content: `translateY(0)` → `translateY(-100%)` (~300ms)
- New content: `translateY(100%)` → `translateY(0)` (~300ms, simultaneous)
- Plate height: CSS `transition: height 300ms`

**Phase reporting**: `onAnimationEnd` / `onTransitionEnd` event handlers trigger phase reports to the backend.

### Scripture Measurement

A hidden `<div>` with the same CSS as the live display (same container width, fonts, padding) is used for off-screen measurement. When a `measure` command arrives:

1. Render all verses into the hidden container at 70% width
2. Measure total height; if > 4 lines, try 80% width to check if it reduces line count
3. Determine page breaks (no verse split across pages, max 4 lines per page, single-verse overflow allowed)
4. Report `PageBreakdown` to backend via `OTC_LOWER_THIRD_PAGES`

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

.lower-third-container {
  margin-bottom: 15cqh;
  margin-left: 3cqw;
}
```

---

## Static Wrapper

### File: `packages/overlay/lower-thirds.html`

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: transparent; }
    iframe { border: none; width: 100%; height: 100%; display: none; }
  </style>
</head>
<body>
  <iframe id="overlay"></iframe>
  <script>
    const IFRAME_URL = 'https://invisible.av/overlay/lower-thirds';
    const POLL_INTERVAL = 3000;
    const READY_TIMEOUT = 10000;
    const iframe = document.getElementById('overlay');
    let polling = true;
    let readyTimer = null;

    function poll() {
      if (!polling) return;
      fetch(IFRAME_URL, { method: 'HEAD', mode: 'no-cors' })
        .then(() => {
          iframe.src = IFRAME_URL;
          readyTimer = setTimeout(() => {
            iframe.style.display = 'none';
            iframe.src = '';
            setTimeout(poll, POLL_INTERVAL);
          }, READY_TIMEOUT);
        })
        .catch(() => setTimeout(poll, POLL_INTERVAL));
    }

    window.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'overlay-ready') {
        clearTimeout(readyTimer);
        iframe.style.display = 'block';
        polling = false;
      }
    });

    poll();
  </script>
</body>
</html>
```

---

## Correctness Properties

1. **At most one active lower-third**: The service rejects any command that would result in two simultaneous active items. Push-up transitions atomically swap the active item.
2. **Transition lock prevents race conditions**: No promote or dismiss command is accepted while phase is `showing` or `dismissing`. This is enforced by the backend regardless of frontend button state.
3. **Auto-dismiss timer isolation**: Each timer is associated with a specific item ID. Cancellation is explicit (manual dismiss, push-up, or item deactivation). A timer can never dismiss an item it wasn't started for.
4. **Backend phase is authoritative**: The overlay reports phases, but the backend maintains its own phase state. If the overlay crashes mid-animation, the backend's 5-second fallback timeout transitions to the next phase.
5. **Canonical JSON prevents false duplicates**: `formatString` is always stored in sorted-key canonical form. Comparison uses the stored form directly.
6. **Library items are stable**: Template-derived items are keyed by template ID. Manifest changes add/remove items but never duplicate them. Volunteer items are keyed by unique ID and maintain creation-time ordering regardless of edits.

---

## Testing Strategy Additions

### Unit Tests

- `LowerThirdService` — state transitions, transition lock enforcement, auto-dismiss timer lifecycle, template resolution, library computation
- `MetadataTemplateDao` — lower-third CRUD, canonical JSON normalization, duplicate detection
- `LowerThirdModule` — command handling, initial state emission
- `BlueRhombusStyle` — renders correct structure for each type
- `LowerThirdWidget` — section rendering, button states, countdown display
- `LowerThirdOverlay` — phase reporting, measurement, disconnect timeout

### Integration Tests

- Full flow: add scripture → measure → stage → activate → paginate → dismiss
- Auto-dismiss: activate with timer → verify dismiss fires → verify phase transitions
- Push-up: activate item A → promote item B from staged → verify push-up command sent
- Template resolution: update manifest → verify library items recompute
- Overlay reconnect: disconnect → reconnect → verify correct state with skipEntrance

### Manual Testing

- OBS browser source at 1920×1080: verify aspect ratio jail, positioning, animations
- OBS browser source at wrong resolution: verify dashboard banner appears
- Scene switch: verify overlay stays connected (no shutdown)
- Backend restart: verify overlay dismisses after 30s, reconnects cleanly

### Overlay Integration Tests (Playwright)

End-to-end tests that load the overlay page in a real browser and verify the full command → render → phase report loop against a running backend.

- **Show command**: backend sends `CTO_LOWER_THIRD_SHOW` → verify overlay renders the lower-third element → verify backend receives `showing` then `visible` phase reports
- **Dismiss command**: backend sends `CTO_LOWER_THIRD_DISMISS` → verify overlay runs exit animation → verify backend receives `dismissing` then `hidden` phase reports → verify DOM is empty
- **Push-up transition**: activate item A → send `CTO_LOWER_THIRD_PUSH_UP` with item B → verify old text exits, new text enters → verify backend receives `showing` then `visible`
- **Scripture measurement**: backend sends `CTO_LOWER_THIRD_MEASURE` with verse data → verify overlay reports `OTC_LOWER_THIRD_PAGES` with correct page breakdown (page count, verse ranges per page)
- **Disconnect timeout**: establish connection → disconnect backend → wait 30s → verify overlay locally dismisses (DOM empty) without backend phase report
- **Reconnect with skipEntrance**: activate item → disconnect overlay → reconnect → verify overlay renders immediately (no entrance animation) and reports `visible`
- **Reconnect after timer fired**: activate item with auto-dismiss → disconnect overlay → wait for timer to fire on backend → reconnect → verify overlay does NOT render the item (backend phase is `dismissing`/`hidden`)
- **Resolution telemetry**: load overlay at non-1920×1080 viewport → verify `OTC_LOWER_THIRD_RESOLUTION` reports `isCorrect: false` with detected dimensions
