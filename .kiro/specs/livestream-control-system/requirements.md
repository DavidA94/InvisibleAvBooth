# Requirements Document

## Introduction

Invisible A/V Booth is a web-based, touch-first control interface for managing church livestream operations. It is designed for non-technical volunteers who may be stepping in with minimal context. The system is composed of modular widgets rendered on a responsive dashboard grid, each communicating exclusively through a Node.js backend abstraction layer. The backend is the single authority for all device state, commands, and session metadata. This initial release covers the foundational platform (authentication, dashboard grid, session manifest, real-time sync, error notifications) and the OBS widget (stream/recording control and metadata preview). Camera PTZ, audio mixer, and text overlay widgets are out of scope for this release and will be added as separate specs.

---

## Glossary

- **System**: Invisible A/V Booth as a whole.
- **Backend**: The Node.js server that mediates all device communication, state management, and authentication.
- **Widget**: A modular UI component that displays device state and provides controls for a specific device or function.
- **Dashboard**: A named, admin-configured responsive grid layout that hosts one or more Widgets. A user may have access to multiple dashboards based on their role. Each dashboard has a name and description visible during selection.
- **GridManifest**: The JSON structure describing a dashboard's layout (widget positions, titles, cell role permissions). Stored in the backend `widget_configurations` database table, scoped to a dashboard ID, and served via `GET /api/dashboards/:id/layout`. The frontend uses a hardcoded `DEFAULT_GRID_MANIFEST` constant only as a fallback if the API call fails or returns an unparseable response.
- **Toast**: A short-lived (5-second) non-blocking notification.
- **Banner**: A persistent, dismissable warning or error notification displayed in the UI.
- **Modal**: A blocking notification requiring user acknowledgment, used for catastrophic errors.
- **optimisticUpdate**: A UI state change applied immediately before backend confirmation, later reconciled.
- **commandedState**: The last-known state issued by the Backend for a device, used to detect divergence against real-time state events from the device.
- **ScriptureReference**: A structured object containing `bookId` (number, 1–66 where Genesis = 1 and Revelation = 66), `chapter` (number), `verse` (number), and optional `verseEnd` (number) for verse ranges (e.g., John 3:16–17). The frontend displays the resolved book name from the `BIBLE_BOOKS` constant; `bookId` is used for all storage and transmission.
- **GlobalTitleBar**: The persistent title bar shown on all fully-authenticated screens, displaying the active user's name, role, and a dashboard navigation label ("Choose Dashboard" when no dashboard is loaded, or the active dashboard name when one is loaded). Provides logout access and dashboard navigation.
- **DashboardSelectionScreen**: The intermediate screen shown after login (or when no dashboard is cached) that lists all dashboards accessible to the user, with name and description.
- **ConfirmationModal**: A reusable platform modal component used for all confirmation dialogs in the system — both destructive actions and significant pre-flight confirmations.
- **ConnectionStatus**: A named health indicator (label + healthy boolean) displayed in the `WidgetContainer` title bar for each connection associated with a widget.
- **space-screen-edge**: Spacing token (1rem) — dashboard outer padding on all four sides.
- **space-grid-gap**: Spacing token (0.75rem) — gap between widgets in the dashboard grid.
- **space-widget-inner**: Spacing token (0.75rem) — inner padding enforced by `WidgetContainer` on all sides.
- **space-control-gap**: Spacing token (0.75rem) — gap between interactive controls within a widget.

---

## Requirements

### Requirement 1: Backend as Single Communication Authority

**User Story:** As a system architect, I want all device communication to flow exclusively through the backend, so that state is consistent across all clients and no widget can issue conflicting commands.

#### Acceptance Criteria

1. THE Backend SHALL route all commands from Widgets to devices through the appropriate HAL service (e.g., ObsService).
2. THE System SHALL NOT permit any Widget to communicate directly with a device; all interactions must pass through the Backend.
3. THE HAL SHALL expose a service interface per device type that encapsulates all device-specific protocol logic.
4. WHEN a Widget sends a command, THE Backend SHALL authenticate and authorize the command before forwarding it to the HAL.
5. IF a HAL service is unavailable, THEN THE Backend SHALL return an error response to the requesting Widget without forwarding the command.

---

### Requirement 2: Active Session Manifest

**User Story:** As a volunteer, I want session metadata (speaker, title, scripture) to be entered once and automatically propagate to all relevant outputs, so that I do not have to update multiple places manually.

#### Acceptance Criteria

1. THE Backend SHALL maintain a SessionManifest containing Speaker Name, Sermon Title, and a structured ScriptureReference (bookId, chapter, verse, optional verseEnd) as a volatile in-memory object for the duration of a service session. The date is not a user-settable field — it is always set by the backend to today's ISO 8601 date during template interpolation.
2. WHEN a client updates any field in the SessionManifest, THE Backend SHALL validate the update, persist it in memory, emit a `session:manifest:updated` event on the internal EventBus, and broadcast the updated SessionManifest to all connected clients via WebSocket.
3. HAL services that require SessionManifest data (e.g., ObsService for metadata interpolation) SHALL subscribe to the `session:manifest:updated` event on the EventBus independently; no service SHALL be hard-coded as a recipient in the SessionManifest update path.
4. THE Backend SHALL provide a REST endpoint to retrieve the current SessionManifest.
5. IF the Backend restarts, THEN THE Backend SHALL initialize the SessionManifest with all fields absent (`{}`).

