# Requirements Document — Multi-Platform Streaming

## Introduction

This spec extends Invisible A/V Booth with the ability to stream simultaneously to multiple platforms (YouTube and Facebook) from a single OBS source. It introduces platform-specific API integrations for broadcast lifecycle management (create, go live, end), a configurable metadata template system with multiple named templates for titles and descriptions, an RTMP relay layer for fan-out delivery, and a "Manage Streams" UI for per-platform stream control during a live session.

This spec depends on the foundational platform delivered by the `livestream-control-system` spec (authentication, dashboard, OBS widget, session manifest, event bus, notification system). It modifies the existing OBS streaming flow and extends the session manifest with new template capabilities.

See `docs/architecture-decisions/001-multi-platform-streaming.md` for the architectural decision record on the hybrid relay approach.

---

## Glossary

- **Platform**: A streaming destination service (e.g., YouTube, Facebook). Each platform has its own API integration, OAuth credentials, and RTMP ingest URL.
- **PlatformConfig**: The stored configuration for a streaming platform, including OAuth tokens (encrypted), platform-specific settings, and enabled status. Stored in a new `streaming_platforms` database table.
- **Broadcast**: A platform-specific live video object created via the platform's API before streaming begins. YouTube calls this a `liveBroadcast` + `liveStream`; Facebook calls it a `LiveVideo`. The backend abstracts both behind a common interface.
- **RTMP Relay**: A local `node-media-server` instance that accepts OBS's RTMP stream and makes it available for per-destination FFmpeg forwarding processes.
- **Relay Forwarder**: An individual FFmpeg child process that reads from the local RTMP relay and forwards the stream (via `-c copy`, no re-encoding) to a single platform's RTMP ingest URL.
- **MetadataTemplate**: A named, admin-configured format string used to generate stream titles or descriptions. Contains placeholder tokens (e.g., `{Speaker}`, `{Title}`, `{Scripture}`, `{verseText}`) that are interpolated with SessionManifest values at stream start time.
- **TemplateCategory**: Either `title` or `description`. Title templates and description templates are independent — a user selects one of each (description may be "None").
- **ManageStreamsModal**: The modal UI that replaces the simple Start/Stop Stream buttons, allowing per-platform stream control during a live session.

---

## Requirements

### Requirement 1: Streaming Platform Configuration

**User Story:** As an administrator, I want to configure streaming platform connections (YouTube, Facebook) through the admin UI, so that the system can create broadcasts and stream to those platforms without manual setup each time.

#### Acceptance Criteria

1. THE Backend SHALL store streaming platform configurations in a `streaming_platforms` database table with fields: `id`, `platformType` (e.g., `"youtube"`, `"facebook"`), `label`, `enabled`, `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiresAt`, `platformMetadata` (JSON string for platform-specific data such as YouTube channel ID or Facebook page ID), and `createdAt`.
2. THE Backend SHALL encrypt OAuth tokens at rest using the same AES-256-GCM pattern and `DEVICE_SECRET_KEY` used for device connection passwords.
3. THE Backend SHALL expose REST endpoints for reading, updating, enabling/disabling, and deleting streaming platform configurations; all endpoints SHALL require the ADMIN role.
4. THE Frontend SHALL provide admin pages for streaming platform configuration at `/admin/platforms/youtube` and `/admin/platforms/facebook`; each page SHALL be a separate file (modular per platform) so that adding or removing platform support does not require modifying other platform pages.
5. EACH platform admin page SHALL include a "Connect" button that initiates the OAuth 2.0 authorization flow for that platform, redirecting the admin to the platform's consent screen and handling the callback to store the resulting tokens.
6. WHEN a platform is connected, THE admin page SHALL display the connected account name (YouTube channel name or Facebook page name) and a "Disconnect" button that revokes and removes the stored tokens.
7. THE Backend SHALL validate stored OAuth tokens on startup by making a lightweight API call to each enabled platform; IF a token is invalid or expired and cannot be refreshed, THE Backend SHALL emit a Banner-level notification: "{Platform} authorization expired — an admin needs to reconnect."

