# Requirements Document — Multi-Platform Streaming

## Introduction

This spec extends Invisible A/V Booth with the ability to stream simultaneously to multiple platforms (YouTube and Facebook) from a single OBS source. It introduces platform-specific API integrations for broadcast lifecycle management (create, go live, end), a configurable metadata template system with multiple named templates for titles and descriptions, an RTMP relay layer for fan-out delivery, and a "Manage Streams" UI for per-platform stream control during a live session.

This spec depends on the foundational platform delivered by the `livestream-control-system` spec (authentication, dashboard, OBS widget, session manifest, event bus, notification system). It modifies the existing OBS streaming flow and extends the session manifest with new template capabilities.

This spec supersedes the single `streamTitleTemplate` field stored in `device_connections.metadata` (original spec Requirement 9). That field is replaced by the `metadata_templates` table. The existing `SessionManifestService.interpolate()` method is reworked to support multiple templates and the new `{verseText}` token. This spec also modifies the post-login navigation for ADMIN users (original spec Requirement 5.3): ADMIN users are redirected to the new Admin Index Page (`/admin`) instead of the Dashboard Selection Screen.

Recording controls (Start/Stop Recording) remain unchanged in the OBS widget and are unaffected by this spec. The "Manage Streams" button coexists alongside the existing recording button.

See `docs/architecture-decisions/001-multi-platform-streaming.md` for the architectural decision record on the hybrid relay approach.

---

## Glossary

- **Platform**: A streaming destination service (e.g., YouTube, Facebook). Each platform has its own API integration, OAuth credentials, and RTMP ingest URL.
- **PlatformConfig**: The stored configuration for a streaming platform, including OAuth tokens (encrypted), platform-specific settings, and enabled status. Stored in a new `streaming_platforms` database table.
- **Broadcast**: A platform-specific live video object created via the platform's API before streaming begins. YouTube calls this a `liveBroadcast` + `liveStream`; Facebook calls it a `LiveVideo`. The backend abstracts both behind a common interface.
- **RTMP Relay**: A local `node-media-server` instance that accepts OBS's RTMP stream and makes it available for per-destination FFmpeg forwarding processes. Starts on backend startup and runs for the lifetime of the backend process.
- **Relay Forwarder**: An individual FFmpeg child process that reads from the local RTMP relay and forwards the stream (via `-c copy`, no re-encoding) to a single platform's RTMP ingest URL.
- **MetadataTemplate**: A named, admin-configured format string used to generate stream titles or descriptions. Contains placeholder tokens (e.g., `{Speaker}`, `{Title}`, `{Scripture}`, `{verseText}`) that are interpolated with SessionManifest values at stream start time.
- **TemplateCategory**: Either `title` or `description`. Title templates and description templates are independent — a user selects one of each (description may be "None").
- **ManageStreamsModal**: The modal UI that replaces the simple Start/Stop Stream buttons, allowing per-platform stream control during a live session.
- **AdminIndexPage**: The landing page for ADMIN users at `/admin`, listing links to all admin management sections and the dashboard chooser.

---

## Requirements

### Requirement 1: Streaming Platform Configuration

**User Story:** As an administrator, I want to configure streaming platform connections (YouTube, Facebook) through the admin UI, so that the system can create broadcasts and stream to those platforms without manual setup each time.

#### Acceptance Criteria