---

### Requirement 3: Capabilities Discovery

**User Story:** As a widget developer, I want the backend to expose a capabilities object per device, so that widgets can dynamically disable or hide controls that the connected hardware does not support.

#### Acceptance Criteria

1. THE Backend SHALL provide a CapabilitiesObject for each configured device upon client connection via WebSocket.
2. THE CapabilitiesObject SHALL enumerate the supported features of the device using a defined, consistent JSON schema.
3. WHEN a Widget receives a CapabilitiesObject, THE Widget SHALL disable or hide controls for features not listed as supported.
4. WHEN a device's capabilities change (e.g., reconnection with different firmware), THE Backend SHALL broadcast an updated CapabilitiesObject to all connected clients.

---

### Requirement 4: Real-Time State Synchronization via WebSocket

**User Story:** As a volunteer, I want all widgets to reflect the current device state in real time, so that I always know what is actually happening without refreshing the page.

#### Acceptance Criteria

1. THE Backend SHALL use Socket.io to broadcast device state changes to all connected clients.
2. WHEN a device state changes (via polling or command confirmation), THE Backend SHALL emit a state update event to all subscribed clients within 500ms of detecting the change.
3. WHEN a client connects, THE Backend SHALL emit the current known state for all devices to that client.
4. WHILE a pollable device is connected, THE Backend SHALL poll the device at a configured interval and reconcile any differences between polled state and commandedState.
5. WHEN a manual adjustment is detected on a pollable device (e.g., a physical fader moved on the XR18), THE Backend SHALL update its internal state and broadcast the reconciled state to all clients.
6. FOR event-driven devices (e.g., OBS via obs-websocket), THE Backend SHALL reconcile `commandedState` against real-time state events pushed by the device and broadcast the authoritative state to all clients.

---

### Requirement 5: Dashboard Selection and Navigation

**User Story:** As a volunteer, I want to select my dashboard after logging in and have the system remember my choice, so that I can get to my controls quickly on subsequent visits.

#### Acceptance Criteria

1. THE Backend SHALL expose a `GET /api/dashboards` endpoint that returns all dashboards accessible to the authenticated user's role, including each dashboard's `id`, `name`, and `description`.
2. ADMIN users SHALL have access to all dashboards regardless of the dashboard's configured allowed roles.
3. WHEN a user authenticates and has no cached dashboard ID in localStorage, THE Frontend SHALL display the Dashboard Selection Screen showing all accessible dashboards with their name and description.
4. WHEN a user authenticates and has access to exactly one dashboard and no cached dashboard ID, THE Frontend SHALL automatically select that dashboard without showing the selection screen. This auto-select behavior applies only on initial authentication — tapping the dashboard navigation label in the `GlobalTitleBar` always navigates to the Dashboard Selection Screen regardless of how many dashboards are accessible.
5. WHEN a user selects a dashboard, THE Frontend SHALL store the dashboard ID in localStorage and proceed to load the dashboard layout.
6. WHEN the Dashboard Selection Screen is shown and the user has no accessible dashboards, THE Frontend SHALL display a "No Dashboards" title and "Please contact the administrator" message instead of a selection list.
7. WHEN a user authenticates and has a valid cached dashboard ID, THE Frontend SHALL skip the selection screen and proceed directly to load the dashboard.
8. WHEN a cached dashboard ID is invalid (dashboard no longer exists, user has lost access, or the ID cannot be resolved), THE Frontend SHALL clear the cached ID, display a Toast notification "Invalid Dashboard", and show the Dashboard Selection Screen.

---

### Requirement 5b: Dashboard Layout Loading

**User Story:** As a volunteer, I want the dashboard to load quickly and stay up to date, so that I always see the correct layout without manual refreshes.

#### Acceptance Criteria

1. THE Backend SHALL expose a `GET /api/dashboards/:id/layout` endpoint (authenticated) that returns the `GridManifest` for the specified dashboard.
2. WHEN loading a dashboard, THE Frontend SHALL display a full-screen spinner with the text "Loading Dashboard" while the layout API call is in progress.
3. WHEN the layout API call completes successfully, THE Frontend SHALL cache the parsed `GridManifest` in localStorage keyed by dashboard ID and render the dashboard.
4. IF the layout API call fails or returns an unparseable response, THE Frontend SHALL fall back to the cached `GridManifest` for that dashboard ID if one exists; IF no cached layout exists, THE Frontend SHALL show the Dashboard Selection Screen with a Toast "Could not load dashboard".
5. AFTER the dashboard renders from cache, THE Frontend SHALL immediately fetch the fresh layout from the API in the background. IF the fresh layout differs in widget placement (different `widgetId`, `col`, `row`, `colSpan`, or `rowSpan` values), THE Frontend SHALL display a full-screen spinner "Refreshing Dashboard", apply the new layout, and update the cache. IF only non-structural data changes (e.g., widget title), THE Frontend SHALL apply the update silently with no spinner.
6. IF the stored `GridManifest` cannot be parsed (malformed JSON, unknown widget type, or schema incompatible with the current frontend version), THE Frontend SHALL treat it as an invalid cached layout, clear it from localStorage, and fetch fresh from the API.
7. THE Dashboard SHALL render a 5-column by 3-row grid in landscape orientation and a 3-column by 5-row grid in portrait orientation, reflowing automatically on orientation change.
8. EACH Widget SHALL declare a footprint (e.g., 1×1, 2×1, 2×2) that determines the grid cells it occupies.
9. THE Backend SHALL enforce that each `widgetId` is unique within a dashboard's `widget_configurations` rows via a database unique constraint on `dashboardId + widgetId`; the Frontend SHALL NOT reject a loaded `GridManifest` that contains duplicate `widgetId` values — if duplicates exist, the dashboard renders as-is.
10. THE Backend SHALL store dashboard layout in the `widget_configurations` table, scoped to a `dashboardId` foreign key.