---

### Requirement 2: OAuth Token Lifecycle

**User Story:** As a system operator, I want OAuth tokens to refresh automatically without any manual intervention, so that streaming works reliably every week without an admin needing to re-authorize before each service.

#### Acceptance Criteria

1. FOR YouTube, THE Backend SHALL store the OAuth 2.0 refresh token and use it to silently obtain new access tokens when the current access token expires (typically 1 hour); this refresh SHALL require no user interaction.
2. FOR Facebook, THE Backend SHALL obtain a long-lived Page access token during the initial OAuth flow; this token does not expire under normal conditions and requires no refresh cycle.
3. WHEN a token refresh fails (e.g., user revoked access, Google Cloud project suspended), THE Backend SHALL mark the platform as unhealthy, emit a Banner-level notification identifying the affected platform, and exclude that platform from the stream start flow until an admin reconnects.
4. THE Backend SHALL attempt token refresh proactively (before expiry) rather than waiting for an API call to fail; for YouTube, THE Backend SHALL refresh the access token when it is within 5 minutes of expiry.
5. THE Backend SHALL NOT store plaintext tokens in logs, error messages, or API responses.

---

### Requirement 3: Named Metadata Templates

**User Story:** As an administrator, I want to create multiple named title and description templates, so that volunteers can choose the appropriate format for different types of services (e.g., with or without a scripture reference).

#### Acceptance Criteria

1. THE Backend SHALL store metadata templates in a `metadata_templates` database table with fields: `id`, `name` (admin-provided display name, e.g., "Speaker and Title"), `category` (`"title"` or `"description"`), `formatString` (the template with placeholder tokens), and `createdAt`.
2. THE Backend SHALL support the following placeholder tokens in templates: `{Date}`, `{Speaker}`, `{Title}`, `{Scripture}`, `{verseText}`. `{Date}` is always today's ISO 8601 date. `{Scripture}` resolves to the formatted reference (e.g., "John 3:16-17"). `{verseText}` resolves to the full KJV text of the referenced verse(s).
3. THE Backend SHALL expose REST endpoints for creating, reading, updating, and deleting metadata templates; all endpoints SHALL require the ADMIN role.
4. THE Frontend SHALL provide a template management section within the admin streaming configuration (route TBD) where an ADMIN can create, edit, and delete templates, specifying a name, category, and format string.
5. WHEN interpolating `{verseText}`, THE Backend SHALL query the KJV database for all verses in the referenced range (bookId, chapter, verse through verseEnd) and concatenate their text with a single space between verses.
6. IF a template contains `{verseText}` or `{Scripture}` and the SessionManifest has no scripture reference, THE Backend SHALL substitute `[No Scripture]` for `{Scripture}` and `[No Verse Text]` for `{verseText}`.
7. AT LEAST one title template SHALL exist in the system; THE Backend SHALL reject deletion of the last remaining title template.

---

### Requirement 4: Template Selection and Unified Field Collection

**User Story:** As a volunteer, I want to select a title template and an optional description template before entering metadata, so that I only see the input fields that are actually needed for my chosen templates.

#### Acceptance Criteria

1. THE Frontend SHALL present two side-by-side dropdowns (stacked on narrow viewports) for template selection: one for title templates and one for description templates. The description dropdown SHALL include a "None" option.
2. UNTIL both dropdowns have a selection (title is required; description may be "None"), THE Frontend SHALL NOT display metadata input fields; instead, THE Frontend SHALL display a semi-transparent message: "Choose templates".
3. AFTER both templates are selected, THE Frontend SHALL compute the union of all unique placeholder tokens across both selected templates and present one input field per unique token. If both the title and description templates reference `{Title}`, the user sees one Title input — not two.
4. `{Scripture}` and `{verseText}` SHALL share a single scripture reference input. If either token appears in any selected template, the scripture reference picker SHALL be shown exactly once.
5. `{Date}` SHALL NOT produce an input field — it is always auto-populated by the backend.
6. WHEN the user switches between templates, THE Frontend SHALL preserve all previously entered field values. Switching from a template that uses `{Scripture}` to one that does not SHALL NOT clear the scripture reference — it remains available if the user switches back.
7. THE Frontend SHALL disable the Save button until all required fields for the selected templates have values. A field is required if its corresponding token appears in either selected template (excluding `{Date}`).

