# Requirements Document — Lower Thirds

## Introduction

This spec adds a lower-third overlay system to Invisible A/V Booth. It introduces a browser-based overlay page (loaded in OBS as a browser source) that displays animated lower-third graphics, a backend service for managing lower-third state and lifecycle, a dashboard widget for volunteer control, and an extension to the existing template system for pre-configured lower-third content.

The overlay architecture uses a two-layer approach: a static HTML file (loaded via `file://` in OBS) wraps an iFrame that points at a frontend-served React page. The static wrapper polls for frontend availability and shows the iFrame only when the frontend is healthy. The React page connects to the backend via a dedicated unauthenticated Socket.io namespace (`/overlay`) for real-time display commands.

This spec depends on the foundational platform delivered by the `livestream-control-system` spec and the template system from the `multi-platform-streaming` spec. It extends the `metadata_templates` table with a new `'lower_third'` category and adds new columns for lower-third-specific configuration.

This spec introduces a breaking change to the `metadata_templates` table: the `category` CHECK constraint is expanded from `('title', 'description')` to `('title', 'description', 'lower_third')`. Two new nullable columns are added: `lowerThirdType` and `autoDismissMs`. For lower-third templates, the `formatString` column stores a JSON object (shape determined by `lowerThirdType`) rather than a plain string. Existing title/description templates are unaffected.

---

## Glossary

- **Lower Third**: A graphic overlay displayed in the lower portion of a video stream, typically showing speaker names, titles, or scripture text.
- **Overlay Page**: The React page served at `/overlay/lower-thirds` that renders the lower-third graphics. Connects to the backend via the `/overlay` Socket.io namespace.
- **Static Wrapper**: A plain HTML file (`packages/overlay/lower-thirds.html`) loaded in OBS via `file://`. Contains an iFrame pointing at the Overlay Page and polls for frontend availability.
- **Aspect Ratio Jail**: A CSS container that locks the overlay to 16:9 proportions regardless of the OBS browser source dimensions, ensuring consistent positioning.
- **Blue Rhombus**: The initial lower-third visual style — a thin royal blue rhombus anchor with a dark semi-transparent text plate extending to its right.
- **Active**: The currently displayed lower-third (at most one at a time).
- **Staged**: The next lower-third queued for display (at most one at a time). Promoted to Active by the volunteer.
- **Library**: A collection of pre-created lower-third configurations available for use.
- **Auto-Dismiss**: An optional timer that automatically triggers the dismiss animation after a configured duration.
- **Transition Lock**: A state where the system blocks new promotions or dismissals while an animation is in progress.
- **Push-Up Transition**: A direct content swap animation where old text slides up and out while new text slides up into place, without the full dismiss/show sequence.
- **Lower-Third Type**: One of `Title`, `TitleSubtitle`, or `Scripture` — determines the format string slots and display behavior.
- **Page (Scripture)**: A subset of verses displayed at once when a scripture range is too long to fit in four lines. The volunteer manually paginates.

---

## Requirements

### Requirement 1: Overlay Page Architecture

**User Story:** As a system architect, I want the lower-third overlay to survive OBS restarts and frontend unavailability gracefully, so that the stream never shows a broken or loading state.

#### Acceptance Criteria