---

### Requirement 5c: Global Title Bar

**User Story:** As a volunteer, I want to always see who I'm logged in as and which dashboard I'm on, so that I have context at a glance and can navigate or log out easily.

#### Acceptance Criteria

1. THE Frontend SHALL display a persistent `GlobalTitleBar` on all fully-authenticated screens (dashboard, dashboard selection, admin pages, and password change screen). On the password change screen, the bar displays a reduced variant (username and Logout only — see Requirement 5c.3); on all other authenticated screens it displays the full variant.
2. ON the dashboard and admin pages, THE `GlobalTitleBar` SHALL display: the authenticated user's username, their role, a dashboard navigation label, and a Logout button. WHEN a dashboard is currently loaded, the label SHALL show the active dashboard's name; WHEN no dashboard is loaded (e.g., on admin pages, or on the Dashboard Selection Screen itself), the label SHALL show "Choose Dashboard".
3. ON the password change screen (`/change-password`), THE `GlobalTitleBar` SHALL display only the username and a Logout button — role and dashboard navigation label are omitted since the user has not yet completed setup.
4. WHEN the user taps the dashboard navigation label in the `GlobalTitleBar`, THE Frontend SHALL always navigate to the Dashboard Selection Screen — regardless of any cached dashboard ID or how many dashboards are accessible. The Socket.io connection SHALL remain open but all widget event listeners SHALL be removed as their components unmount.
5. THE Logout button in the `GlobalTitleBar` SHALL call `POST /auth/logout`, clear the JWT cookie, clear the cached dashboard ID and layout from localStorage, and redirect to `/login`.

---

### Requirement 5d: Dashboard Bootstrap and Administration

**User Story:** As an administrator, I want to configure dashboards with names, descriptions, and role access, so that different users see the appropriate controls for their role.

#### Acceptance Criteria

1. THE Backend SHALL store dashboards in a `dashboards` table with `id`, `name`, `description`, and `allowedRoles` (the set of roles permitted to access the dashboard).
2. ADMIN users SHALL always have access to all dashboards, regardless of `allowedRoles`.
3. THE Backend SHALL expose REST endpoints for creating, reading, updating, and deleting dashboards; all dashboard management endpoints SHALL require the ADMIN role.
4. THE `widget_configurations` table SHALL include a `dashboardId` foreign key linking each widget configuration to its parent dashboard.
5. IN the absence of a dashboard builder UI, dashboards SHALL be created and seeded via a backend seed script (`scripts/seed-dashboard.ts`) that can be run independently to bootstrap the initial dashboard configuration into the database.

---

### Requirement 6: Authentication and JWT-Based Access Control

**User Story:** As an administrator, I want the system to require login with role-based access, so that volunteers only see controls appropriate for their skill level and cannot accidentally access advanced or dangerous settings.

#### Acceptance Criteria

1. THE AuthService SHALL require users to authenticate with a username and hashed password via a REST login endpoint before accessing any dashboard or device control.
2. WHEN a user successfully authenticates, THE AuthService SHALL issue a signed JWT as an `HttpOnly`, `Secure`, `SameSite=Lax` cookie containing the user's role (ADMIN, AvPowerUser, or AvVolunteer); the JWT SHALL NOT be returned in the response body or stored in localStorage or sessionStorage. `SameSite=Lax` is used rather than `Strict` so that bookmarked URLs and links from other origins (e.g., a link in an email) navigate correctly without forcing re-login — `Lax` still blocks cross-site POST requests, preserving CSRF protection.
3. THE default JWT expiry SHALL be 8 hours; WHEN a user selects "Remember me" on the login form, THE JWT expiry SHALL be set to 30 days.
4. THE Backend SHALL validate the JWT cookie on every REST request and WebSocket connection.
5. IF a JWT is invalid or expired, THEN THE Backend SHALL reject the request with a 401 Unauthorized response.
6. THE System SHALL support local hosting with self-signed HTTPS or HTTP fallback. In development (non-production environments), the JWT cookie SHALL be issued without the Secure flag so that HTTP localhost works without a self-signed certificate.
7. THE AuthService SHALL store passwords using a cryptographic hashing algorithm (bcrypt or equivalent).
8. THE Backend SHALL provide a `POST /auth/logout` endpoint that clears the JWT cookie; upon logout, THE Frontend SHALL redirect to `/login`.

---

### Requirement 7: Role-Based Access Control (RBAC)

**User Story:** As an administrator, I want user roles to determine which widgets and dashboards are accessible, so that volunteers cannot accidentally trigger advanced or destructive operations.