1. THE Backend SHALL store streaming platform configurations in a `streaming_platforms` database table with fields: `id`, `platformType` (e.g., `"youtube"`, `"facebook"`), `label`, `enabled`, `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiresAt`, `platformMetadata` (JSON string for platform-specific data such as YouTube channel ID or Facebook page ID), and `createdAt`. THE `platformType` field SHALL have a unique constraint — only one configuration per platform type is allowed.
2. THE Backend SHALL encrypt OAuth tokens at rest using the same AES-256-GCM pattern and `DEVICE_SECRET_KEY` used for device connection passwords.
3. THE Backend SHALL expose REST endpoints for reading, updating, enabling/disabling, and deleting streaming platform configurations; all endpoints SHALL require the ADMIN role.
4. THE Frontend SHALL provide admin pages for streaming platform configuration at `/admin/platforms/youtube` and `/admin/platforms/facebook`; each page SHALL be a separate file (modular per platform) so that adding or removing platform support does not require modifying other platform pages.
5. EACH platform admin page SHALL include a "Connect" button that initiates the OAuth 2.0 authorization flow for that platform, redirecting the admin to the platform's consent screen and handling the callback to store the resulting tokens.
6. WHEN a platform is connected, THE admin page SHALL display the connected account name (YouTube channel name or Facebook page name) and a "Disconnect" button that revokes and removes the stored tokens. FOR Facebook, after OAuth connection, THE Backend SHALL fetch the list of Pages the admin manages; THE admin page SHALL display a Page selector dropdown so the admin can choose which Page to stream to. The selected Page ID SHALL be stored in `platformMetadata`. IF the admin manages only one Page, it SHALL be auto-selected.
7. THE Backend SHALL validate stored OAuth tokens on startup by making a lightweight API call to each enabled platform; IF a token is invalid or expired and cannot be refreshed, THE Backend SHALL emit a Banner-level notification: "{Platform} authorization expired — an admin needs to reconnect."
8. THE Backend SHALL expose OAuth callback endpoints (`GET /api/auth/callback/youtube` and `GET /api/auth/callback/facebook`) that receive the authorization code from the platform, exchange it for access and refresh tokens, encrypt and store the tokens in the `streaming_platforms` table, and redirect back to the corresponding admin platform page with a success or failure query parameter.
9. FOR YouTube, THE admin page SHALL include a "Privacy" setting with options: `public` (default), `unlisted`, and `private`. This value SHALL be stored in `platformMetadata` and used when creating broadcasts (Req 6.4). Facebook Page live videos are inherently public and do not support privacy settings.
10. THE ManageStreamsModal SHALL display the YouTube privacy setting alongside the platform name (e.g., "YouTube (Unlisted)") so the volunteer can see at a glance whether the broadcast will be public. This is display-only — the volunteer cannot change it; only an admin can modify the privacy setting.

---

### Requirement 2: OAuth Token Lifecycle and Prerequisites

**User Story:** As a system operator, I want OAuth tokens to refresh automatically without any manual intervention, so that streaming works reliably every week without an admin needing to re-authorize before each service.

#### Acceptance Criteria

1. FOR YouTube, THE Backend SHALL store the OAuth 2.0 refresh token and use it to silently obtain new access tokens when the current access token expires (typically 1 hour); this refresh SHALL require no user interaction.
2. FOR Facebook, THE Backend SHALL obtain a long-lived Page access token during the initial OAuth flow; this token does not expire under normal conditions and requires no refresh cycle.
3. WHEN a token refresh fails (e.g., user revoked access, Google Cloud project suspended), THE Backend SHALL mark the platform as unhealthy, emit a Banner-level notification identifying the affected platform, and exclude that platform from the stream start flow until an admin reconnects.
4. THE Backend SHALL attempt token refresh proactively (before expiry) rather than waiting for an API call to fail; for YouTube, THE Backend SHALL refresh the access token when it is within 5 minutes of expiry.
5. THE Backend SHALL NOT store plaintext tokens in logs, error messages, or API responses.
6. THE Backend SHALL require the following environment variables for OAuth: `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`. IF any are missing at startup and the corresponding platform is enabled, THE Backend SHALL log a clear error identifying the missing variable(s). These values come from the Google Cloud Console and Facebook Developer portal respectively.
7. `docs/setup.md` SHALL document the external prerequisites for each platform: (a) YouTube: create a Google Cloud project, enable the YouTube Data API v3, create OAuth 2.0 credentials (Web application type), and configure the authorized redirect URI to `{APP_URL}/api/auth/callback/youtube`. (b) Facebook: create a Facebook App, add the Live Video API product, and configure the Valid OAuth Redirect URI to `{APP_URL}/api/auth/callback/facebook`.

---

### Requirement 3: Named Metadata Templates

**User Story:** As an administrator, I want to create multiple named title and description templates, so that volunteers can choose the appropriate format for different types of services (e.g., with or without a scripture reference).

#### Acceptance Criteria