---

### Requirement 5: RTMP Relay Infrastructure

**User Story:** As a system architect, I want a local RTMP relay that accepts OBS's stream and fans it out to multiple destinations independently, so that one platform's failure does not affect others.

#### Acceptance Criteria

1. THE Backend SHALL manage a `node-media-server` instance as the local RTMP relay, listening on a configurable port (default: `1935`, configurable via `RELAY_PORT` environment variable).
2. THE relay SHALL accept exactly one inbound RTMP stream from OBS at the path `/live/stream`.
3. THE Backend SHALL spawn one FFmpeg child process per active streaming destination; each process SHALL read from the local relay and forward to the platform's RTMP ingest URL using `-c copy` (no re-encoding).
4. WHEN a single FFmpeg forwarder process exits unexpectedly, THE Backend SHALL NOT terminate other active forwarders; THE Backend SHALL emit a Banner-level notification identifying the affected platform and allow the user to restart that platform's stream independently.
5. THE Backend SHALL configure OBS (via `obs-websocket` `SetStreamServiceSettings`) to stream to `rtmp://localhost:{RELAY_PORT}/live/stream` before starting the OBS stream.
6. IF the relay process crashes, THE Backend SHALL detect the failure, attempt to restart the relay, and emit a Banner-level notification. OBS's built-in reconnect logic will re-establish the connection to the relay once it is back.
7. FFmpeg SHALL be a documented prerequisite in `docs/setup.md`; THE Backend SHALL verify FFmpeg is available on the system PATH at startup and log a clear error if it is not found.

---

### Requirement 6: Multi-Platform Stream Start Flow

**User Story:** As a volunteer, I want to select which platforms to stream to when starting a stream, so that I can broadcast to YouTube and Facebook simultaneously with a single action.

#### Acceptance Criteria

1. WHEN the user taps "Manage Streams" (replacing the previous "Start Stream" button), THE Frontend SHALL open the ManageStreamsModal.
2. IF no platforms are configured and enabled, THE ManageStreamsModal SHALL display a message: "No streaming platforms configured. Contact an administrator."
3. THE ManageStreamsModal SHALL list all configured and enabled platforms with their current status (Idle, Starting, Streaming, Stopping, Error) and available actions.
4. WHEN the user initiates "Start All" or starts an individual platform, THE Backend SHALL execute the following sequence per platform: (a) create the broadcast via the platform's API with the interpolated title and description, (b) obtain the RTMP ingest URL, (c) ensure the RTMP relay is running, (d) ensure OBS is streaming to the relay, (e) spawn an FFmpeg forwarder process for that platform, (f) transition the platform broadcast to live status.
5. IF a platform broadcast creation fails, THE Backend SHALL skip that platform, continue with remaining platforms, and emit a Banner-level notification identifying the failed platform and the reason.
6. THE "Start All" button SHALL be disabled (greyed out) when all configured platforms are already streaming.
7. BEFORE starting any platform stream, THE Frontend SHALL display a ConfirmationModal: "Start streaming to {platform list}?" with confirm label "Go Live" and cancel label "Cancel".
8. THE "Manage Streams" button SHALL be disabled unless the SessionManifest contains at least the fields required by the selected templates; THE button SHALL display a sub-label "Enter metadata" when disabled due to missing metadata.

---

### Requirement 7: Per-Platform Stream Management

**User Story:** As a volunteer, I want to stop or restart individual platform streams without affecting others, so that I can recover from a single platform failure without disrupting the entire broadcast.

#### Acceptance Criteria