#### Acceptance Criteria

1. THE Backend SHALL enforce RBAC such that ADMIN users have access to all system management, user management, and hardware control features.
2. THE Backend SHALL enforce RBAC such that AvPowerUser accounts have access to all hardware control widgets and advanced dashboard configurations.
3. THE Backend SHALL enforce RBAC such that AvVolunteer accounts have access only to simplified, safety-first dashboards and widgets designated for volunteer use.
4. WHEN a client requests a dashboard or widget, THE Backend SHALL verify the user's role and return only the resources permitted for that role.
5. IF a user attempts to access a resource outside their role's permissions, THEN THE Backend SHALL return a 403 Forbidden response.
6. THE Dashboard SHALL render only the widgets and controls permitted by the authenticated user's role.

---

### Requirement 8: OBS Widget — Stream and Recording Control

**User Story:** As a volunteer, I want a simple widget to start and stop the stream and recording in OBS, so that I can manage the broadcast without needing to open OBS directly.

#### Acceptance Criteria

1. THE ObsService SHALL connect to OBS via obs-websocket using connection parameters read from the `device_connections` table in the SQLite database.
2. WHEN a user triggers "Start Stream," THE Backend SHALL first update OBS stream metadata using the current SessionManifest, confirm success, and then command OBS to start streaming.
3. WHEN a user triggers "Stop Stream," THE Backend SHALL command OBS to stop streaming and confirm the stopped state before updating the Widget.
4. WHEN a user triggers "Start Recording" or "Stop Recording," THE Backend SHALL command OBS accordingly and confirm the state change before updating the Widget.
5. WHILE a stream start or stop command is in progress, THE OBS Widget SHALL display a pending state indicator until the Backend confirms the outcome.
6. IF OBS is unreachable while streaming or recording is active, THEN THE Backend SHALL emit an error event with context indicating which operations were active, and THE OBS Widget SHALL display a catastrophic error Modal with a message that names the affected operations and communicates uncertainty about their status (e.g., "stream status unknown", "recording status unknown") — the tablet may have lost its connection while OBS remains healthy. IF OBS is unreachable while idle, THE Backend SHALL emit a Banner-level error instead.
7. IF a stream start or stop command fails, THEN THE Backend SHALL report the failure; THE OBS Widget SHALL display a Banner notification and auto-clear it when the user retries the command, so that a second consecutive failure is clearly visible as a new event rather than a stale one.
8. WHEN OBS reconnects after a disconnect during which `commandedState.streaming` was `true`, IF `obsState.streaming` is `false` after reconciliation, THE Backend SHALL emit a Banner-level notification: "Stream did not resume after reconnect. Tap Start Stream to go live again." This Banner SHALL be manually dismissable and SHALL auto-clear when `obsState.streaming` becomes `true`.
9. WHEN a user taps 'Start Stream' and the button is enabled, THE OBS Widget SHALL display a `ConfirmationModal` with title "Begin Stream", a body slot showing the `interpolatedStreamTitle` in a visually distinct block (bold text on `color-surface-raised` background, with a muted "Stream title" label above it), confirm label "Start Stream", and cancel label "Cancel" before issuing the start command; THE start command SHALL NOT be issued if the user cancels.
10. WHEN a user triggers 'Stop Stream' while streaming is active, THE OBS Widget SHALL display a `ConfirmationModal` with title "Are you sure you want to stop the stream?", confirm label "Stop Streaming", and cancel label "Continue Streaming" before issuing the stop command; THE stop command SHALL NOT be issued if the user cancels.
11. WHEN a user triggers 'Stop Recording' while recording is active, THE OBS Widget SHALL display a `ConfirmationModal` with title "Are you sure you want to stop recording?", body "Stopping the recording will create a gap. Content recorded while stopped cannot be recovered.", confirm label "Stop Recording", and cancel label "Keep Recording" before issuing the stop command; THE stop command SHALL NOT be issued if the user cancels.
12. THE 'Start Stream' button SHALL be disabled unless the SessionManifest contains at least one of `speaker` or `title`; THE OBS Widget SHALL display a sub-label "Enter metadata" on the disabled button; WHEN the user taps the disabled button and the only reason it is disabled is missing metadata (OBS is connected, no other blocker), THE OBS Widget SHALL open the SessionManifestModal directly; WHEN the user taps the disabled button and OBS is disconnected or another blocker is active, THE OBS Widget SHALL display a Toast notification explaining the reason (e.g., "OBS is not connected").
13. WHEN the SessionManifest has no fields set, THE OBS Widget metadata preview row SHALL display "No session details set" in muted text; WHEN required fields are partially filled, THE preview row SHALL display the interpolated title with visible placeholders (e.g., `[No Speaker]`) so the volunteer can see exactly what is missing.

---

### Requirement 9: OBS Metadata Template Engine

**User Story:** As a volunteer, I want to see a live preview of the stream title before going live, so that I can confirm the metadata is correct before the stream starts.

#### Acceptance Criteria