1. THE Backend SHALL store metadata templates in a `metadata_templates` database table with fields: `id`, `name` (admin-provided display name, e.g., "Speaker and Title"), `category` (`"title"` or `"description"`), `formatString` (the template with placeholder tokens), and `createdAt`.
2. THE Backend SHALL support the following placeholder tokens in templates: `{Date}`, `{Speaker}`, `{Title}`, `{Scripture}`, `{verseText}`. `{Date}` is always today's ISO 8601 date. `{Scripture}` resolves to the formatted reference (e.g., "John 3:16-17"). `{verseText}` resolves to the full KJV text of the referenced verse(s), formatted per Requirement 9.
3. WHEN formatting the `{Scripture}` token, IF the stored scripture reference starts at verse 0, THE Backend SHALL display the range starting at verse 1 (e.g., a stored range of Psalm 23:0-2 displays as `Psalm 23:1-2`). IF the stored reference is a single verse 0 with no verseEnd, THE Backend SHALL display `Psalm 23` (chapter only, no verse number).
4. THE Backend SHALL expose REST endpoints for creating, reading, updating, and deleting metadata templates; all endpoints SHALL require the ADMIN role.
5. THE Frontend SHALL provide a template management page at `/admin/templates` where an ADMIN can create, edit, and delete templates, specifying a name, category, and format string.
6. IF a template contains `{verseText}` or `{Scripture}` and the SessionManifest has no scripture reference, THE Backend SHALL substitute `[No Scripture]` for `{Scripture}` and `[No Verse Text]` for `{verseText}`.
7. AT LEAST one title template SHALL exist in the system; THE Backend SHALL reject deletion of the last remaining title template.
8. ON first startup, IF the `metadata_templates` table is empty, THE Backend SHALL auto-create a default title template with name `"Speaker and Title"`, category `"title"`, and formatString `"{Date} – {Speaker} – {Title}"`. This follows the same bootstrap pattern as the admin user auto-creation.
9. THE system SHALL represent "None" (no description template) as a built-in template with category `"description"`, name `"None"`, and an empty formatString (`""`). This template is auto-created during the seed step alongside the default title template. Using an empty-string template instead of a null `descriptionTemplateId` eliminates null checks throughout the interpolation and persistence paths. The "None" template SHALL NOT be deletable or editable by admins — it is system-managed.

---

### Requirement 4: Template Selection and Unified Field Collection

**User Story:** As a volunteer, I want to select a title template and an optional description template before entering metadata, so that I only see the input fields that are actually needed for my chosen templates.

#### Acceptance Criteria

1. THE Frontend SHALL present two side-by-side dropdowns (stacked on narrow viewports) for template selection in the SessionManifestModal: one labeled "Title Format" for title templates and one labeled "Description Format" for description templates. The description dropdown SHALL include a "None" option. IF only one title template exists, THE Frontend SHALL auto-select it without showing the dropdown. IF only one description template exists besides "None", THE Frontend SHALL auto-select it. This mirrors the existing dashboard auto-select pattern and eliminates unnecessary decisions.
2. UNTIL both dropdowns have a selection (title is required; description may be "None" which is itself a valid selection), THE Frontend SHALL NOT display metadata input fields; instead, THE Frontend SHALL display a message in muted text: "Select a title format above to continue".
3. AFTER both templates are selected, THE Frontend SHALL compute the union of all unique placeholder tokens across both selected templates and present one input field per unique token. If both the title and description templates reference `{Title}`, the user sees one Title input — not two.
4. `{Scripture}` and `{verseText}` SHALL share a single scripture reference input. If either token appears in any selected template, the scripture reference picker SHALL be shown exactly once.
5. `{Date}` SHALL NOT produce an input field — it is always auto-populated by the backend.
6. WHEN the user switches between templates, THE Frontend SHALL preserve all previously entered field values. Switching from a template that uses `{Scripture}` to one that does not SHALL NOT clear the scripture reference — it remains available if the user switches back.
7. THE Frontend SHALL disable the Save button until all required fields for the selected templates have values. A field is required if its corresponding token appears in either selected template (excluding `{Date}`).
8. THE selected template IDs (`titleTemplateId` and `descriptionTemplateId`) SHALL be included in the SessionManifest and persisted to the backend alongside other manifest fields. This ensures template selections survive page refreshes and are visible to all connected clients.
9. THE Frontend SHALL store the most recently used template IDs in localStorage (keyed per device, not per user). WHEN the SessionManifestModal opens and no templates are selected in the current SessionManifest, THE Frontend SHALL pre-select the last-used templates from localStorage. This eliminates the template selection step for repeat use on the same device.
10. THE `BUS_SESSION_MANIFEST_UPDATED` event payload SHALL be expanded to include `interpolatedDescription` alongside the existing `interpolatedStreamTitle`. When the description template is "None" (empty formatString), `interpolatedDescription` SHALL be an empty string. Both values are pre-computed by the backend so all subscribers read the same result.
11. THE OBS Widget metadata preview row SHALL display the interpolated title (existing behavior) and, when a description template other than "None" is selected, a truncated single-line preview of the interpolated description below it. Tapping the description preview SHALL open an Ionic popover showing the full multi-line description with line breaks preserved. This uses the same popover pattern already established for the title preview (tap-to-expand). The description preview row SHALL display "No description" in muted text when the "None" template is selected.
12. THE stream start confirmation modal (Req 6.7) SHALL show both the interpolated title (in the existing visually distinct block) and the interpolated description (if not empty) below it, so the volunteer can verify all metadata before going live. The description in the confirmation modal SHALL show the full text with line breaks preserved (no truncation), since this is the last verification step.
13. IF a selected template ID in the SessionManifest references a template that no longer exists (e.g., admin deleted it), THE Frontend SHALL clear that selection and show the template dropdown in its unselected state. THE Backend SHALL treat a missing template ID as if no template is selected and substitute placeholders in the interpolated output.

