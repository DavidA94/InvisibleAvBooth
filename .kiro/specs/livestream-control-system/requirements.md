# Requirements Document

## Introduction

The Modular Church Livestream Control System is a web-based, touch-first control interface for managing church livestream operations. It is designed for non-technical volunteers who may be stepping in with minimal context. The system is composed of modular widgets rendered on a responsive dashboard grid, each communicating exclusively through a Node.js backend abstraction layer. The backend is the single authority for all device state, commands, and session metadata. The initial release covers OBS control, camera PTZ control, audio mixer control (XR18), and text overlay management.

---

## Glossary

- **System**: The Modular Church Livestream Control System as a whole.
- **Backend**: The Node.js server that mediates all device communication, state management, and authentication.
- **Widget**: A modular UI component that displays device state and provides controls for a specific device or function.
- **Dashboard**: The responsive grid layout that hosts one or more Widgets.
- **HAL (Hardware Abstraction Layer)**: The backend service layer that encapsulates all device-specific communication logic.
- **Session_Manifest**: The volatile, in-memory metadata object maintained by the Backend containing Speaker Name, Sermon Title, Date, and Scripture Reference for the current service.
- **OBS_Service**: The HAL component responsible for all communication with OBS via obs-websocket.
- **Camera_Service**: The HAL component responsible for all PTZ camera communication.
- **Audio_Service**: The HAL component responsible for all XR18 mixer communication.
- **Overlay_Service**: The HAL component responsible for managing text overlay state and rendering.
- **Auth_Service**: The Backend component responsible for JWT issuance, validation, and RBAC enforcement.
- **Capabilities_Object**: A JSON structure provided by the Backend describing the supported features of each configured device.
- **ADMIN**: A user role with full system and user management access.
- **AV_Power_User**: A user role with full hardware control and advanced dashboard access.
- **AV_Volunteer**: A user role restricted to simplified, safety-first dashboards.
- **Grid_Manifest**: The persisted JSON structure describing a user's dashboard layout and widget placement.
- **Toast**: A short-lived (5-second) non-blocking notification.
- **Banner**: A persistent, dismissable warning or error notification displayed in the UI.
- **Modal**: A blocking notification requiring user acknowledgment, used for catastrophic errors.
- **Optimistic_Update**: A UI state change applied immediately before backend confirmation, later reconciled.
- **Commanded_State**: The last-known state issued by the Backend for a non-pollable device.

---

## Requirements

### Requirement 1: Backend as Single Communication Authority

**User Story:** As a system architect, I want all device communication to flow exclusively through the backend, so that state is consistent across all clients and no widget can issue conflicting commands.

#### Acceptance Criteria

1. THE Backend SHALL route all commands from Widgets to devices through the appropriate HAL service (OBS_Service, Camera_Service, Audio_Service, or Overlay_Service).
2. THE System SHALL NOT permit any Widget to communicate directly with a device; all interactions must pass through the Backend.
3. THE HAL SHALL expose a service interface per device type that encapsulates all device-specific protocol logic.
4. WHEN a Widget sends a command, THE Backend SHALL authenticate and authorize the command before forwarding it to the HAL.
5. IF a HAL service is unavailable, THEN THE Backend SHALL return an error response to the requesting Widget without forwarding the command.

---

### Requirement 2: Active Session Manifest

**User Story:** As a volunteer, I want session metadata (speaker, title, date, scripture) to be entered once and automatically propagate to all relevant outputs, so that I do not have to update multiple places manually.

#### Acceptance Criteria

1. THE Backend SHALL maintain a Session_Manifest containing Speaker Name, Sermon Title, Date, and Scripture Reference as a volatile in-memory object for the duration of a service session.
2. WHEN a client updates any field in the Session_Manifest, THE Backend SHALL validate the update and broadcast the updated Session_Manifest to all connected clients via WebSocket.
3. WHEN the Session_Manifest is updated, THE OBS_Service SHALL receive the updated values for use in metadata template interpolation.
4. WHEN the Session_Manifest is updated, THE Overlay_Service SHALL receive the updated values for use in lower-third and text overlay rendering.
5. THE Backend SHALL provide a REST endpoint to retrieve the current Session_Manifest.
6. IF the Backend restarts, THEN THE Backend SHALL initialize the Session_Manifest to empty string values for all fields.