1. THE system SHALL provide a static HTML file at `packages/overlay/lower-thirds.html` that can be loaded in OBS via `file://` protocol. This file SHALL contain minimal inline JavaScript and no external dependencies beyond the iFrame source.
2. THE static wrapper SHALL contain a hidden (`display: none`) iFrame pointing at `https://invisible.av/overlay/lower-thirds`.
3. THE static wrapper SHALL poll the iFrame URL with a `fetch` HEAD request every 3 seconds. WHEN the fetch returns a 200 status, THE wrapper SHALL reload the iFrame `src` attribute (to ensure a fresh load) and wait for a `postMessage` event from the iFrame.
4. WHEN the iFrame sends a `postMessage` with payload `{ type: "overlay-ready" }`, THE wrapper SHALL set the iFrame to `display: block` (filling the full viewport) and stop polling.
5. IF the iFrame fails to send the ready message within 10 seconds of a successful fetch, THE wrapper SHALL hide the iFrame, reset to polling state, and resume polling.
6. THE static wrapper SHALL have a transparent background and no visible UI elements — it is invisible to the stream when no lower-third is active.
7. THE Overlay Page (`/overlay/lower-thirds`) SHALL be a React route in the frontend that renders the lower-third display area. It SHALL have no navigation chrome, no auth UI, and a fully transparent background.
8. THE Overlay Page SHALL connect to the backend via Socket.io on the `/overlay` namespace. This namespace SHALL NOT require JWT authentication.
9. THE Overlay Page SHALL implement indefinite reconnection with exponential backoff (1s, 2s, 4s, 8s, max 8s) when the WebSocket disconnects. It SHALL NOT display any visible reconnection messages or error states — the overlay must remain visually clean for the stream.
10. IF there is an active lower-third with no auto-dismiss, and the WebSocket has been disconnected for more than 30 seconds, THE Overlay Page SHALL gracefully dismiss the active lower-third using the standard dismiss animation to prevent a stuck graphic on stream.
11. WHEN the Overlay Page loads and connects to the `/overlay` namespace, THE backend SHALL send the current lower-third state (active item, animation phase, and auto-dismiss timestamp if applicable) so the overlay can resume display without requiring a fresh activation.

---

### Requirement 2: Aspect Ratio Jail and Resolution Telemetry

**User Story:** As a system operator, I want the lower-third overlay to maintain correct proportions regardless of OBS browser source configuration, so that misconfigured sources don't produce distorted graphics on stream.

#### Acceptance Criteria

1. THE Overlay Page SHALL wrap all lower-third content in an Aspect Ratio Jail container that locks to 16:9 proportions using CSS `aspect-ratio: 16/9`. This container SHALL be centered within the viewport and sized to fill the maximum available space while maintaining the ratio.
2. ALL internal positioning (margins, padding, text sizing) SHALL be calculated relative to the Aspect Ratio Jail container using container-relative units (`cqw`, `cqh`), not viewport units (`vw`, `vh`).
3. THE lower-third graphic SHALL maintain a bottom margin of 15% relative to the container height, ensuring it clears YouTube/Facebook player controls regardless of how the browser source is transformed in OBS.
4. UPON initialization, THE static wrapper SHALL detect `window.innerWidth` and `window.innerHeight`. IF the dimensions do not match a 16:9 aspect ratio (within a 2% tolerance) OR the resolution is not 1920×1080, THE Overlay Page SHALL transmit a `resolution-mismatch` status to the backend via the `/overlay` namespace, including the detected dimensions.
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
7. A lower-third template SHALL appear in the volunteer's Library section IF AND ONLY IF all interpolation tokens in its format string(s) can be resolved from the current SessionManifest. For example, a template with `{"title": "{Speaker}"}` appears only when the manifest has a non-empty `speaker` field. A template with no interpolation tokens (static text) SHALL always appear.
8. THE existing validation endpoint SHALL support lower-third templates with the same validate-then-save flow. Unknown tokens in the JSON format strings SHALL be blockers.
9. FOR this release, Scripture-type templates SHALL always use `{Scripture}` (resolved from the SessionManifest). Pre-configured static scripture references (always-available verses not tied to the manifest) are deferred to a future release. Volunteers can still manually add scripture lower-thirds with any reference via the "Add" button in the widget.


---

### Requirement 4: Lower-Third Service and State Management

**User Story:** As a backend architect, I want a dedicated service managing lower-third lifecycle (active, staged, library, transitions), so that the overlay, dashboard, and auto-dismiss timers all operate from a single authoritative state.

#### Acceptance Criteria