---

### Requirement 5: RTMP Relay Infrastructure

**User Story:** As a system architect, I want a local RTMP relay that accepts OBS's stream and fans it out to multiple destinations independently, so that one platform's failure does not affect others.

#### Acceptance Criteria

1. THE Backend SHALL start a `node-media-server` instance as the local RTMP relay on backend startup, listening on a configurable port (default: `1935`, configurable via `RELAY_PORT` environment variable). The relay runs for the lifetime of the backend process — it is not started/stopped per streaming session.
2. THE relay SHALL accept exactly one inbound RTMP stream from OBS at the path `/live/stream`.
3. THE Backend SHALL spawn one FFmpeg child process per active streaming destination; each process SHALL read from the local relay and forward to the platform's RTMP ingest URL using `-c copy` (no re-encoding).
4. WHEN a single FFmpeg forwarder process exits unexpectedly, THE Backend SHALL NOT terminate other active forwarders; THE Backend SHALL capture the FFmpeg process's stderr output, log it, and immediately attempt auto-recovery: (a) emit a Banner-level notification: "{Platform} stream interrupted — attempting to reconnect…", (b) wait 2 seconds, then respawn the FFmpeg process with the same RTMP ingest URL, (c) if the new process stays alive for 5+ seconds, consider recovery successful and auto-clear the Banner, (d) if the new process exits again, retry with exponential backoff (2s, 4s, 8s) up to 3 retries or 45 seconds total (whichever comes first), (e) if all retries are exhausted, transition the platform status to "Error", update the Banner to a permanent message: "{Platform} stream failed: {FFmpeg error summary}", and stop retrying. The volunteer can manually restart the platform from the ManageStreamsModal. The platform broadcast is not explicitly ended by the backend during auto-recovery — YouTube's `enableAutoStop` and Facebook's auto-end will handle cleanup if recovery fails and the volunteer does not manually restart.
5. THE Backend SHALL configure OBS (via `obs-websocket` `SetStreamServiceSettings`) to stream to `rtmp://localhost:{RELAY_PORT}/live/stream` on OBS connection (not just on stream start), ensuring OBS is always pointed at the relay whenever the system is running. Before starting the OBS stream, THE Backend SHALL read back the current settings via `GetStreamServiceSettings` and verify they point at the relay; IF they have been changed externally (e.g., someone opened OBS and modified the settings), THE Backend SHALL auto-correct them and log a warning.
6. IF the relay fails to start (e.g., port already in use), THE Backend SHALL log a clear error message identifying the port conflict and SHALL NOT attempt to start platform streams. THE Backend SHALL emit a Banner-level notification: "RTMP relay failed to start — check server logs."
7. IF the relay crashes during operation, THE Backend SHALL detect the failure and attempt to restart the relay up to 3 times with 5-second delays. IF a restart succeeds, THE Backend SHALL emit a Banner-level notification that auto-clears: "RTMP relay recovered." OBS's built-in reconnect logic will re-establish the connection to the relay once it is back. IF all 3 restart attempts fail, THE Backend SHALL emit a persistent Banner: "RTMP relay is down — streaming is unavailable. Check server logs." and SHALL NOT attempt further restarts until the backend is restarted.
8. FFmpeg SHALL be a documented prerequisite in `docs/setup.md`; THE Backend SHALL verify FFmpeg is available on the system PATH at startup and log a clear error if it is not found.
9. WHEN the backend process exits (gracefully or via crash), THE relay and all FFmpeg child processes SHALL be cleaned up. The backend SHALL register signal handlers (`SIGTERM`, `SIGINT`) to terminate child processes on shutdown. For crash scenarios, FFmpeg processes are orphaned but will self-terminate when their RTMP input source (the relay) disappears.