---

### Requirement 3: Capabilities Discovery

**User Story:** As a widget developer, I want the backend to expose a capabilities object per device, so that widgets can dynamically disable or hide controls that the connected hardware does not support.

#### Acceptance Criteria

1. THE Backend SHALL provide a Capabilities_Object for each configured device upon client connection via WebSocket.
2. THE Capabilities_Object SHALL enumerate the supported features of the device using a defined, consistent JSON schema.
3. WHEN a Widget receives a Capabilities_Object, THE Widget SHALL disable or hide controls for features not listed as supported.
4. WHEN a device's capabilities change (e.g., reconnection with different firmware), THE Backend SHALL broadcast an updated Capabilities_Object to all connected clients.

---

### Requirement 4: Real-Time State Synchronization via WebSocket

**User Story:** As a volunteer, I want all widgets to reflect the current device state in real time, so that I always know what is actually happening without refreshing the page.

#### Acceptance Criteria

1. THE Backend SHALL use Socket.io to broadcast device state changes to all connected clients.
2. WHEN a device state changes (via polling or command confirmation), THE Backend SHALL emit a state update event to all subscribed clients within 500ms of detecting the change.
3. WHEN a client connects, THE Backend SHALL emit the current known state for all devices to that client.
4. WHILE a pollable device is connected, THE Backend SHALL poll the device at a configured interval and reconcile any differences between polled state and Commanded_State.
5. WHEN a manual adjustment is detected on a pollable device (e.g., a physical fader moved on the XR18), THE Backend SHALL update its internal state and broadcast the reconciled state to all clients.
6. FOR non-pollable devices, THE Backend SHALL maintain and broadcast the Commanded_State as the authoritative state.

---

### Requirement 5: Responsive Dashboard Grid

**User Story:** As a volunteer, I want the dashboard to adapt to my tablet's orientation, so that I can use the system comfortably in both landscape and portrait mode.

#### Acceptance Criteria

1. THE Dashboard SHALL render a 5-column by 3-row grid when the viewport is in landscape orientation.
2. THE Dashboard SHALL render a 3-column by 5-row grid when the viewport is in portrait orientation.
3. THE Dashboard SHALL reflow Widget placement automatically when orientation changes.
4. EACH Widget SHALL declare a footprint (e.g., 1x1, 2x1, 2x2) that determines the grid cells it occupies.
5. THE Dashboard SHALL be optimized for touch interaction on tablet-sized screens.
6. THE System SHALL store the user's selected dashboard layout in browser Local Storage.
7. WHEN a user logs in, THE Dashboard SHALL restore the previously saved Grid_Manifest from Local Storage if one exists.

---

### Requirement 6: Authentication and JWT-Based Access Control

**User Story:** As an administrator, I want the system to require login with role-based access, so that volunteers only see controls appropriate for their skill level and cannot accidentally access advanced or dangerous settings.

#### Acceptance Criteria

1. THE Auth_Service SHALL require users to authenticate with a username and hashed password via a REST login endpoint before accessing any dashboard or device control.
2. WHEN a user successfully authenticates, THE Auth_Service SHALL issue a signed JWT containing the user's role (ADMIN, AV_Power_User, or AV_Volunteer).
3. THE Backend SHALL validate the JWT on every REST request and WebSocket connection.
4. IF a JWT is invalid or expired, THEN THE Backend SHALL reject the request with a 401 Unauthorized response.
5. THE System SHALL support local hosting with self-signed HTTPS or HTTP fallback.
6. THE Auth_Service SHALL store passwords using a cryptographic hashing algorithm (bcrypt or equivalent).

---

### Requirement 7: Role-Based Access Control (RBAC)

**User Story:** As an administrator, I want user roles to determine which widgets and dashboards are accessible, so that volunteers cannot accidentally trigger advanced or destructive operations.

#### Acceptance Criteria