1. THE Backend SHALL implement a `LowerThirdService` that maintains the authoritative state for: the active lower-third (at most one), the staged lower-third (at most one), the library list, the current animation phase, and any active auto-dismiss timer.
2. THE library SHALL contain two types of items: (a) template-derived items — computed from lower-third templates whose tokens are fully resolvable from the current SessionManifest, and (b) volunteer-added items — manually created by the volunteer during the session.
3. TEMPLATE-DERIVED library items SHALL be recomputed whenever the SessionManifest changes (subscribe to `BUS_SESSION_MANIFEST_UPDATED`). Items whose tokens become unresolvable SHALL be removed from the library. Items that become resolvable SHALL be added.
4. VOLUNTEER-ADDED library items SHALL be stored in-memory only and cleared on backend restart. They are session-scoped.
5. THE service SHALL track a "used" flag per library item (in-memory, per-session). An item is marked as used when it has been promoted to Active at any point during the session. This flag persists until backend restart.
6. THE service SHALL own auto-dismiss timers. WHEN an item with `autoDismissMs` is promoted to Active, THE service SHALL start a timer. WHEN the timer fires, THE service SHALL send a dismiss command to the overlay page and emit a `dismissing` phase event to dashboard clients. WHEN the active item is manually dismissed by the volunteer, any running auto-dismiss timer for that item SHALL be cancelled (no-op). WHEN a new item is promoted to active (push-up transition) while an auto-dismiss timer is running for the previous item, THE previous timer SHALL be cancelled immediately. The new item's own auto-dismiss timer (if it has one) starts fresh. An item without auto-dismiss SHALL NEVER be auto-dismissed, regardless of what the previous item's timer state was.
7. THE service SHALL enforce transition locks. WHEN the overlay reports an animation is in progress (phases: `showing`, `dismissing`), THE service SHALL reject any promote-to-active or dismiss commands with an error indicating a transition is in progress. WHEN the overlay reports animation complete (phases: `visible`, `hidden`), THE service SHALL unlock.
8. THE service SHALL track the animation phase as reported by the overlay page: `hidden` (nothing displayed), `showing` (entrance animation in progress), `visible` (lower-third fully displayed), `dismissing` (exit animation in progress). The initial phase is `hidden`.
9. WHEN a promote-to-active command is received while an item is already active (direct transition), THE service SHALL NOT use the dismiss animation. Instead, it SHALL send a push-up transition command to the overlay and set the phase to `showing`. The transition lock applies during push-up transitions.
10. THE service SHALL emit events on the EventBus (`bus:lower-third:state:changed`) whenever the active item, staged item, library, animation phase, or auto-dismiss state changes.
11. WHEN the `/overlay` namespace has no connected clients, THE service SHALL continue to accept commands and maintain state. WHEN an overlay client connects, it receives the current state via initial-state emission and renders accordingly.
12. FOR auto-dismiss timers, THE service SHALL operate independently of dashboard connections — timers fire even if no volunteer is connected. The overlay receives the dismiss command directly.

---

### Requirement 5: Lower-Third Widget

**User Story:** As a volunteer, I want a dashboard widget for controlling lower-thirds with clear sections for what's active, what's next, and what's available, so that I can manage on-screen graphics efficiently during a live service.

#### Acceptance Criteria