---

### Requirement 6: Multi-Platform Stream Start Flow

**User Story:** As a volunteer, I want to select which platforms to stream to when starting a stream, so that I can broadcast to YouTube and Facebook simultaneously with a single action.

#### Acceptance Criteria

1. WHEN the user taps "Manage Streams" (replacing the previous "Start Stream" button), THE Frontend SHALL open the ManageStreamsModal. The "Manage Streams" button coexists alongside the existing Start/Stop Recording button in the OBS widget.
2. IF no platforms are configured and enabled, THE ManageStreamsModal SHALL display a message: "No streaming platforms configured. Contact an administrator."
3. THE ManageStreamsModal SHALL list all configured and enabled platforms with their current status (Idle, Starting, Streaming, Stopping, Error) and available actions. WHILE a platform is in "Starting" status, THE modal SHALL display a step-level progress indicator for that platform (e.g., "Creating broadcast…", "Connecting…", "Waiting for platform…") so the volunteer knows the system is working and not frozen.
4. WHEN the user initiates "Start All" or starts an individual platform, THE Backend SHALL execute the following sequence per platform: (a) create the broadcast via the platform's API with the interpolated title and description (for YouTube, set `contentDetails.enableAutoStart: true` and `contentDetails.enableAutoStop: true`), (b) obtain the RTMP ingest URL, (c) ensure OBS is streaming to the relay (configure OBS stream settings and start OBS stream if not already streaming), (d) spawn an FFmpeg forwarder process for that platform. `enableAutoStart` lets YouTube auto-transition to live when it detects incoming data, eliminating the fragile manual transition polling. `enableAutoStop` lets YouTube auto-end the broadcast ~1 minute after data stops, serving as a safety net if the explicit end-broadcast API call (Req 7.4) fails. The tradeoff: crash recovery always creates a new broadcast rather than reconnecting to the existing one, because `enableAutoStop` ends the broadcast before a volunteer would realistically notice and respond. This is acceptable — the volunteer experience is the same either way (tap "Start Stream" in the ManageStreamsModal).
5. IF a platform broadcast creation fails, THE Backend SHALL skip that platform, continue with remaining platforms, and emit a Banner-level notification identifying the failed platform and the reason.
6. THE "Start All" button SHALL be disabled (greyed out) when all configured platforms are already streaming.
7. BEFORE starting any platform stream, THE Frontend SHALL display a ConfirmationModal: "Start streaming to {platform list}?" with confirm label "Go Live" and cancel label "Cancel".
8. THE "Manage Streams" button SHALL be disabled unless the SessionManifest contains at least the fields required by the selected templates; THE button SHALL display a sub-label "Enter metadata" when disabled due to missing metadata.
9. IF any step in the platform start sequence does not complete within 30 seconds, THE Backend SHALL transition that platform's status to "Error" with a descriptive timeout message and continue with remaining platforms.
10. IF OBS is not connected when the stream start sequence begins, THE Backend SHALL reject the entire start request immediately with error "OBS is not connected" rather than attempting per-platform broadcast creation. Platform broadcasts should not be created if there is no OBS stream to feed them.

---

### Requirement 7: Per-Platform Stream Management

**User Story:** As a volunteer, I want to stop or restart individual platform streams without affecting others, so that I can recover from a single platform failure without disrupting the entire broadcast.

#### Acceptance Criteria