1. THE ManageStreamsModal SHALL display each platform as a row with: platform name, current status, and action button(s).
2. FOR a platform with status "Streaming", THE action SHALL be "Stop Stream"; tapping it SHALL display a ConfirmationModal: "Stop streaming to {platform}?" before proceeding.
3. FOR a platform with status "Idle" or "Error", THE action SHALL be "Start Stream"; tapping it SHALL initiate the platform start sequence for that single platform.
4. WHEN a platform stream is stopped, THE Backend SHALL: (a) terminate the FFmpeg forwarder process for that platform, (b) end the broadcast via the platform's API (YouTube: transition to `complete`; Facebook: end the live video), (c) update the platform status to "Idle".
5. THE "Stop All" button SHALL be disabled (greyed out) when no platforms are currently streaming.
6. THE "Stop All" action SHALL display a ConfirmationModal: "Stop all streams?" before proceeding.
7. WHEN all platform streams are stopped and OBS is still streaming to the relay, THE Backend SHALL stop the OBS stream (since there are no destinations) and update the OBS state accordingly.

---

### Requirement 8: Stream Health Monitoring

**User Story:** As a volunteer, I want to see the health status of each active stream, so that I can identify and respond to quality issues before they become visible to viewers.

#### Acceptance Criteria

1. WHILE a platform stream is active, THE Backend SHALL poll the platform's API at a regular interval (configurable, default: 30 seconds) to retrieve stream health information.
2. FOR YouTube, THE Backend SHALL retrieve the `liveStream` resource's `status.healthStatus` field, which includes stream health indicators (good, ok, bad, noData).
3. FOR Facebook, THE Backend SHALL retrieve the `LiveVideo` resource's `status` and `ingest_streams` fields for health information.
4. THE Backend SHALL broadcast stream health updates to all connected clients via Socket.io.
5. THE ManageStreamsModal SHALL display a health indicator alongside each streaming platform's status (e.g., "Streaming (Good)", "Streaming (Poor)").
6. IF a platform's stream health degrades to a critical level, THE Backend SHALL emit a Banner-level notification: "{Platform} stream quality is poor."

---

### Requirement 9: Verse Text Interpolation

**User Story:** As a volunteer, I want the stream description to include the full text of the referenced Bible verses, so that viewers can read along without needing their own Bible.

#### Acceptance Criteria

1. WHEN a template contains the `{verseText}` token, THE Backend SHALL query the `kjv` table for all verses matching the current SessionManifest's scripture reference (bookId, chapter, verse through verseEnd inclusive).
2. THE Backend SHALL concatenate the verse texts with a single space separator, preserving the database order (by VERSENO).
3. IF the scripture reference is a single verse (no verseEnd), THE Backend SHALL return that single verse's text.
4. IF no scripture reference is set in the SessionManifest, THE Backend SHALL substitute `[No Verse Text]` for the `{verseText}` token.
5. THE `{verseText}` token and the `{Scripture}` token SHALL share the same scripture reference input — if either appears in any selected template, the scripture reference picker is shown once, and the single reference is used for both tokens.

---

### Requirement 10: Platform Admin Page Modularity

**User Story:** As a developer, I want each streaming platform's admin configuration page to be a separate, self-contained module, so that adding support for a new platform (e.g., Twitch) requires creating a new file without modifying existing platform pages.

#### Acceptance Criteria

1. EACH streaming platform's admin page SHALL be implemented as a separate file (e.g., `YouTubePlatformConfig.tsx`, `FacebookPlatformConfig.tsx`).
2. THE platform admin pages SHALL be registered via a platform registry pattern so that adding a new platform requires: (a) creating a new page component file, (b) adding an entry to the registry. No existing platform files are modified.
3. EACH platform admin page SHALL handle its own OAuth flow, display its own configuration fields, and manage its own connection status independently.
4. THE Backend SHALL use a similar modular pattern for platform API integrations — each platform's API client is a separate module implementing a common `StreamingPlatformClient` interface.