1. THE Frontend SHALL provide a "Lower Thirds" widget registered in the widget system and configurable via the `widget_configurations` table. The widget SHALL use `WidgetContainer` with title "Lower Thirds" and no connection status indicators.
2. THE widget SHALL display three sections in order: "Active", "Staged", and "Library".
3. THE Active section SHALL display at most one item. Each item SHALL show: the display text as the title (CSS ellipsis for overflow), the lower-third type as the subtitle, and a dismiss button (X icon, 2.5rem × 2.5rem touch target). IF the active item has auto-dismiss enabled, a countdown indicator SHALL be displayed showing remaining time. WHEN the countdown reaches zero, the item SHALL show a "Dismissing" text overlay. WHEN the backend confirms dismissal is complete, the row SHALL be removed.
4. IF the active item is a paginated scripture, a pagination row SHALL appear below the active item showing the current page's scripture reference range (e.g., "Genesis 1:3-4"), with Previous and Next buttons (2.5rem × 2.5rem). The Previous button SHALL be disabled on the first page; the Next button SHALL be disabled on the last page.
5. THE Staged section SHALL display at most one item. Each item SHALL show: the display text as the title, the type as the subtitle, an UP arrow button to promote to Active, a DOWN arrow button to demote back to Library, and a pencil icon for editing. All control buttons SHALL be 2.5rem × 2.5rem.
6. THE Library section SHALL display items in two groups: template-derived items first (sorted alphabetically by template name), then volunteer-added items (sorted by creation time, oldest first). Each item SHALL show: the display text as the title (or the template name for template-derived items, with subtitle "Template"), the type as the subtitle, an UP arrow button to promote to Staged, a trashcan button to delete (with confirmation dialog), and a pencil icon for editing. All control buttons SHALL be 2.5rem × 2.5rem.
7. IF a library item is currently in Staged or Active state, it SHALL display an overlay badge indicating "Staged" or "Active" respectively, and its promote/delete controls SHALL be disabled.
8. IF a library item has been used (previously active during this session), it SHALL display a left border color using `color-warning` (`#F39C12`) to visually distinguish it from unused items.
9. FOR template-derived library items, the trashcan button SHALL NOT be shown (they cannot be deleted from the library — they are derived from templates). The pencil icon SHALL also NOT be shown (their content is determined by the template + manifest).
10. AT the bottom of the widget, an "Add" button SHALL open a dropdown allowing the volunteer to choose a type (Title, Title + Subtitle, Scripture). Upon selection, a dialog SHALL appear with the appropriate input fields for that type.
11. THE Add dialog SHALL provide three actions: "Cancel", "Save" (adds to Library), and "Save & Stage" (adds to Library and promotes to Staged). IF "Save & Stage" is tapped and an item is already staged, a warning dialog SHALL appear showing the currently staged item's type and content, with buttons: "Cancel", "Only Save", and "Save & Stage".
12. WHEN saving a Scripture type, THE volunteer SHALL provide only the scripture reference (using the existing `ScriptureReferenceInput` component). THE backend and overlay page SHALL handle verse lookup and pagination.
13. ADDING a new item to the library SHALL NOT shift the scroll position of the Library section. New volunteer-added items appear at the bottom of the volunteer-added group (after all template-derived items, and after all previously-added volunteer items).
14. THE promote-to-active button (on staged items) and the dismiss button (on active items) SHALL be disabled while a transition lock is active. A brief "Transitioning..." label SHALL appear during the lock.
15. WHEN the auto-dismiss timer is active, THE frontend SHALL display a circular countdown indicator. The frontend receives `autoDismissAt` (timestamp) from the backend and counts down locally. The frontend SHALL NOT remove the active item until it receives the `dismissed` phase from the backend, to account for animation duration and clock drift.
16. FOR the auto-dismiss initial state: IF the dashboard connects (or reconnects) while an auto-dismiss timer is running, THE backend SHALL include `autoDismissAt` in the initial state payload so the dashboard can render the countdown from the correct remaining time.

---

### Requirement 6: Lower-Third Display and Animation

**User Story:** As a viewer, I want lower-third graphics to appear and disappear with smooth, professional animations, so that the stream looks polished.

#### Acceptance Criteria