1. THE ManageStreamsModal SHALL display each platform as a full-width row (not a compact table) with: platform name, current status with health indicator, and action button(s). Each row SHALL meet WCAG 2.5.5 touch target minimums for the action button.
2. FOR a platform with status "Streaming", THE action SHALL be "Stop Stream"; tapping it SHALL display a ConfirmationModal: "Stop streaming to {platform}?" before proceeding.
3. FOR a platform with status "Idle" or "Error", THE action SHALL be "Start Stream"; tapping it SHALL initiate the platform start sequence for that single platform. IF OBS is not currently streaming to the relay (e.g., all platforms were previously stopped per Req 7.7), THE Backend SHALL restart OBS streaming to the relay before spawning the FFmpeg forwarder.
4. WHEN a platform stream is stopped, THE Backend SHALL: (a) terminate the FFmpeg forwarder process for that platform, (b) end the broadcast via the platform's API (YouTube: transition to `complete`; Facebook: end the live video), (c) update the platform status to "Idle". IF the platform API call to end the broadcast fails, THE Backend SHALL retry up to 3 times with exponential backoff (2s, 4s, 8s). IF all retries fail, THE Backend SHALL update the platform status to "Idle" locally but emit a Banner-level notification: "Stopped streaming to {platform} but the broadcast may still be active. Check {platform} manually."
5. THE "Stop All" button SHALL be disabled (greyed out) when no platforms are currently streaming.
6. THE "Stop All" action SHALL display a ConfirmationModal: "Stop all streams?" before proceeding.
7. WHEN all platform streams are stopped and OBS is still streaming to the relay, THE Backend SHALL stop the OBS stream (since there are no destinations) and update the OBS state accordingly.

---

### Requirement 8: Stream Health Monitoring

**User Story:** As a volunteer, I want to see the health status of each active stream at a glance, so that I can identify and respond to quality issues before they become visible to viewers.

#### Acceptance Criteria

1. WHILE a platform stream is active, THE Backend SHALL poll the platform's API at a regular interval (configurable, default: 30 seconds) to retrieve stream health information.
2. FOR YouTube, THE Backend SHALL retrieve the `liveStream` resource's `status.healthStatus` field, which includes stream health indicators (good, ok, bad, noData).
3. FOR Facebook, THE Backend SHALL retrieve the `LiveVideo` resource's `status` and `ingest_streams` fields for health information.
4. THE Backend SHALL broadcast stream health updates to all connected clients via Socket.io.
5. THE ManageStreamsModal SHALL display a health indicator alongside each streaming platform's status (e.g., "Streaming (Good)", "Streaming (Poor)").
6. IF a platform's stream health degrades to a critical level, THE Backend SHALL emit a Banner-level notification: "{Platform} stream quality is poor."
7. WHILE at least one platform is actively streaming, THE OBS Widget's `WidgetContainer` SHALL display a "Stream" connection status indicator. This indicator SHALL NOT appear when no platforms are streaming.
8. THE "Stream" connection status indicator SHALL use a three-state model: (a) green solid dot (`healthy`) when all active platform streams report good health, (b) yellow/amber solid dot (`degraded`) when any active platform stream reports degraded quality but none have fully failed, (c) red blinking dot (`unhealthy`) when any active platform stream has fully failed (FFmpeg process exited, platform API reports stream down).
9. THE existing `ConnectionStatus` model SHALL be extended from a boolean `healthy` field to a three-value `status` field: `"healthy"` | `"degraded"` | `"unhealthy"`. The `WidgetContainer` title bar SHALL render a yellow/amber solid dot for `degraded` — visually distinct from both the green healthy dot and the red blinking unhealthy dot. The amber color SHALL be `color-warning` (`#F39C12`) which has a verified ~8.6:1 contrast ratio against `color-bg` (`#1A1A1A`).
10. WHEN the user taps the connection indicators section, THE popover SHALL show the "Stream" entry with the worst-case status and list which platform(s) are degraded or failed.
11. THE OBS Widget SHALL display small platform icons (e.g., YouTube, Facebook) below the "Manage Streams" button, each with a status dot: green if the platform is configured, enabled, and has valid OAuth tokens; red if the platform's tokens are expired or invalid. This gives the volunteer immediate visibility into platform readiness without opening the ManageStreamsModal. Platforms that are not configured or are disabled SHALL NOT appear. The readiness state SHALL be derived from the same live token health tracking that drives the Banner notifications in Req 2.3 — not just the startup validation check — so that a mid-session token failure is reflected immediately.

---

### Requirement 9: Verse Text Interpolation

**User Story:** As a volunteer, I want the stream description to include the full text of the referenced Bible verses, so that viewers can read along without needing their own Bible.

#### Acceptance Criteria