1. THE Backend SHALL maintain a configurable metadata template string (e.g., `{Date} – {Speaker} – {Title}`) for OBS stream metadata; IF no template is configured for a device connection, THE Backend SHALL use the default `"{Date} – {Speaker} – {Title}"`.
2. WHEN the SessionManifest is updated, THE Backend SHALL interpolate the template string with the current SessionManifest values and emit the result to all connected clients.
3. THE OBS Widget SHALL display the interpolated metadata string in a Preview Field before the stream is started.
4. THE Backend SHALL perform all template interpolation; no interpolation logic shall exist in the Widget.
5. IF a SessionManifest field referenced in the template is empty, THEN THE Backend SHALL substitute a visible placeholder (e.g., `[No Title]`) in the interpolated output.
6. THE Backend SHALL always use today's date (ISO 8601) when interpolating the `{Date}` token — the date is never submitted by the frontend and is not part of `SessionManifest`. A `[No Date]` placeholder SHALL never appear in the interpolated output.
7. WHEN the frontend emits `session:manifest:update`, THE Frontend SHALL disable the Save button and display a spinner for the duration of the ack wait; IF the ack does not arrive within 5 seconds, THE Frontend SHALL display an inline error in the SessionManifestModal and keep the modal open for retry. The 5-second timeout is accepted as a tradeoff — on a network under load this may trigger a false failure, but it ensures the volunteer knows quickly if something is wrong rather than waiting indefinitely.

---

### Requirement 10: Error Notification System

**User Story:** As a volunteer, I want clear, appropriately-urgent notifications when something goes wrong, so that I can quickly identify and respond to problems without being overwhelmed.

#### Acceptance Criteria

1. THE System SHALL display a Toast notification for non-critical informational events; each Toast SHALL auto-dismiss after 5 seconds.
2. THE System SHALL display a persistent Banner notification for device warnings and recoverable errors; Banners SHALL remain visible until dismissed by the user or auto-cleared by the Backend when the condition resolves.
3. WHEN multiple Banner notifications are active, THE Dashboard SHALL display them with a counter (e.g., "Error 1 of 3") and allow the user to navigate between them.
4. THE System SHALL display a Modal notification for catastrophic errors (e.g., OBS disconnect during a live stream); the Modal SHALL require user acknowledgment or be auto-cleared by the Backend when the condition resolves.
5. WHEN a device error resolves automatically, THE Backend SHALL emit a resolution event and THE System SHALL dismiss the associated Banner or Modal and display a Toast confirming resolution.
6. THE System SHALL NOT display a Modal for non-catastrophic errors that do not block continued operation.

---

### Requirement 11: Optimistic UI Updates and State Reconciliation

**User Story:** As a volunteer, I want controls to feel responsive immediately, so that the interface does not feel sluggish during live operation.

#### Acceptance Criteria

1. THE Widget SHALL apply an optimisticUpdate to its local display state immediately when a user issues a command, before receiving Backend confirmation.
2. WHEN the Backend confirms a command, THE Widget SHALL reconcile its display state with the confirmed Backend state.
3. IF the Backend returns an error for a command, THEN THE Widget SHALL revert the optimisticUpdate and display an appropriate notification.
4. WHILE a boolean operation (e.g., Start Stream, Stop Recording) is pending Backend confirmation, THE Widget SHALL display a pending state indicator and disable the triggering control.
5. THE Backend SHALL be the final authority on device state; any discrepancy between Widget display state and Backend state SHALL be resolved in favor of the Backend state.
6. FOR any action that submits a command or save to the backend and awaits a response or ack, THE Frontend SHALL disable the triggering control and display a spinner in place of the action label for the duration of the wait; THE control SHALL be re-enabled and the spinner removed when the response is received (success or error).

---

### Requirement 12: Extensibility — New Widget and Device Support

**User Story:** As a developer, I want to add new device types and widgets without modifying existing system components, so that the system can grow without requiring rewrites.

#### Acceptance Criteria

1. THE System SHALL support the addition of new HAL services for new device types without requiring changes to existing HAL services or the Widget framework.
2. THE System SHALL support the addition of new Widgets without requiring changes to the Dashboard grid framework or existing Widgets.
3. THE Backend SHALL expose a consistent service registration interface that new HAL services implement to integrate with the state broadcast and error reporting system.
4. THE Dashboard SHALL render new Widgets based on their declared footprint and role permissions without requiring Dashboard-level code changes.

---

### Requirement 13: User Management

**User Story:** As an administrator, I want to create, edit, and delete user accounts and assign roles, so that I can control who has access to the system and at what permission level.

#### Acceptance Criteria