1. THE Overlay Page SHALL support a `style` field on each lower-third item. The initial (and only) style SHALL be `"blue_rhombus"`. The system SHALL be designed to support additional styles in the future without architectural changes.
2. THE Blue Rhombus style SHALL render as: a thin, royal blue rhombus shape anchored to the left, with a dark semi-transparent background plate (approximately 85% opacity) extending to its right containing the display text. The entire unit SHALL be positioned in the bottom-left of the Aspect Ratio Jail container, respecting the 15% bottom margin.
3. ALL text, padding, and margins within the lower-third SHALL use container-relative units (`cqw`, `cqh`) based on the Aspect Ratio Jail container, ensuring proportional rendering at any output resolution (720p, 1080p, 4K).
4. THE Blue Rhombus entrance animation ("show") SHALL be a coordinated wipe sequence: (a) the thin blue rhombus grows vertically from center to full height, (b) once established, the dark background and text unfold to the right, appearing to slide out from behind the rhombus. THE Overlay Page SHALL report phase `showing` at the start and `visible` at the end.
5. THE Blue Rhombus exit animation ("dismiss") SHALL be: (a) the blue rhombus maintains its width and height as it slides across the entire length of the graphic from left to right, acting as a traveling curtain that erases the background and text behind it (text does not move), (b) once the rhombus reaches the end, it shrinks vertically back to zero from center (mirroring the entrance animation's vertical growth from center). THE Overlay Page SHALL report phase `dismissing` at the start and `hidden` at the end.
6. THE push-up transition (direct content swap without full dismiss/show) SHALL: keep the blue rhombus and dark plate locked in place, slide old text up and out of view while new text slides up into place. IF the height changes (e.g., Title to TitleSubtitle), the plate height SHALL animate smoothly during the transition. THE Overlay Page SHALL report phase `showing` at the start and `visible` at the end. During the push-up, text SHALL be clipped before reaching any container edges — for Title/TitleSubtitle, text disappears before hitting the top edge of the text plate; for scripture page transitions, verse text disappears before reaching the reference line. WHEN transitioning from a Scripture type to a non-Scripture type (or vice versa), the scripture reference line SHALL move with the outgoing/incoming text (it is not fixed during cross-type transitions — it is only fixed during same-scripture page transitions).
7. FOR the Title type, text SHALL be bold and slightly larger than standard body text (not dramatically oversized).
8. FOR the TitleSubtitle type, the title SHALL match the Title type styling. The subtitle SHALL be non-bold, italic, positioned below the title with appropriate line spacing.
9. FOR the Scripture type, the scripture reference SHALL be displayed as a bold title line (slightly larger than verse text but smaller than a Title type). Verse text SHALL appear below the reference. Verse text width SHALL be capped at 70% of the plate width to reduce eye strain. IF expanding to 80% width would eliminate a line wrap (removing a line that contains only one or two short words), the width SHALL expand to 80% for that content.
10. FOR Scripture single verse: no verse number prefix, text displayed below the reference.
11. FOR Scripture multi-verse (small — fits in 4 lines or fewer of verse text, excluding the reference title line): each verse starts a new line with a number prefix (e.g., "1. ..."). Verse 0 has no number prefix and is displayed in italics. The line width cap SHALL be calculated to favor the longest verse, expanding only if it eliminates at least one line from the total height.
12. FOR Scripture multi-verse (large — verse text exceeds 4 lines, excluding the reference title line): the content SHALL be paginated. The scripture reference title line remains fixed across all pages. No verse SHALL be split across pages. The volunteer controls pagination via the dashboard widget (Req 5.4).
13. FOR scripture page transitions, the reference line remains fixed while verse content slides up in page chunks. The plate height SHALL animate smoothly to fit the new page's content.
14. ALL animations SHALL be implemented in CSS where possible (transitions, keyframes). JavaScript animation SHALL be used only where CSS cannot achieve the required coordination.
15. WHEN a dismiss animation is in progress and a new show command arrives, THE overlay SHALL NOT interrupt the dismiss. It SHALL wait for the dismiss to complete, then execute the show animation. The backend enforces this via transition lock, but the overlay SHALL also enforce it locally as a safety measure.


---

### Requirement 7: Scripture Measurement and Pagination Protocol

**User Story:** As a volunteer, I want scripture passages to be automatically paginated based on actual rendered size, so that text never overflows the lower-third graphic.

#### Acceptance Criteria

1. WHEN a Scripture lower-third is activated, THE backend SHALL look up the verse text from the `kjv` table for the specified reference range and send the full verse data to the overlay page.
2. THE Overlay Page SHALL measure the rendered height of the verses within the lower-third container (using the actual CSS styling, fonts, and container width) to determine pagination. All measurements SHALL occur in the context of the overlay page's rendering environment — not on the backend or dashboard.
3. THE Overlay Page SHALL determine page breaks such that: (a) no single verse is split across pages, (b) each page fits within 4 lines of rendered verse text (excluding the scripture reference title line, which is always visible), (c) verse 0 (if present) is always on the first page.
4. AFTER determining page breaks, THE Overlay Page SHALL report the page breakdown to the backend. The breakdown SHALL include: total page count, and for each page, the verse range displayed (start verse number, end verse number).
5. THE backend SHALL relay the page breakdown to all connected dashboard clients so the volunteer can see pagination controls with accurate page references.
6. THE volunteer SHALL control page navigation via Previous/Next buttons in the widget. Page commands flow: dashboard → backend → overlay. The overlay animates the page transition and reports the new phase.
7. FOR the width optimization (Req 6.9 — expanding from 70% to 80% if it eliminates a wrap): THE Overlay Page SHALL perform this measurement during the pagination calculation, testing both widths and choosing the narrower width unless the wider width reduces the total line count.

---

### Requirement 8: Socket Communication and Event Flow

**User Story:** As a developer, I want clear, well-defined socket events for the lower-third system, so that the overlay, backend, and dashboard stay synchronized.

#### Acceptance Criteria

1. THE backend SHALL expose a `/overlay` Socket.io namespace that does not require JWT authentication. This namespace SHALL only emit display commands to connected overlay clients and receive animation phase reports and telemetry from them. It SHALL NOT accept control commands (promote, dismiss, stage, etc.) — those flow through the authenticated default namespace.
2. THE backend SHALL emit the following to the `/overlay` namespace: (a) `show` — display a lower-third (includes full item data, style, and content), (b) `dismiss` — trigger the dismiss animation, (c) `push-up` — trigger a direct content swap (includes new item data), (d) `page` — navigate to a specific scripture page, (e) `state` — full state sync (sent on connection for initial state).
3. THE overlay SHALL emit the following to the `/overlay` namespace: (a) `phase` — animation phase report (`showing`, `visible`, `dismissing`, `hidden`), (b) `resolution` — resolution telemetry on connection (`{ width, height, isCorrect }`), (c) `pages` — scripture page breakdown after measurement.
4. THE backend SHALL emit the following to authenticated dashboard clients (default namespace) via a single event name with a `phase` field: (a) phase `showing` — a lower-third is being shown (entrance animation in progress), (b) phase `visible` — lower-third is fully displayed, (c) phase `dismissing` — dismiss animation in progress, (d) phase `hidden` — lower-third has been fully removed. This single event carries the full lower-third state (active item, staged item, library, phase, autoDismissAt, pages).
5. DASHBOARD clients SHALL emit commands to the backend (default namespace): (a) promote-to-active (from staged), (b) dismiss-active, (c) promote-to-staged (from library), (d) demote-from-staged (back to library), (e) add-to-library, (f) remove-from-library, (g) edit-library-item, (h) page-next, (i) page-previous.
6. ALL socket event name constants SHALL be defined in `packages/shared/src/constants/socketEvents.ts` following the existing `CTS_`/`STC_` prefix convention. Overlay-specific events SHALL use `OTC_` (overlay-to-controller) and `CTO_` (controller-to-overlay) prefixes.
7. THE Overlay Page SHALL send log entries to the backend via `POST /api/overlay/logs` — a dedicated unauthenticated endpoint that accepts the same batch format as the existing `POST /api/logs` but writes entries with `source: "overlay"`, producing the `[overlay]` prefix in log output (distinct from `[backend]` and `[frontend]`). This endpoint SHALL NOT require JWT authentication. This ensures that catastrophic overlay errors are captured in the unified log file for post-incident debugging, even when the WebSocket is disconnected.
8. WHEN the overlay disconnects from the `/overlay` namespace, THE backend SHALL NOT immediately clear the active state. The overlay may reconnect and resume display. IF the overlay has been disconnected for more than 30 seconds and there is an active lower-third, THE backend SHALL mark the active item as stale (for dashboard display purposes) but SHALL NOT send dismiss commands to a disconnected overlay.
9. WHEN the overlay reconnects, THE backend SHALL send the full current state including a `skipEntrance: true` flag when an item was already active (phase was `visible` before disconnect). The overlay SHALL render the item immediately at full visibility (no entrance animation) and report phase `visible`. IF the phase was `showing` or `dismissing` at disconnect time, the backend SHALL send the state with the appropriate phase so the overlay can resume or complete the animation.

---

### Requirement 9: Lower-Third Widget Interactions and Edge Cases

**User Story:** As a volunteer, I want the lower-third controls to be intuitive and prevent mistakes, so that I can operate confidently during a live service.

#### Acceptance Criteria

1. WHEN the volunteer promotes a staged item to active while another item is already active, THE system SHALL use the push-up transition (Req 6.6) — not the full dismiss/show sequence. The previously active item returns to the library (if it was volunteer-added) or simply deactivates (if template-derived).
2. WHEN the volunteer dismisses the active item, THE system SHALL trigger the dismiss animation. After the animation completes (backend receives `hidden` phase from overlay), the item returns to the library (if volunteer-added) or simply deactivates (if template-derived).
3. THE volunteer SHALL NOT be able to promote directly from Library to Active. The flow is always Library → Staged → Active. This ensures the volunteer has a moment to verify before going live.
4. WHEN a volunteer edits a staged or library item, THE edit dialog SHALL pre-populate with the item's current values. Saving an edit to a staged item SHALL update it in place without changing its staged status. Editing a library item SHALL NOT change its sort position — order is based on original creation time, not last-edited time.
5. WHEN deleting a library item, a confirmation dialog SHALL appear showing the item's type and content. Template-derived items cannot be deleted (Req 5.9).
6. IF the overlay page is not connected when a promote-to-active command is received, THE backend SHALL still accept the command, update the active state, and emit state to dashboard clients. The active item will display "No overlay connected" status on the dashboard. WHEN the overlay connects, it will receive the active item via initial state and display it.
7. FOR auto-dismiss countdown display: THE backend SHALL send `autoDismissAt` (ISO timestamp) to the dashboard. The dashboard SHALL render a circular countdown locally. WHEN the backend fires the dismiss (timer expired), it sends phase `dismissing` to the dashboard. WHEN the overlay completes the animation, the backend sends phase `hidden` (item fully gone). The dashboard SHALL show "Dismissing" overlay text during the `dismissing` phase and remove the row only on `hidden`.
8. IF the backend restarts while a lower-third is active on the overlay, THE overlay's 30-second disconnect timeout (Req 1.10) will dismiss it. When the backend comes back up, the overlay reconnects and receives `hidden` state (fresh start). No manual intervention is required.
9. WHEN the session manifest is cleared, template-derived library items SHALL be recomputed (most will disappear since tokens are no longer resolvable). Volunteer-added items SHALL remain. IF the active or staged item was template-derived and its tokens are no longer resolvable, it SHALL remain active/staged with its last-interpolated content (it was already computed) — it is not forcibly dismissed mid-display.
10. THE widget SHALL display inline placeholder messages when sections are empty: "Nothing active" in the Active section, "Nothing staged" in the Staged section, and "No items available" in the Library section when the library is empty (no templates resolvable and no volunteer-added items).

---

## Accepted Risks

### Risk 1: 30-Second Stale Lower-Third on Backend Crash

If the backend crashes while a lower-third is active, the overlay will continue displaying it for up to 30 seconds before the disconnect timeout triggers a graceful dismiss. During this window, the graphic is "stuck" on stream. This is accepted — the 30-second timeout provides a reasonable safety net, and backend crashes are rare in production.

### Risk 2: Clock Drift on Auto-Dismiss Countdown

The dashboard displays a locally-computed countdown based on `autoDismissAt`. Minor clock drift between the backend and dashboard may cause the visual countdown to be slightly off (±1-2 seconds). This is accepted — the backend is authoritative for the actual dismiss trigger, and the dashboard waits for the `hidden` phase before removing the row.

### Risk 3: Scripture Pagination Depends on Overlay Rendering

Page breaks are determined by the overlay page's actual rendered text measurements. If the overlay is not connected when a scripture lower-third is activated, pagination cannot be computed until the overlay connects. The dashboard will show "Measuring..." until page data arrives. This is accepted — the overlay must be connected for any lower-third to be visible anyway.

### Risk 4: No Random-Access Page Navigation

Scripture pagination only supports sequential Previous/Next navigation. The volunteer cannot jump directly to page 3 of 5. This is accepted as a simplicity tradeoff — sequential navigation with clear page references (showing which verses are on screen) provides sufficient control for live operation.

### Risk 5: Volunteer-Added Items Lost on Restart

Manually added lower-third items (non-template) are stored in-memory and lost on backend restart. This is accepted — these items are typically day-specific (speaker names, one-off announcements) and would need to be re-entered for a new session anyway. Template-derived items automatically repopulate from the database.

### Risk 6: Single Overlay Client Assumption

The system assumes at most one overlay client is connected at a time. If multiple OBS instances connect to the `/overlay` namespace, they will all receive the same commands and display the same content. No conflict resolution is implemented. This is accepted — the deployment model is a single OBS instance per venue.
