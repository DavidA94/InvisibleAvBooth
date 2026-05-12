# Requirements Document — Lower Thirds

## Introduction

This spec adds a lower-third overlay system to Invisible A/V Booth. It introduces a browser-based overlay page (loaded in OBS as a browser source) that displays animated lower-third graphics, a backend service for managing lower-third state and lifecycle, a dashboard widget for volunteer control, and an extension to the existing template system for pre-configured lower-third content.

The overlay architecture uses a two-layer approach: a static HTML file (loaded via `file://` in OBS) wraps an iFrame that points at a frontend-served React page. The static wrapper waits for the iFrame to signal readiness via `postMessage` before showing it. The React page connects to the backend via a dedicated unauthenticated Socket.io namespace (`/overlay`) for real-time display commands.

This spec depends on the foundational platform delivered by the `livestream-control-system` spec and the template system from the `multi-platform-streaming` spec. It extends the `metadata_templates` table with a new `'lower_third'` category and adds new columns for lower-third-specific configuration.

This spec introduces a breaking change to the `metadata_templates` table: the `category` CHECK constraint is expanded from `('title', 'description')` to `('title', 'description', 'lower_third')`. Two new nullable columns are added: `lowerThirdType` and `autoDismissMs`. For lower-third templates, the `formatString` column stores a JSON object (shape determined by `lowerThirdType`) rather than a plain string. Existing title/description templates are unaffected.

This spec introduces a new interaction pattern: **swipe-to-reveal actions**. Each lower-third row shows a single primary action button by default. Swiping left or right reveals secondary action buttons. This reduces visual clutter while maintaining discoverability.

---

## Glossary

- **Lower Third**: A graphic overlay displayed in the lower portion of a video stream, typically showing speaker names, titles, or scripture text.
- **Overlay Page**: The React page served at `/overlay/lower-thirds` that renders the lower-third graphics. Connects to the backend via the `/overlay` Socket.io namespace.
- **Static Wrapper**: A plain HTML file (`packages/overlay/lower-thirds.html`) loaded in OBS via `file://`. Contains an iFrame pointing at the Overlay Page and waits for readiness via postMessage.
- **Aspect Ratio Jail**: A CSS container that locks the overlay to 16:9 proportions regardless of the OBS browser source dimensions, ensuring consistent positioning.
- **Blue Rhombus**: The initial lower-third visual style — a thin royal blue rhombus anchor with a dark semi-transparent text plate extending to its right.
- **Active**: The currently displayed lower-third (at most one at a time).
- **Library**: A collection of pre-created lower-third configurations available for use.
- **Preview Dialog**: A confirmation modal shown before activating a lower-third, displaying the item's content and providing "Cancel" and "Go Live" actions.
- **Auto-Dismiss**: An optional timer that automatically triggers the dismiss animation after a configured duration.
- **Transition Lock**: A state where the system blocks new activations or dismissals while an animation is in progress.
- **Push-Up Transition**: A direct content swap animation where old text slides up and out while new text slides up into place, without the full dismiss/show sequence.
- **Force Clear**: An emergency action that instantly hides the overlay without animation, bypassing the transition lock.
- **Lower-Third Type**: One of `Title`, `TitleSubtitle`, or `Scripture` — determines the format string slots and display behavior.
- **Page (Scripture)**: A subset of verses displayed at once when a scripture range is too long to fit in four lines. The volunteer manually paginates.

---

## Requirements

### Requirement 1: Overlay Page Architecture

**User Story:** As a system architect, I want the lower-third overlay to survive OBS restarts and frontend unavailability gracefully, so that the stream never shows a broken or loading state.

#### Acceptance Criteria