1. THE AuthService SHALL persist user records (username, bcrypt-hashed password, role) in a local SQLite database that survives backend restarts.
2. THE Backend SHALL expose REST endpoints for creating, reading, updating, and deleting user accounts; all user management endpoints SHALL require the ADMIN role.
3. WHEN a new user is created, THE AuthService SHALL hash the provided password with bcrypt before storing it; plaintext passwords SHALL never be persisted.
4. THE Backend SHALL provide a REST endpoint to list all users (excluding password hashes) accessible only to ADMIN.
5. THE Frontend SHALL provide a dedicated Admin User Management page (route `/admin/users`) accessible only to authenticated ADMIN users; this page SHALL not be part of the dashboard widget grid.
6. THE Admin User Management page SHALL allow an ADMIN to create a new user with a username, password, and role; edit an existing user's username, password, or role; and delete a user.
7. IF an ADMIN attempts to delete their own account, THE Backend SHALL return an error and SHALL NOT delete the account.
8. ON first startup, IF no users exist in the database, THE Backend SHALL generate a cryptographically random 16-character password, create a default ADMIN account (username: `admin`), write the credentials to stdout AND to `data/bootstrap.txt`, and set `requiresPasswordChange: true` on the account.
9. `data/bootstrap.txt` SHALL be gitignored and SHALL be deleted automatically as the final step of `AuthService.changePassword()` after the password is successfully updated and a new JWT is issued; IF the file deletion fails, THE Backend SHALL log a warning but SHALL NOT fail the password change operation. The credentials in `bootstrap.txt` are the original bootstrap password and are invalid once the password has been changed, so a deletion failure is a low-severity security concern.
10. WHEN a user with `requiresPasswordChange: true` logs in, THE Backend SHALL include `requiresPasswordChange: true` in the JWT; THE Frontend SHALL redirect the user to a mandatory password change screen at `/change-password` before allowing access to the dashboard.
11. AFTER the admin changes their password on first login, THE Backend SHALL clear the `requiresPasswordChange` flag and issue a new JWT without it.

---

### Requirement 14: Device Connection Management

**User Story:** As an administrator, I want to configure device connection parameters (host, port, password) through the UI, so that I can update connection details without editing config files or redeploying the backend.

#### Acceptance Criteria

1. THE Backend SHALL store device connection parameters (host, port, password, metadata map, features map) in the SQLite database in a `device_connections` table; the `metadata` and `features` fields SHALL be stored as JSON strings and decoded by the DAO layer before being passed to the HAL factory.
2. Sensitive fields (passwords) SHALL be encrypted at rest using AES-256-GCM via Node's built-in `crypto` module; the encryption key SHALL be loaded from the `DEVICE_SECRET_KEY` environment variable and SHALL never be stored in the database or any config file.
3. IF `DEVICE_SECRET_KEY` is not set at startup, THE Backend SHALL refuse to start and SHALL log a clear error message.
4. THE Backend SHALL expose REST endpoints for creating, reading, updating, and deleting device connections; all device management endpoints SHALL require the ADMIN role.
5. WHEN reading device connections, THE Backend SHALL never return plaintext or encrypted passwords to the frontend; password fields are write-only.
6. THE Frontend SHALL provide a dedicated Admin Device Management page (route `/admin/devices`) accessible only to authenticated ADMIN users; this page SHALL not be part of the dashboard widget grid.
7. THE Admin Device Management page SHALL allow an ADMIN to add, edit, and delete device connections, including label, host, port, password, enabled status, and — for OBS connections — a Stream Title Template field (default: `{Date} – {Speaker} – {Title}`; supported tokens: `{Date}`, `{Speaker}`, `{Title}`, `{Scripture}`). The Stream Title Template field SHALL display a live preview of the interpolated title using the current SessionManifest values.
8. WHEN `ObsService` connects or reconnects, IT SHALL read its connection configuration (including the `metadata` and `features` maps) from the `device_connections` table rather than from static config files.

---

### Requirement 15: Session Lifecycle

**User Story:** As a volunteer, I want session metadata to persist across page refreshes and remain available after the stream ends, so that I can review or adjust it without re-entering everything.

#### Acceptance Criteria

1. THE SessionManifest SHALL persist in backend memory for the lifetime of the backend process; it SHALL NOT be cleared on frontend page refresh or client reconnect.
2. WHEN a client reconnects, THE Backend SHALL send the current SessionManifest to that client as part of the initial state broadcast.
3. WHILE streaming OR recording is active, THE Backend SHALL reject any request to clear the SessionManifest and SHALL return an error.
4. AFTER both streaming and recording have stopped, THE SessionManifest SHALL remain available in memory until either the backend restarts or the operator explicitly clears it via the "Clear All" action.
5. THE Frontend SHALL disable the "Clear All" button in the session metadata UI while `obsState.streaming || obsState.recording` is true.
6. WHEN the backend restarts, THE SessionManifest SHALL be initialized with all fields absent (`{}`).

---

### Requirement 16: Widget Container and Connection Status Indicators

**User Story:** As a volunteer, I want to see at a glance whether each widget's device connections are healthy, so that I can immediately identify a problem without waiting for a command to fail.

#### Acceptance Criteria

1. EVERY Widget SHALL render a `WidgetContainer` as its outermost element, passing its own title and connection state as props; no widget may render its content outside a `WidgetContainer`.
2. EACH Widget is responsible for sourcing and maintaining its own connection state and passing it to `WidgetContainer` — the widget knows which connections it depends on.
3. EACH connection status indicator SHALL display a green solid dot when the connection is healthy and a red blinking dot when the connection is unhealthy; the blinking behavior on unhealthy connections SHALL draw attention to the problem and serve as a motion cue to aid colorblind users.
4. WHEN sufficient horizontal space is available, THE title bar SHALL display each indicator with its label inline (e.g., `OBS ●`); WHEN space is insufficient, THE title bar SHALL display a collapsed `Status` label with a row of dots. Width measurement SHALL use `ResizeObserver` so the display mode updates automatically on orientation changes and layout shifts.
5. WHEN a user taps the connection indicators section (in either expanded or collapsed mode), THE System SHALL display a popover listing each connection by name with its status dot and the word `Healthy` or `Unhealthy`.