1. THE Backend SHALL enforce RBAC such that ADMIN users have access to all system management, user management, and hardware control features.
2. THE Backend SHALL enforce RBAC such that AV_Power_User accounts have access to all hardware control widgets and advanced dashboard configurations.
3. THE Backend SHALL enforce RBAC such that AV_Volunteer accounts have access only to simplified, safety-first dashboards and widgets designated for volunteer use.
4. WHEN a client requests a dashboard or widget, THE Backend SHALL verify the user's role and return only the resources permitted for that role.
5. IF a user attempts to access a resource outside their role's permissions, THEN THE Backend SHALL return a 403 Forbidden response.
6. THE Dashboard SHALL render only the widgets and controls permitted by the authenticated user's role.

---

### Requirement 8: OBS Widget — Stream and Recording Control

**User Story:** As a volunteer, I want a simple widget to start and stop the stream and recording in OBS, so that I can manage the broadcast without needing to open OBS directly.

#### Acceptance Criteria

1. THE OBS_Service SHALL connect to OBS via obs-websocket using statically configured connection parameters.
2. WHEN a user triggers "Start Stream," THE Backend SHALL first update OBS stream metadata using the current Session_Manifest, confirm success, and then command OBS to start streaming.
3. WHEN a user triggers "Stop Stream," THE Backend SHALL command OBS to stop streaming and confirm the stopped state before updating the Widget.
4. WHEN a user triggers "Start Recording" or "Stop Recording," THE Backend SHALL command OBS accordingly and confirm the state change before updating the Widget.
5. WHILE a stream start or stop command is in progress, THE OBS Widget SHALL display a pending state indicator until the Backend confirms the outcome.
6. IF OBS is unreachable, THEN THE Backend SHALL emit an error event and THE OBS Widget SHALL display a catastrophic error Modal to the user.
7. IF a stream start command fails after metadata update, THEN THE Backend SHALL report the failure and THE OBS Widget SHALL display the failure without leaving the stream in an ambiguous state.

---

### Requirement 9: OBS Metadata Template Engine

**User Story:** As a volunteer, I want to see a live preview of the stream title before going live, so that I can confirm the metadata is correct before the stream starts.

#### Acceptance Criteria

1. THE Backend SHALL maintain a configurable metadata template string (e.g., `{Date} – {Speaker} – {Title}`) for OBS stream metadata.
2. WHEN the Session_Manifest is updated, THE Backend SHALL interpolate the template string with the current Session_Manifest values and emit the result to all connected clients.
3. THE OBS Widget SHALL display the interpolated metadata string in a Preview Field before the stream is started.
4. THE Backend SHALL perform all template interpolation; no interpolation logic shall exist in the Widget.
5. IF a Session_Manifest field referenced in the template is empty, THEN THE Backend SHALL substitute a visible placeholder (e.g., `[No Title]`) in the interpolated output.

---

### Requirement 10: Camera PTZ Widget

**User Story:** As a volunteer, I want to control camera pan, tilt, and zoom and recall presets from a widget, so that I can frame shots without leaving the control dashboard.

#### Acceptance Criteria

1. THE Camera_Service SHALL communicate with configured PTZ cameras using the camera's native protocol over the static network configuration.
2. THE Camera Widget SHALL provide controls for pan, tilt, and zoom that send commands through the Camera_Service.
3. THE Camera Widget SHALL display a list of configured presets and allow the user to recall a preset with a single tap.
4. WHEN a preset is recalled, THE Camera_Service SHALL send the preset recall command to the camera and confirm execution.
5. WHEN a PTZ command times out without confirmation, THE Backend SHALL emit a warning event and THE Camera Widget SHALL display a Banner notification.
6. THE Camera Widget SHALL disable or hide controls for PTZ axes not listed as supported in the device's Capabilities_Object.

---

### Requirement 11: Audio Mixer Widget (XR18)

**User Story:** As a volunteer, I want to control channel volumes and mute states on the XR18 mixer from a widget, so that I can manage audio without touching the physical board.

#### Acceptance Criteria

1. THE Audio_Service SHALL communicate with the XR18 mixer using the OSC protocol over the static network configuration.
2. THE Audio Widget SHALL display the current fader level and mute state for each configured channel.
3. WHEN a user adjusts a fader or toggles mute in the Audio Widget, THE Audio_Service SHALL send the command to the XR18 and apply an Optimistic_Update to the Widget state.
4. WHEN the Audio_Service polls the XR18 and detects a fader or mute state that differs from the Commanded_State (e.g., a physical fader was moved), THE Backend SHALL update its internal state and broadcast the reconciled state to all clients.
5. THE Audio Widget SHALL make the mute state of each channel clearly visible at all times.
6. IF the XR18 is unreachable, THEN THE Backend SHALL emit an error event and THE Audio Widget SHALL display a persistent Banner notification.
7. THE Audio Widget SHALL visually distinguish channels that are muted from channels that are active to prevent silent audio failures.