1. WHEN a template contains the `{verseText}` token, THE Backend SHALL query the `kjv` table for all verses matching the current SessionManifest's scripture reference (bookId, chapter, verse through verseEnd inclusive, including verse 0 if it falls within the range).
2. FOR a multi-verse range (verseEnd is present and differs from verse after normalization), THE Backend SHALL format the output as:
   - Line 1: the formatted scripture reference (e.g., `John 3:16-17`)
   - Subsequent lines: each verse prefixed with its verse number and a period (e.g., `16. For God so loved...`)
   - Each verse on its own line, separated by newlines
3. FOR a single verse (no verseEnd), THE Backend SHALL format the output as a single line: the formatted scripture reference, an em dash (`–`), and the verse text (e.g., `John 3:16 – For God so loved the world...`).
4. IF verse 0 is included in the range (i.e., the stored verse value is 0), THE Backend SHALL: (a) output verse 0's text on its own line immediately after the reference line with no number prefix, (b) exclude verse 0 from the displayed reference range — the displayed range starts at verse 1 (e.g., a stored range of Psalm 23:0-2 displays as `Psalm 23:1-2` in the reference, with verse 0's text appearing unnumbered before verse 1).
5. IF no scripture reference is set in the SessionManifest, THE Backend SHALL substitute `[No Verse Text]` for the `{verseText}` token.
6. THE `{verseText}` token and the `{Scripture}` token SHALL share the same scripture reference input — if either appears in any selected template, the scripture reference picker is shown once, and the single reference is used for both tokens.

---

### Requirement 10: Platform Admin Page Modularity

**User Story:** As a developer, I want each streaming platform's admin configuration page to be a separate, self-contained module, so that adding support for a new platform (e.g., Twitch) requires creating a new file without modifying existing platform pages.

#### Acceptance Criteria

1. EACH streaming platform's admin page SHALL be implemented as a separate file (e.g., `YouTubePlatformConfig.tsx`, `FacebookPlatformConfig.tsx`).
2. THE platform admin pages SHALL be registered via a platform registry pattern so that adding a new platform requires: (a) creating a new page component file, (b) adding an entry to the registry. No existing platform files are modified.
3. EACH platform admin page SHALL handle its own OAuth flow, display its own configuration fields, and manage its own connection status independently.
4. THE Backend SHALL use a similar modular pattern for platform API integrations — each platform's API client is a separate module implementing a common `StreamingPlatformClient` interface.

---

### Requirement 11: Admin Index Page

**User Story:** As an administrator, I want a central admin page that links to all management sections, so that I can navigate to any admin function without memorizing URLs.

#### Acceptance Criteria

1. THE Frontend SHALL provide an Admin Index Page at `/admin` accessible only to authenticated ADMIN users.
2. THE Admin Index Page SHALL display links to all admin management sections: User Management (`/admin/users`), Device Management (`/admin/devices`), Streaming Platforms (`/admin/platforms/youtube`, `/admin/platforms/facebook`), Metadata Templates (`/admin/templates`), and the Dashboard Chooser.
3. WHEN an ADMIN user logs in (and has completed any required password change), THE Frontend SHALL navigate to `/admin` instead of the Dashboard Selection Screen. Non-ADMIN users continue to navigate to the Dashboard Selection Screen.
4. THE `GlobalTitleBar` dashboard navigation label SHALL link to `/admin` for ADMIN users instead of the Dashboard Selection Screen.

---

### Requirement 12: Interaction Flow Between Metadata and Stream Management

**User Story:** As a volunteer, I want a clear, sequential workflow for entering metadata and starting streams, so that I don't have to guess which step comes first.

#### Acceptance Criteria

1. Metadata entry (template selection and field input) SHALL happen in the SessionManifestModal. Stream platform management (start/stop per platform) SHALL happen in the ManageStreamsModal. These are separate modals with separate concerns.
2. THE SessionManifestModal SHALL be opened via the existing metadata preview row / pencil icon in the OBS widget, unchanged from the original spec.
3. THE ManageStreamsModal SHALL be opened via the "Manage Streams" button in the OBS widget.
4. THE "Manage Streams" button SHALL be disabled until the SessionManifest is ready for streaming. The sub-label SHALL distinguish the reason: "Select templates" when no templates are selected in the SessionManifest, and "Enter metadata" when templates are selected but required fields are incomplete. This guides the volunteer to the correct next step.
5. IF the volunteer taps the disabled "Manage Streams" button and the only reason it is disabled is missing metadata (OBS is connected, templates are selected), THE Frontend SHALL open the SessionManifestModal directly — the same behavior as the existing disabled "Start Stream" button.