---

### Requirement 17: Reusable Confirmation Modal

**User Story:** As a developer, I want a shared confirmation modal component for destructive and significant actions, so that all confirmation dialogs in the system have consistent behavior and wording patterns.

#### Acceptance Criteria

1. THE System SHALL provide a reusable `ConfirmationModal` component accepting an optional title, an optional body (text string or React slot), confirm label, cancel label, confirm variant, and confirm/cancel callbacks.
2. WHEN `confirmVariant` is `"danger"`, THE confirm button SHALL be styled with `color-danger`; WHEN `confirmVariant` is `"primary"` or absent, THE confirm button SHALL be styled with `color-primary`.
3. TAPPING the confirm button SHALL invoke `onConfirm` and SHALL NOT invoke `onCancel`.
4. TAPPING the cancel button SHALL invoke `onCancel` and SHALL NOT invoke `onConfirm`.
5. THE `ConfirmationModal` SHALL be used for all confirmation dialogs in the system; no widget SHALL implement its own ad-hoc confirmation dialog.

---

### Requirement 18: Responsive Sizing and Layout System

**User Story:** As a developer, I want a consistent, viewport-adaptive sizing system, so that the dashboard looks and works correctly across the full range of supported tablet screen sizes without per-breakpoint overrides.

#### Acceptance Criteria

1. THE System SHALL set the root `font-size` on `html` using `clamp(12px, 1.5625vw, 24px)` so that all `rem`-based sizes scale proportionally with viewport width, with 1rem = 16px at the 1024px base viewport. This approach is safe with Ionic v4+ which does not override `html` font-size (unlike v3).
2. ALL element sizes (heights, widths, padding, gaps, font sizes, icon sizes, touch targets) SHALL be specified in `rem` units in component styles; pixel values SHALL NOT appear in component CSS or inline styles. Pixel values may appear only in documentation as illustrative examples.
3. Widget grid cells SHALL be sized as percentages of the available grid area so they always fill the viewport.
4. THE dashboard grid SHALL apply `--space-screen-edge` (1rem) outer padding, `--space-grid-gap` (0.75rem) between widgets, and `--space-widget-inner` (0.75rem) inside each `WidgetContainer`.
5. ALL interactive elements SHALL meet WCAG 2.5.5 touch target minimums: primary action buttons at minimum 2.75rem × 2.75rem; secondary/icon buttons at minimum 2.5rem × 2.5rem.
6. THE supported viewport range is 1024×768px to 1280×800px; the layout SHALL remain usable below this range (scaling down) and SHALL scale up proportionally above it.

---

### Requirement 19: Scripture Reference Lookup

**User Story:** As a volunteer, I want to look up a Bible book by name when entering the scripture reference, so that I can quickly find the correct book without memorizing exact spellings.

#### Acceptance Criteria

1. THE Frontend SHALL provide a text input for the scripture book field that performs a case-insensitive "contains" search against the 66 books of the KJV canon.
2. THE KJV bible database SHALL be the authoritative source for book names; book names SHALL use Roman numeral prefixes for numbered books (e.g., "I John", "II John", "III John", "I Kings", "II Kings") — Arabic numeral forms (e.g., "1 John") SHALL NOT be used.
3. WHEN a user types in the book input, THE Frontend SHALL display matching book names as selectable suggestions; typing "John" SHALL surface "John", "I John", "II John", and "III John" as candidates.
4. THE scripture chapter and verse fields SHALL be numeric inputs; the end verse field SHALL be optional.
5. THE Backend SHALL store scripture references using the numeric `bookId` (1–66, where Genesis = 1 and Revelation = 66), `chapter`, `verse`, and optional `verseEnd`. The frontend SHALL display the resolved book name from the `BIBLE_BOOKS` constant and SHALL send `bookId` (not the book name string) in all `ScriptureReference` payloads.
6. THE Frontend SHALL display the resolved book name (e.g., "John") rather than the numeric `bookId` in all user-facing contexts.
7. WHEN the `{Scripture}` token appears in the metadata template, THE Backend SHALL interpolate it as `<BookName> <Chapter>:<Verse>` for single verses (e.g., `"John 3:16"`) and `<BookName> <Chapter>:<Verse>-<EndVerse>` for ranges (e.g., `"John 3:16-17"`); IF the `scripture` field is absent, THE Backend SHALL substitute `[No Scripture]`.
8. THE Frontend SHALL validate that the entered book, chapter, and verse combination exists in the KJV database before allowing the form to be saved; IF the combination does not exist, THE Frontend SHALL display an inline validation error and SHALL NOT emit the `session:manifest:update` event. The end verse, if provided, SHALL also be validated to exist in the KJV database for the same book and chapter.
9. WHEN the end verse field loses focus, THE Frontend SHALL silently normalise invalid end verse relationships before validation: IF `verseEnd` equals `verse`, THE Frontend SHALL clear `verseEnd` (treating the reference as a single verse); IF `verseEnd` is less than `verse`, THE Frontend SHALL swap the two values so the smaller is `verse` and the larger is `verseEnd`. The volunteer SHALL see the field values update immediately on blur.

---

### Requirement 20: Text Input Clear Affordance