---

### Requirement 12: Text Overlay Widget

**User Story:** As a volunteer, I want to control lower-thirds, speaker names, Bible verses, and lyrics from a widget, so that I can manage on-screen text without a separate application.

#### Acceptance Criteria

1. THE Overlay_Service SHALL manage the state of all text overlays and communicate changes to the rendering target (e.g., OBS browser source or equivalent).
2. THE Text Overlay Widget SHALL allow the user to enter and display lower-third text, speaker name, Bible verse, and lyrics overlays.
3. WHEN a user activates an overlay, THE Overlay_Service SHALL send the overlay content and display command to the rendering target.
4. WHEN a user deactivates an overlay, THE Overlay_Service SHALL send a hide command to the rendering target.
5. WHEN the Session_Manifest is updated, THE Overlay_Service SHALL automatically update any active overlays that reference Session_Manifest fields.
6. IF the rendering target is unreachable, THEN THE Backend SHALL emit an error event and THE Text Overlay Widget SHALL display a Banner notification.

---

### Requirement 13: Error Notification System

**User Story:** As a volunteer, I want clear, appropriately-urgent notifications when something goes wrong, so that I can quickly identify and respond to problems without being overwhelmed.

#### Acceptance Criteria

1. THE System SHALL display a Toast notification for non-critical informational events; each Toast SHALL auto-dismiss after 5 seconds.
2. THE System SHALL display a persistent Banner notification for device warnings and recoverable errors; Banners SHALL remain visible until dismissed by the user or auto-cleared by the Backend when the condition resolves.
3. WHEN multiple Banner notifications are active, THE Dashboard SHALL display them with a counter (e.g., "Error 1 of 3") and allow the user to navigate between them.
4. THE System SHALL display a Modal notification for catastrophic errors (e.g., OBS disconnect during a live stream); the Modal SHALL require user acknowledgment or be auto-cleared by the Backend when the condition resolves.
5. WHEN a device error resolves automatically, THE Backend SHALL emit a resolution event and THE System SHALL dismiss the associated Banner or Modal and display a Toast confirming resolution.
6. THE System SHALL NOT display a Modal for non-catastrophic errors that do not block continued operation.

---

### Requirement 14: Optimistic UI Updates and State Reconciliation

**User Story:** As a volunteer, I want controls to feel responsive immediately, so that the interface does not feel sluggish during live operation.

#### Acceptance Criteria

1. THE Widget SHALL apply an Optimistic_Update to its local display state immediately when a user issues a command, before receiving Backend confirmation.
2. WHEN the Backend confirms a command, THE Widget SHALL reconcile its display state with the confirmed Backend state.
3. IF the Backend returns an error for a command, THEN THE Widget SHALL revert the Optimistic_Update and display an appropriate notification.
4. WHILE a boolean operation (e.g., Start Stream, Stop Recording) is pending Backend confirmation, THE Widget SHALL display a pending state indicator and disable the triggering control.
5. THE Backend SHALL be the final authority on device state; any discrepancy between Widget display state and Backend state SHALL be resolved in favor of the Backend state.

---

### Requirement 15: Extensibility — New Widget and Device Support

**User Story:** As a developer, I want to add new device types and widgets without modifying existing system components, so that the system can grow without requiring rewrites.

#### Acceptance Criteria

1. THE System SHALL support the addition of new HAL services for new device types without requiring changes to existing HAL services or the Widget framework.
2. THE System SHALL support the addition of new Widgets without requiring changes to the Dashboard grid framework or existing Widgets.
3. THE Backend SHALL expose a consistent service registration interface that new HAL services implement to integrate with the state broadcast and error reporting system.
4. THE Dashboard SHALL render new Widgets based on their declared footprint and role permissions without requiring Dashboard-level code changes.