1. THE system SHALL provide a static HTML file at `packages/overlay/lower-thirds.html` that can be loaded in OBS via `file://` protocol. This file SHALL contain minimal inline JavaScript and no external dependencies beyond the iFrame source.
2. THE static wrapper SHALL contain a hidden (`display: none`) iFrame. The iFrame URL SHALL be configurable via a `data-overlay-url` attribute on the `<body>` element, defaulting to `https://invisible.av/overlay/lower-thirds`. The correct URL for the deployment SHALL be documented in `docs/setup.md`.
3. THE static wrapper SHALL set the iFrame `src` to the configured URL on load and wait for a `postMessage` event from the iFrame. IF the iFrame does not send a ready message within 10 seconds, THE wrapper SHALL clear the iFrame src, wait 3 seconds, and retry. This retry loop SHALL continue indefinitely.
4. WHEN the iFrame sends a `postMessage` with payload `{ type: "overlay-ready" }`, THE wrapper SHALL set the iFrame to `display: block` (filling the full viewport) and stop retrying. THE Overlay Page SHALL NOT send `overlay-ready` until `document.fonts.ready` has resolved and the Socket.io connection to the `/overlay` namespace is established.
5. IF the iFrame becomes unresponsive (stops sending heartbeat postMessages every 5 seconds after initial ready), THE wrapper SHALL hide the iFrame, clear its src, and resume the retry loop.
6. THE static wrapper SHALL have a transparent background and no visible UI elements — it is invisible to the stream when no lower-third is active.
7. THE Overlay Page (`/overlay/lower-thirds`) SHALL be a React route in the frontend, rendered OUTSIDE the authenticated route wrapper (`ProtectedRoutes`). It SHALL have no navigation chrome, no auth UI, and a fully transparent background.
8. THE Overlay Page SHALL connect to the backend via Socket.io on the `/overlay` namespace. This namespace SHALL NOT require JWT authentication.
9. THE Overlay Page SHALL implement indefinite reconnection with exponential backoff (1s, 2s, 4s, 8s, max 8s) when the WebSocket disconnects. It SHALL NOT display any visible reconnection messages or error states — the overlay must remain visually clean for the stream.
10. IF there is an active lower-third with no auto-dismiss, and the WebSocket has been disconnected for more than 15 seconds (configurable via `OVERLAY_DISCONNECT_TIMEOUT_MS` environment variable, default 15000), THE Overlay Page SHALL gracefully dismiss the active lower-third using the standard dismiss animation to prevent a stuck graphic on stream.
11. WHEN the Overlay Page loads and connects to the `/overlay` namespace, THE backend SHALL send the current lower-third state (active item, animation phase, and auto-dismiss timestamp if applicable) so the overlay can resume display without requiring a fresh activation.
12. THE OBS browser source for the lower-third overlay SHALL be configured with "Shutdown source when not visible" and "Refresh browser when scene becomes active" both **unchecked** (OBS defaults). This ensures the overlay stays connected through scene switches. This requirement SHALL be documented in `docs/setup.md` alongside the 1920×1080 resolution requirement and the overlay URL configuration.

---

### Requirement 2: Aspect Ratio Jail and Resolution Telemetry

**User Story:** As a system operator, I want the lower-third overlay to maintain correct proportions regardless of OBS browser source configuration, so that misconfigured sources don't produce distorted graphics on stream.

#### Acceptance Criteria

1. THE Overlay Page SHALL wrap all lower-third content in an Aspect Ratio Jail container that locks to 16:9 proportions using CSS `aspect-ratio: 16/9`. This container SHALL be centered within the viewport and sized to fill the maximum available space while maintaining the ratio.
2. ALL internal positioning (margins, padding, text sizing) SHALL be calculated relative to the Aspect Ratio Jail container using container-relative units (`cqw`, `cqh`), not viewport units (`vw`, `vh`).
3. THE lower-third graphic SHALL maintain a bottom margin of 15% relative to the container height, ensuring it clears YouTube/Facebook player controls regardless of how the browser source is transformed in OBS.
4. UPON initialization, THE Overlay Page SHALL detect `window.innerWidth` and `window.innerHeight`. IF the dimensions do not match a 16:9 aspect ratio (within a 2% tolerance) OR the resolution is not 1920×1080, THE Overlay Page SHALL transmit a `resolution-mismatch` status to the backend via the `/overlay` namespace, including the detected dimensions.
5. WHEN the backend receives a `resolution-mismatch` status, IT SHALL emit a persistent Banner-level notification to all dashboard clients: "OBS browser source is misconfigured ({detected}×{detected}). Expected 1920×1080 at 16:9. Check OBS browser source settings."
6. WHEN the backend receives a connection from the `/overlay` namespace with correct dimensions (1920×1080, 16:9), IT SHALL auto-clear any existing resolution mismatch Banner.
7. THE Overlay Page SHALL NEVER render any visible UI elements other than lower-third graphics — no error messages, no diagnostic boxes, no loading indicators. Resolution mismatch feedback is communicated exclusively via the dashboard Banner (Req 2.5). The overlay must remain visually clean for the stream at all times.


---

### Requirement 3: Lower-Third Types and Template Integration

**User Story:** As an administrator, I want to create lower-third templates that auto-populate from session metadata, so that volunteers can display pre-configured graphics without manual text entry each service.

#### Acceptance Criteria