**User Story:** As a volunteer, I want to be able to quickly clear a text input field, so that I can correct a mistake without having to manually select and delete the existing text.

#### Acceptance Criteria

1. ALL text inputs in the system (session manifest fields, user management forms, device management forms) SHALL expose a clear affordance (e.g., Ionic `clearInput` property) that allows the user to tap an X button on the right side of the field to clear its contents.
2. THE clear affordance SHALL only be visible when the input has a non-empty value.

---

### Requirement 21: First-Time Setup Documentation and Error Messaging

**User Story:** As an administrator setting up the system for the first time, I want clear error messages and documented setup steps, so that I can get the system running without guessing the correct order of operations.

#### Acceptance Criteria

1. THE Backend SHALL log a clear, actionable error message if `DEVICE_SECRET_KEY` is not set at startup, including the command to generate a valid key.
2. THE Backend SHALL log a clear, actionable error message if the `dashboards` table is empty at startup, indicating that the seed script must be run before the system can be used.
3. THE system setup steps (environment variable configuration, seed script execution, first login) SHALL be documented in a `docs/setup.md` file included in the repository.
4. `docs/setup.md` SHALL document all admin-accessible routes (`/admin/users`, `/admin/devices`) so operators can navigate directly by URL.

---

### Requirement 22: Concurrent Command Non-Determinism (Design Decision)

**User Story:** As a system architect, I want the behavior of simultaneous conflicting commands from multiple clients to be explicitly documented, so that future developers understand this is a known design choice and not an unhandled bug.

#### Acceptance Criteria

1. WHEN two clients issue conflicting OBS commands simultaneously (e.g., one starts the stream while another stops it), THE Backend SHALL process them in the order they are received; the outcome is non-deterministic with respect to arrival order and this is an accepted design tradeoff.
2. THE second command in a conflicting pair will likely fail or produce an unexpected state; both clients will receive the reconciled state via the normal state broadcast.
3. This behavior SHALL be documented in the design document as an explicit architectural decision.

---

### Requirement 23: Tablet Network Loss Handling

**User Story:** As a volunteer, I want the dashboard to clearly indicate when my tablet has lost its connection to the system, so that I know my controls are not working and I am not left wondering why nothing is happening.

#### Acceptance Criteria

1. WHEN the frontend Socket.io connection drops (e.g., tablet Wi-Fi lost), THE Frontend SHALL display a persistent, non-dismissable Banner: "Connection lost — reconnecting…"
2. WHILE the Socket.io connection is dropped, THE Frontend SHALL disable all OBS command controls so the volunteer cannot issue commands that would be silently lost.
3. WHILE the Socket.io connection is dropped, THE `WidgetContainer` connection status indicator SHALL show the unhealthy (red) state, since the backend connection is lost and device state cannot be confirmed.
4. WHEN the Socket.io connection is restored, THE Backend SHALL emit the current state for all devices to the reconnected client; THE Frontend SHALL reconcile to the fresh state, dismiss the "Connection lost" Banner, and display a Toast: "Reconnected".
5. WHEN the Socket.io connection is restored, THE Frontend SHALL re-enable all controls.
6. THE Frontend SHALL rely on Socket.io's built-in reconnection — no manual "Retry Connection" button is shown for tablet network loss. The "Retry Connection" affordance is reserved exclusively for OBS reconnection exhaustion.

---

### Requirement 24: Unified Logging

**User Story:** As a developer or operator, I want a unified log of significant events from both the frontend and backend, so that I can trace what happened on both sides when diagnosing a failure.

#### Acceptance Criteria

1. THE Backend SHALL use **winston** with two simultaneous transports: structured JSON written to `logs/app.log` and human-readable output written to the console.
2. THE Backend SHALL create the `logs/` directory automatically on startup if it does not exist.
3. THE log file SHALL be capped at **20MB** using `winston-daily-rotate-file` with `maxSize: "20m"` and `maxFiles: 1`; when the cap is reached, the oldest content SHALL be trimmed automatically.
4. ALL log entries SHALL include: `timestamp` (ISO 8601, host-local), `level`, `source` (`"backend"` or `"frontend"`), and `message`. Entries triggered by a user action SHALL also include `userId`.
5. THE Backend SHALL expose a `POST /api/logs` endpoint (authenticated, JWT cookie required) that accepts a batch of frontend log entries and writes them to the same `logs/app.log` file via the backend logger, tagged with `"source": "frontend"`.
6. THE Frontend SHALL implement a logger wrapper with the same `debug / info / warn / error` interface that batches entries and forwards them to `POST /api/logs`.
7. IF a `POST /api/logs` request fails, THE Frontend SHALL buffer the entries in memory and retry up to **3 times**; IF all retries are exhausted, THE Frontend SHALL drop the buffered entries — frontend logging is best-effort and SHALL NOT block the UI or consume unbounded memory.
8. WHILE the Socket.io connection is down, THE Frontend SHALL continue to buffer log entries and flush them when the HTTP stack is available again.
9. THE `logs/` directory SHALL be gitignored.
10. THE `DEBUG` log level SHALL be disabled by default; it SHALL be enabled by setting `LOG_LEVEL=debug` in the environment. The default log floor in production is `INFO`.
11. Sensitive data (passwords, tokens, encryption keys) SHALL never appear in any log entry.