1. THE `metadata_templates` table SHALL be extended with: (a) the `category` CHECK constraint expanded to include `'lower_third'`, (b) a new nullable column `lowerThirdType TEXT CHECK(lowerThirdType IN ('Title', 'TitleSubtitle', 'Scripture'))`, (c) a new nullable column `autoDismissMs INTEGER`. These columns SHALL be NULL for title/description templates and populated for lower-third templates.
2. FOR lower-third templates, THE `formatString` column SHALL store a JSON object whose shape depends on `lowerThirdType`: (a) Title: `{"title": "..."}`, (b) TitleSubtitle: `{"title": "...", "subtitle": "..."}`, (c) Scripture: `{"title": "{Scripture}"}` (title is always the formatted scripture reference). The format strings within the JSON object support the same interpolation tokens as title/description templates: `{Date}`, `{Speaker}`, `{Title}`, `{Scripture}`. FOR Scripture type lower-thirds (both template-derived and volunteer-added), the scripture reference SHALL be stored as a structured `ScriptureReference` object (`{ bookId, chapter, verse, verseEnd? }`) — not as display text that requires parsing. Template-derived Scripture items resolve `{Scripture}` from the SessionManifest's structured reference. Volunteer-added Scripture items store their own structured reference directly.
3. THE admin templates page (`/admin/templates`) SHALL display a third section labeled "Lower Third Templates" alongside the existing Title and Description sections. Each lower-third template list item SHALL show the template name, its type badge (Title / Title+Subtitle / Scripture), and its `roleMinimum` badge.
4. CREATING or EDITING a lower-third template SHALL open a modal containing: Name field, Type dropdown (Title, TitleSubtitle, Scripture), Role Minimum dropdown, format string field(s) appropriate to the selected type (one field for Title, two fields for TitleSubtitle, none for Scripture since it's always `{Scripture}`), and an Auto-Dismiss toggle with a duration input (in seconds) that appears when enabled. Auto-dismiss is optional — a template with auto-dismiss disabled (e.g., a main scripture template) will remain on screen until manually dismissed. The `autoDismissMs` column SHALL be NULL when auto-dismiss is disabled.
5. LOWER-THIRD templates SHALL NOT appear in the SessionManifestModal template dropdowns (they are not used for stream titles/descriptions). They SHALL NOT trigger the "more than one" warning when saving — multiple lower-third templates with the same role are expected.
6. LOWER-THIRD templates SHALL be de-duplicated by their JSON `formatString` content (normalized: keys sorted alphabetically, whitespace collapsed, serialized with `JSON.stringify` after sorting) within the `'lower_third'` category. This normalization SHALL be applied both at storage time (the stored value is always in canonical form) and at comparison time, ensuring that key ordering changes from future code updates never produce false duplicates.
7. A lower-third template SHALL appear in the volunteer's Library section IF AND ONLY IF all interpolation tokens in its format string(s) can be resolved from the current SessionManifest. For example, a template with `{"title": "{Speaker}"}` appears only when the manifest has a non-empty `speaker` field. A template with no interpolation tokens (static text) SHALL always appear. The `roleMinimum` field gates admin creation/editing access only — all lower-third templates visible to AvVolunteer appear in the library regardless of the logged-in user's role.
8. THE existing validation endpoint SHALL support lower-third templates with the same validate-then-save flow. Unknown tokens in the JSON format strings SHALL be blockers.
9. FOR this release, Scripture-type templates SHALL always use `{Scripture}` (resolved from the SessionManifest). Pre-configured static scripture references (always-available verses not tied to the manifest) are deferred to a future release. Volunteers can still manually add scripture lower-thirds with any reference via the "Add" button in the widget.
10. WHEN adding a Scripture lower-third (template-derived or volunteer-added), IF the `kjv` table has no data for the specified reference, THE backend SHALL reject the add with a clear error: "Scripture not found: {reference}". This prevents empty scripture items from entering the library.

---

### Requirement 4: Lower-Third Service and State Management

**User Story:** As a backend architect, I want a dedicated service managing lower-third lifecycle (active, library, transitions), so that the overlay, dashboard, and auto-dismiss timers all operate from a single authoritative state.

#### Acceptance Criteria

1. THE Backend SHALL implement a `LowerThirdService` that maintains the authoritative state for: the active lower-third (at most one), the library list, the current animation phase, and any active auto-dismiss timer.
2. THE library SHALL contain two types of items: (a) template-derived items — computed from lower-third templates whose tokens are fully resolvable from the current SessionManifest, and (b) volunteer-added items — manually created by the volunteer during the session.
3. TEMPLATE-DERIVED library items SHALL be recomputed whenever the SessionManifest changes (subscribe to `BUS_SESSION_MANIFEST_UPDATED`). Items whose tokens become unresolvable SHALL be removed from the library. Items that become resolvable SHALL be added.
4. VOLUNTEER-ADDED library items SHALL be stored in-memory only and cleared on backend restart. They are session-scoped.
5. THE service SHALL track a "used" flag per library item (in-memory, per-session). An item is marked as used when it has been activated at any point during the session. This flag persists until backend restart.
6. THE service SHALL own auto-dismiss timers. WHEN an item with `autoDismissMs` is activated, THE service SHALL start a timer. WHEN the timer fires, THE service SHALL send a dismiss command to the overlay page and emit a `dismissing` phase event to dashboard clients. WHEN the active item is manually dismissed by the volunteer, any running auto-dismiss timer for that item SHALL be cancelled (no-op). WHEN a new item is activated (push-up transition) while an auto-dismiss timer is running for the previous item, THE previous timer SHALL be cancelled immediately. The new item's own auto-dismiss timer (if it has one) starts fresh. An item without auto-dismiss SHALL NEVER be auto-dismissed, regardless of what the previous item's timer state was. WHEN the auto-dismiss timer fires, THE service SHALL transition its internal phase to `dismissing` regardless of whether the overlay is connected. This ensures that if the overlay reconnects after the timer has fired, it receives the correct phase and does not render a stale item.
7. THE service SHALL enforce transition locks. WHEN the overlay reports an animation is in progress (phases: `showing`, `dismissing`), THE service SHALL reject any activate or dismiss commands with an error indicating a transition is in progress. WHEN the overlay reports animation complete (phases: `visible`, `hidden`), THE service SHALL unlock. Force Clear (Req 5.8) bypasses the transition lock.
8. THE service SHALL track the animation phase as reported by the overlay page: `hidden` (nothing displayed), `showing` (entrance animation in progress), `visible` (lower-third fully displayed), `dismissing` (exit animation in progress). The initial phase is `hidden`.
9. WHEN an activate command is received while an item is already active (direct transition), THE service SHALL NOT use the dismiss animation. Instead, it SHALL send a push-up transition command to the overlay and set the phase to `showing`. The transition lock applies during push-up transitions.
10. THE service SHALL emit events on the EventBus (`bus:lower-third:state:changed`) whenever the active item, library, animation phase, or auto-dismiss state changes.
11. WHEN the `/overlay` namespace has no connected clients, THE service SHALL continue to accept commands and maintain state. WHEN an overlay client connects, it receives the current state via initial-state emission and renders accordingly.
12. FOR auto-dismiss timers, THE service SHALL operate independently of dashboard connections — timers fire even if no volunteer is connected. The overlay receives the dismiss command directly.
13. IF the overlay does not report phase completion within 5 seconds of a transition command, THE backend SHALL advance to the next phase as a safety fallback (e.g., `showing` → `visible`, `dismissing` → `hidden`) and emit a warning notification to dashboard clients: "Overlay unresponsive — graphic state force-advanced." This prevents the system from getting permanently stuck in a transition-locked state.

---

### Requirement 5: Lower-Third Widget

**User Story:** As a volunteer, I want a dashboard widget for controlling lower-thirds with clear sections for what's active and what's available, so that I can manage on-screen graphics efficiently during a live service.

#### Acceptance Criteria

1. THE Frontend SHALL provide a "Lower Thirds" widget registered in the widget system and configurable via the `widget_configurations` table. The widget SHALL use `WidgetContainer` with title "Lower Thirds" and a single connection status indicator: `{ label: "Overlay", status }` where status is `healthy` (overlay connected, correct resolution), `degraded` (overlay connected, wrong resolution), `unhealthy` (overlay not connected), or `inactive` (no lower-third templates configured). This uses the existing `ConnectionStatus` model.
2. THE widget SHALL display two sections in order: "Active" and "Library".
3. THE Active section SHALL display at most one item. The row SHALL show: the display text as the title (CSS ellipsis for overflow), the lower-third type as the subtitle. The primary visible button SHALL be **Dismiss** (X icon with "Dismiss" label below, 2.5rem × 2.5rem touch target). Swiping left on the active row SHALL reveal a **Force Clear** button (red stop-sign icon with "Force Clear" label below, 2.5rem × 2.5rem). IF the active item has auto-dismiss enabled, a countdown indicator SHALL be displayed showing remaining time. WHEN the countdown reaches zero, the item SHALL show a "Dismissing" text overlay. WHEN the backend confirms dismissal is complete, the row SHALL be removed. Status overlays ("Dismissing", "Measuring...", etc.) SHALL cover the row and block all interactive controls on that row while visible.
4. IF the active item is a paginated scripture, a pagination row SHALL appear below the active item showing the current page's scripture reference range (e.g., "Genesis 1:3-4"), with Previous and Next buttons (2.5rem × 2.5rem). The Previous button SHALL be disabled on the first page; the Next button SHALL be disabled on the last page.
5. THE Library section SHALL display items in two groups: template-derived items first (sorted alphabetically by template name), then volunteer-added items (sorted by creation time, oldest first). Each row SHALL show: the display text as the title (or the template name for template-derived items, with subtitle "Template"), the type as the subtitle. The primary visible button SHALL be **Show** (play icon with "Show" label below, 2.5rem × 2.5rem) which opens the Preview Dialog. Swiping right on a library row SHALL reveal a **Go Live** button (lightning bolt icon ⚡ with "Go Live" label below) that activates immediately without the preview dialog. Swiping left SHALL reveal **Edit** (pencil icon) and **Delete** (trash icon) buttons for volunteer-added items only.
6. FOR template-derived library items, swiping left SHALL reveal only the **Go Live** button (no edit/delete). Swiping right also reveals **Go Live**. Template items cannot be edited or deleted from the library.
7. IF a library item is currently Active, it SHALL display an overlay badge indicating "Active" and its primary button SHALL be disabled.
8. THE **Force Clear** action SHALL immediately hide the overlay (no animation), bypass the transition lock, and reset the backend state to `hidden` in one step. This is the emergency "wrong content on screen" escape hatch. It SHALL be visually distinct (red) to prevent accidental use.
9. IF a library item has been used (previously active during this session), it SHALL display a left border color using `color-warning` (`#F39C12`) to visually distinguish it from unused items.
10. AT the bottom of the widget, an "Add" button SHALL open a dropdown allowing the volunteer to choose a type (Title, Title + Subtitle, Scripture). Upon selection, a dialog SHALL appear with the appropriate input fields for that type. The dialog SHALL provide "Cancel" and "Save" actions. Saving adds the item to the Library.
11. WHEN saving a Scripture type, THE volunteer SHALL provide only the scripture reference (using the existing `ScriptureReferenceInput` component). THE backend and overlay page SHALL handle verse lookup and pagination.
12. ADDING a new item to the library SHALL NOT shift the scroll position of the Library section. New volunteer-added items appear at the bottom of the volunteer-added group.
13. THE **Show** button (primary action on library rows) SHALL open a **Preview Dialog** showing: the item's full content (title, subtitle if applicable, scripture reference and verse text if applicable), the type, and the style name. The dialog SHALL have two buttons: "Cancel" and "Go Live". Tapping "Go Live" activates the item (or does a push-up transition if something is already active).
14. THE activate button ("Go Live" in preview dialog or swipe action) and the dismiss button SHALL be disabled while a transition lock is active. A brief "Transitioning..." label SHALL appear during the lock.
15. WHEN the auto-dismiss timer is active, THE frontend SHALL display a circular countdown indicator. The frontend receives `autoDismissAt` (timestamp) from the backend and counts down locally. The frontend SHALL NOT remove the active item until it receives the `hidden` phase from the backend, to account for animation duration and clock drift.
16. FOR the auto-dismiss initial state: IF the dashboard connects (or reconnects) while an auto-dismiss timer is running, THE backend SHALL include `autoDismissAt` in the initial state payload so the dashboard can render the countdown from the correct remaining time.
17. THE widget SHALL display inline placeholder messages when sections are empty: "Nothing active" in the Active section and "No items available" in the Library section.
18. ALL swipe-revealed buttons SHALL use icon + label-below layout (icon on top, short text label below) to maintain WCAG 2.5.5 touch targets (2.5rem × 2.5rem minimum) while keeping the UI compact.


---

### Requirement 6: Lower-Third Display and Animation

**User Story:** As a viewer, I want lower-third graphics to appear and disappear with smooth, professional animations, so that the stream looks polished.

#### Acceptance Criteria

1. THE Overlay Page SHALL support a `style` field on each lower-third item. The initial (and only) style SHALL be `"blue_rhombus"`. The system SHALL be designed to support additional styles in the future without architectural changes.
2. THE Blue Rhombus style SHALL render as: a thin, royal blue rhombus shape anchored to the left, with a dark semi-transparent background plate (approximately 85% opacity) extending to its right containing the display text. The entire unit SHALL be positioned in the bottom-left of the Aspect Ratio Jail container, respecting the 15% bottom margin.
3. ALL text, padding, and margins within the lower-third SHALL use container-relative units (`cqw`, `cqh`) based on the Aspect Ratio Jail container, ensuring proportional rendering at any output resolution (720p, 1080p, 4K).
4. THE Blue Rhombus entrance animation ("show") SHALL be a coordinated wipe sequence: (a) the thin blue rhombus grows vertically from center to full height, (b) once established, the dark background and text unfold to the right, appearing to slide out from behind the rhombus. THE Overlay Page SHALL report phase `showing` at the start and `visible` at the end.
5. THE Blue Rhombus exit animation ("dismiss") SHALL be: (a) the blue rhombus maintains its width and height as it slides across the entire length of the graphic from left to right, acting as a traveling curtain that erases the background and text behind it (text does not move), (b) once the rhombus reaches the end, it shrinks vertically back to zero from center (mirroring the entrance animation's vertical growth from center). THE Overlay Page SHALL report phase `dismissing` at the start and `hidden` at the end.
6. THE push-up transition (direct content swap without full dismiss/show) SHALL: keep the blue rhombus and dark plate locked in place, slide old text up and out of view while new text slides up into place. IF the height changes (e.g., Title to TitleSubtitle), the plate height SHALL animate smoothly during the transition. THE Overlay Page SHALL report phase `showing` at the start and `visible` at the end. During the push-up, text SHALL be hard-clipped (e.g., via `overflow: hidden` or clip-path) before reaching any container edges — text must not be partially visible through the semi-transparent plate background. For Title/TitleSubtitle, text disappears before hitting the top edge of the text plate; for scripture page transitions, verse text disappears before reaching the reference line. WHEN transitioning from a Scripture type to a non-Scripture type (or vice versa), the scripture reference line SHALL move with the outgoing/incoming text (it is not fixed during cross-type transitions — it is only fixed during same-scripture page transitions).
7. FOR the Title type, text SHALL be bold and slightly larger than standard body text (not dramatically oversized).
8. FOR the TitleSubtitle type, the title SHALL match the Title type styling. The subtitle SHALL be non-bold, italic, positioned below the title with appropriate line spacing.
9. FOR the Scripture type, the scripture reference SHALL be displayed as a bold title line (slightly larger than verse text but smaller than a Title type). Verse text SHALL appear below the reference. Verse text width SHALL be capped at 70% of the plate width to reduce eye strain. IF expanding to 80% width would eliminate a line wrap (removing a line that contains only one or two short words), the width SHALL expand to 80% for that content.
10. FOR Scripture single verse: no verse number prefix, text displayed below the reference.
11. FOR Scripture multi-verse (small — fits in 4 lines or fewer of verse text, excluding the reference title line): each verse starts a new line with a number prefix (e.g., "1. ..."). Verse 0 has no number prefix and is displayed in italics. The line width cap SHALL be calculated to favor the longest verse, expanding only if it eliminates at least one line from the total height.
12. FOR Scripture multi-verse (large — verse text exceeds 4 lines, excluding the reference title line): the content SHALL be paginated. The scripture reference title line remains fixed across all pages. No verse SHALL be split across pages. The volunteer controls pagination via the dashboard widget (Req 5.4).
13. FOR scripture page transitions, the reference line remains fixed while verse content slides up in page chunks. The plate height SHALL animate smoothly to fit the new page's content.
14. ALL animations SHALL be implemented in CSS where possible (transitions, keyframes). JavaScript animation SHALL be used only where CSS cannot achieve the required coordination.
15. WHEN a dismiss animation is in progress and a new show command arrives, THE overlay SHALL NOT interrupt the dismiss. It SHALL wait for the dismiss to complete, then execute the show animation. The backend enforces this via transition lock, but the overlay SHALL also enforce it locally as a safety measure.
16. THE **Force Clear** command SHALL immediately set the overlay to `display: none` (or equivalent instant hide) with no animation. The overlay SHALL report phase `hidden` immediately. This bypasses all animation sequencing.

---

### Requirement 7: Scripture Measurement and Pagination Protocol

**User Story:** As a volunteer, I want scripture passages to be automatically paginated based on actual rendered size, so that text never overflows the lower-third graphic.

#### Acceptance Criteria

1. WHEN a Scripture lower-third is added to the library (either via template resolution or volunteer manual add), THE backend SHALL look up the verse text from the `kjv` table for the specified reference range and send a measurement request to the overlay page.
2. THE Overlay Page SHALL measure the rendered height of the verses in a hidden off-screen container (using the same CSS styling, fonts, and container width as the live display) to determine pagination. All measurements SHALL occur in the context of the overlay page's rendering environment — not on the backend or dashboard. THE Overlay Page SHALL ensure `document.fonts.ready` has resolved before performing any measurements.
3. THE Overlay Page SHALL determine page breaks such that: (a) no single verse is split across pages, (b) each page fits within 4 lines of rendered verse text (excluding the scripture reference title line, which is always visible), (c) verse 0 (if present) is always on the first page. IF a single verse exceeds 4 lines on its own, it SHALL be the sole verse on its page and the lower-third plate height SHALL expand to accommodate it.
4. AFTER determining page breaks, THE Overlay Page SHALL report the page breakdown to the backend. The breakdown SHALL include: total page count, and for each page, the verse range displayed (start verse number, end verse number).
5. THE backend SHALL cache the page breakdown for each scripture library item. When the item is later activated, the overlay receives the pre-computed pages and does not re-measure. The dashboard displays the page count in the item's subtitle (e.g., "Scripture · 3 pages") immediately after measurement completes.
6. IF the overlay is not connected when a scripture item is added, measurement SHALL be deferred until the overlay connects. The library item SHALL display "Scripture · Pending" in its subtitle until measurement completes. The item MAY still be activated before measurement — in that case, measurement occurs at activation time (worst case fallback).
7. IF a measurement request receives no response within 10 seconds, THE backend SHALL assume single-page display, log a warning, and allow the item to be activated. The volunteer can still use it — incorrect pagination is better than a blocked item.
8. THE volunteer SHALL control page navigation via Previous/Next buttons in the widget. Page commands flow: dashboard → backend → overlay. The overlay animates the page transition and reports the new phase.
9. FOR the width optimization (Req 6.9 — expanding from 70% to 80% if it eliminates a wrap): THE Overlay Page SHALL perform this measurement during the pagination calculation, testing both widths and choosing the narrower width unless the wider width reduces the total line count.

---

### Requirement 8: Socket Communication and Event Flow

**User Story:** As a developer, I want clear, well-defined socket events for the lower-third system, so that the overlay, backend, and dashboard stay synchronized.

#### Acceptance Criteria

1. THE backend SHALL expose a `/overlay` Socket.io namespace that does not require JWT authentication. This namespace SHALL only emit display commands to connected overlay clients and receive animation phase reports and telemetry from them. It SHALL NOT accept control commands (activate, dismiss, etc.) — those flow through the authenticated default namespace.
2. THE backend SHALL emit the following to the `/overlay` namespace: (a) `show` — display a lower-third (includes full item data, style, and content), (b) `dismiss` — trigger the dismiss animation, (c) `push-up` — trigger a direct content swap (includes new item data), (d) `page` — navigate to a specific scripture page, (e) `state` — full state sync (sent on connection for initial state, includes `skipEntrance` flag), (f) `measure` — request scripture pagination measurement (includes verse data; overlay measures in hidden container without displaying), (g) `force-clear` — immediately hide with no animation.
3. THE overlay SHALL emit the following to the `/overlay` namespace: (a) `phase` — animation phase report (`showing`, `visible`, `dismissing`, `hidden`), (b) `resolution` — resolution telemetry on connection (`{ width, height, isCorrect }`), (c) `pages` — scripture page breakdown after measurement (sent in response to both `measure` and `show` commands for scripture items).
4. THE backend SHALL emit the following to authenticated dashboard clients (default namespace) via a single event name with the full lower-third state (active item, library, phase, autoDismissAt, overlayConnected, transitionLocked).
5. DASHBOARD clients SHALL emit commands to the backend (default namespace): (a) activate (from library, with or without preview), (b) dismiss-active, (c) force-clear, (d) add-to-library, (e) remove-from-library, (f) edit-library-item, (g) page-next, (h) page-previous.
6. ALL socket event name constants SHALL be defined in `packages/shared/src/constants/socketEvents.ts` following the existing `CTS_`/`STC_` prefix convention. Overlay-specific events SHALL use `OTC_` (overlay-to-controller) and `CTO_` (controller-to-overlay) prefixes. The `socketEvents.ts` header comment SHALL be updated to document these new prefixes.
7. THE Overlay Page SHALL send log entries to the backend via `POST /api/overlay/logs` — a dedicated unauthenticated endpoint that accepts the same batch format as the existing `POST /api/logs` but writes entries with `source: "overlay"`, producing the `[overlay]` prefix in log output (distinct from `[backend]` and `[frontend]`). This endpoint SHALL enforce rate limiting (max 10 requests per minute per IP) and payload size limits (max 10 entries per batch, max 1KB per entry) to prevent abuse.
8. WHEN the overlay disconnects from the `/overlay` namespace, THE backend SHALL NOT immediately clear the active state. The overlay may reconnect and resume display. IF the overlay has been disconnected for more than 15 seconds and there is an active lower-third, THE backend SHALL mark the active item as stale (for dashboard display purposes) but SHALL NOT send dismiss commands to a disconnected overlay.
9. WHEN the overlay reconnects, THE backend SHALL send the full current state including a `skipEntrance: true` flag when an item was already active (phase was `visible` before disconnect). The overlay SHALL render the item immediately at full visibility (no entrance animation) and report phase `visible`. IF the phase was `showing` or `dismissing` at disconnect time, the backend SHALL send the state with the appropriate phase so the overlay can resume or complete the animation. IF the backend's phase is `dismissing` or `hidden` (e.g., auto-dismiss timer fired while overlay was offline), THE overlay SHALL NOT render the item — it SHALL report `hidden` immediately. This prevents flashing a stale item on screen only to immediately dismiss it.

---

### Requirement 9: Lower-Third Widget Interactions and Edge Cases

**User Story:** As a volunteer, I want the lower-third controls to be intuitive and prevent mistakes, so that I can operate confidently during a live service.

#### Acceptance Criteria

1. WHEN the volunteer activates an item (via Preview Dialog "Go Live" or swipe "Go Live") while another item is already active, THE system SHALL use the push-up transition (Req 6.6) — not the full dismiss/show sequence. The previously active item returns to the library (if it was volunteer-added) or simply deactivates (if template-derived).
2. WHEN the volunteer dismisses the active item, THE system SHALL trigger the dismiss animation. After the animation completes (backend receives `hidden` phase from overlay), the item returns to the library (if volunteer-added) or simply deactivates (if template-derived).
3. WHEN a volunteer edits a library item, THE edit dialog SHALL pre-populate with the item's current values. Editing a library item SHALL NOT change its sort position — order is based on original creation time, not last-edited time.
4. WHEN deleting a library item, a confirmation dialog SHALL appear showing the item's type and content. Template-derived items cannot be deleted (Req 5.6).
5. IF the overlay page is not connected when an activate command is received, THE backend SHALL still accept the command, update the active state, and emit state to dashboard clients. The active item will display "No overlay connected" status on the dashboard. WHEN the overlay connects, it will receive the active item via initial state and display it.
6. FOR auto-dismiss countdown display: THE backend SHALL send `autoDismissAt` (ISO timestamp) to the dashboard. The dashboard SHALL render a circular countdown locally. WHEN the backend fires the dismiss (timer expired), it sends phase `dismissing` to the dashboard. WHEN the overlay completes the animation, the backend sends phase `hidden` (item fully gone). The dashboard SHALL show "Dismissing" overlay text during the `dismissing` phase and remove the row only on `hidden`.
7. IF the backend restarts while a lower-third is active on the overlay, THE overlay's 15-second disconnect timeout (Req 1.10) will dismiss it. When the backend comes back up, the overlay reconnects and receives `hidden` state (fresh start). No manual intervention is required.
8. WHEN the session manifest is cleared, template-derived library items SHALL be recomputed (most will disappear since tokens are no longer resolvable). Volunteer-added items SHALL remain. IF the active item was template-derived and its tokens are no longer resolvable, it SHALL remain active with its last-interpolated content (it was already computed) — it is not forcibly dismissed mid-display.
9. THE swipe-to-reveal pattern SHALL be implemented consistently across all rows: swipe gestures reveal action buttons on the appropriate side, and tapping anywhere else on the row (or swiping back) closes the revealed actions. Only one row's actions may be revealed at a time.

---

## Accepted Risks

### Risk 1: 15-Second Stale Lower-Third on Backend Crash

If the backend crashes while a lower-third is active, the overlay will continue displaying it for up to 15 seconds before the disconnect timeout triggers a graceful dismiss. During this window, the graphic is "stuck" on stream. This is accepted — the 15-second timeout provides a reasonable safety net, and backend crashes are rare in production.

### Risk 2: Clock Drift on Auto-Dismiss Countdown

The dashboard displays a locally-computed countdown based on `autoDismissAt`. Minor clock drift between the backend and dashboard may cause the visual countdown to be slightly off (±1-2 seconds). This is accepted — the backend is authoritative for the actual dismiss trigger, and the dashboard waits for the `hidden` phase before removing the row.

### Risk 3: Scripture Pagination Depends on Overlay Rendering

Page breaks are determined by the overlay page's actual rendered text measurements. If the overlay is not connected when a scripture lower-third is added, pagination is deferred until the overlay connects (or times out after 10 seconds and defaults to single-page). This is accepted — the measurement timeout ensures the volunteer is never permanently blocked.

### Risk 4: No Random-Access Page Navigation

Scripture pagination only supports sequential Previous/Next navigation. The volunteer cannot jump directly to page 3 of 5. This is accepted as a simplicity tradeoff — sequential navigation with clear page references (showing which verses are on screen) provides sufficient control for live operation.

### Risk 5: Volunteer-Added Items Lost on Restart

Manually added lower-third items (non-template) are stored in-memory and lost on backend restart. This is accepted — these items are typically day-specific (speaker names, one-off announcements) and would need to be re-entered for a new session anyway. Template-derived items automatically repopulate from the database.

### Risk 6: Single Overlay Client Assumption

The system assumes at most one overlay client is connected at a time. If a new overlay client connects, the backend SHALL forcibly disconnect the previous one and log a warning. This prevents doubled graphics from multiple OBS instances. The deployment model is a single OBS instance per venue.

### Risk 7: No Lower-Third Preview Rendering in Widget

The volunteer sees text content in the Preview Dialog but not a pixel-accurate rendering of the lower-third graphic (with Blue Rhombus styling). This is accepted — rendering a true preview would require duplicating the overlay's CSS/animation engine in the dashboard. The text preview provides sufficient verification for content correctness.

### Risk 8: Force Clear Requires Swipe Discovery

The Force Clear emergency action is hidden behind a swipe gesture on the active row. A volunteer unfamiliar with the swipe pattern may not discover it under pressure. This is accepted — the likelihood of needing to immediately hide a lower-third (rather than showing the next one via push-up) is low, and the normal Dismiss button is always visible. Force Clear is a power-user escape hatch, not a primary workflow.
