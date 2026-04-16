# Backend Manual Testing Guide

Assumes the backend is running (`npx tsx src/index.ts`) and you have completed the setup steps in `docs/setup.md`.

Base URL: `http://localhost:3000`

---

## Authentication

All endpoints except `POST /auth/login` and `POST /auth/change-password` require a valid JWT cookie. Postman handles this automatically once you log in — the `token` cookie is set on the login response and sent on all subsequent requests to the same host.

**First login flow**: All new users (including the bootstrap admin) have `requiresPasswordChange` set. You must call `POST /auth/change-password` before any other protected endpoint will respond. The `/auth/*` routes are always accessible regardless of this flag.

### Login

**POST** `/auth/login`

```json
{
  "username": "admin",
  "password": "your-password",
  "rememberMe": false
}
```

Response sets an `HttpOnly` cookie named `token`. If `requiresPasswordChange` is true in the response, call `POST /auth/change-password` next.

### Change own password (self-service)

**POST** `/auth/change-password`

```json
{
  "newPassword": "your-new-password"
}
```

Works even when `requiresPasswordChange` is set. Re-issues the JWT cookie with the flag cleared. No user ID needed — changes the password for the currently authenticated user.

### Logout

**POST** `/auth/logout`

No body. Clears the `token` cookie.

---

## User Management

### List users

**GET** `/admin/users`

### Create user

**POST** `/admin/users`

```json
{
  "username": "volunteer1",
  "password": "pass123",
  "role": "AvVolunteer"
}
```

Roles: `"ADMIN"` | `"AvPowerUser"` | `"AvVolunteer"`

### Get user

**GET** `/admin/users/:id`

### Update user

**PUT** `/admin/users/:id`

```json
{
  "username": "volunteer1-updated",
  "role": "AvPowerUser"
}
```

All fields optional. Omit `password` to leave it unchanged.

### Delete user

**DELETE** `/admin/users/:id`

Returns `204 No Content`. Will return `403` if you try to delete your own account.

### Reset another user's password (admin)

**POST** `/admin/users/:id/change-password`

```json
{
  "newPassword": "temporarypass123"
}
```

Sets a new password for the target user **and** sets `requiresPasswordChange: 1` — the user will be forced to change their password on next login. Use this to reset a forgotten password or onboard a new user with a known temporary password.

---

## Device Management

### List devices

**GET** `/admin/devices`

Passwords are never returned.

### Add device

**POST** `/admin/devices`

```json
{
  "deviceType": "obs",
  "label": "Main OBS",
  "host": "localhost",
  "port": 4455,
  "password": "obs-password",
  "metadata": {
    "streamTitleTemplate": "{Date} – {Speaker} – {Title}"
  },
  "features": {},
  "enabled": true
}
```

`password`, `metadata`, `features`, and `enabled` are optional.

### Get device

**GET** `/admin/devices/:id`

### Update device

**PUT** `/admin/devices/:id`

```json
{
  "label": "Main OBS (updated)",
  "host": "192.168.1.100"
}
```

All fields optional. Omit `password` to leave the stored encrypted password unchanged.

### Delete device

**DELETE** `/admin/devices/:id`

Returns `204 No Content`.

---

## Dashboard Management

### List dashboards (admin)

**GET** `/admin/dashboards`

### Create dashboard

**POST** `/admin/dashboards`

```json
{
  "name": "Volunteer View",
  "description": "Standard volunteer control surface",
  "allowedRoles": ["AvVolunteer", "AvPowerUser"]
}
```

### Update dashboard

**PUT** `/admin/dashboards/:id`

```json
{
  "name": "Updated Name"
}
```

### Delete dashboard

**DELETE** `/admin/dashboards/:id`

### List widgets for a dashboard

**GET** `/admin/dashboards/:id/widgets`

### Add widget to dashboard

**POST** `/admin/dashboards/:id/widgets`

```json
{
  "widgetId": "obs",
  "title": "OBS",
  "col": 0,
  "row": 0,
  "colSpan": 2,
  "rowSpan": 2,
  "roleMinimum": "AvVolunteer"
}
```

`col`/`row` are 0-indexed. `widgetId` must be unique per dashboard.

### Update widget

**PUT** `/admin/dashboards/:id/widgets/:widgetId`

```json
{
  "title": "OBS Control",
  "colSpan": 3
}
```

### Delete widget

**DELETE** `/admin/dashboards/:id/widgets/:widgetId`

---

## Dashboard Layout (user-facing)

### List accessible dashboards

**GET** `/api/dashboards`

Returns only dashboards the authenticated user's role can access. ADMIN sees all.

### Get dashboard layout (GridManifest)

**GET** `/api/dashboards/:id/layout`

```json
{
  "version": 1,
  "cells": [
    {
      "widgetId": "obs",
      "title": "OBS",
      "col": 0,
      "row": 0,
      "colSpan": 2,
      "rowSpan": 2,
      "roleMinimum": "AvVolunteer"
    }
  ]
}
```

---

## Session Manifest

### Get current manifest

**GET** `/api/session/manifest`

Returns `{}` until updated via Socket.io.

---

## KJV Validation

### Validate a scripture reference

**GET** `/api/kjv/validate?bookId=43&chapter=3&verse=16`

Valid response:

```json
{ "valid": true }
```

Invalid response:

```json
{ "valid": false, "reason": "VERSE_NOT_FOUND" }
```

Reason codes: `BOOK_NOT_FOUND` | `CHAPTER_NOT_FOUND` | `VERSE_NOT_FOUND` | `VERSE_END_NOT_FOUND`

With end verse: `/api/kjv/validate?bookId=43&chapter=3&verse=16&verseEnd=17`

Book IDs: Genesis = 1, John = 43, Revelation = 66. Roman numeral books: I John = 62, II John = 63, III John = 64.

---

## Log Ingestion

### Submit frontend log entries

**POST** `/api/logs`

```json
[
  {
    "level": "info",
    "message": "User tapped Start Stream",
    "userId": "abc123",
    "context": { "action": "startStream" },
    "timestamp": "2026-04-15T07:00:00.000Z"
  }
]
```

Body must be an array. Returns `204 No Content`. Entries appear in `logs/app.log` tagged `"source": "frontend"`.

---

## Socket.io

Postman supports Socket.io connections natively (New → Socket.IO).

**URL:** `http://localhost:3000`

**Auth:** In the connection settings, add an `auth` object:

```json
{ "token": "<paste your JWT token here>" }
```

To get the raw JWT token value (not the cookie), you can decode it from the `token` cookie after login, or temporarily add a `/auth/token` debug endpoint. Alternatively, use a Socket.io client script.

### Events to listen for (server → client)

| Event                          | Payload                                                                                    |
| ------------------------------ | ------------------------------------------------------------------------------------------ |
| `stc:obs:state`                | `{ connected, streaming, recording, streamTimecode?, recordingTimecode?, commandedState }` |
| `stc:session:manifest:updated` | `{ manifest, interpolatedStreamTitle }`                                                    |
| `stc:obs:error`                | `{ error: { code, message }, retryExhausted?, context? }`                                  |
| `stc:obs:error:resolved`       | `{ errorCode }`                                                                            |
| `stc:device:capabilities`      | `{ deviceId, capabilities: { deviceType, features } }`                                     |
| `notification`                 | `{ level, message }`                                                                       |

### Events to emit (client → server)

#### Start stream

Event: `cts:obs:command`

```json
{ "type": "startStream" }
```

Ack response: `{ "success": true }` or `{ "success": false, "error": "..." }`

#### Stop stream

Event: `cts:obs:command`

```json
{ "type": "stopStream" }
```

#### Start recording

Event: `cts:obs:command`

```json
{ "type": "startRecording" }
```

#### Stop recording

Event: `cts:obs:command`

```json
{ "type": "stopRecording" }
```

#### Update session manifest

Event: `cts:session:manifest:update`

```json
{
  "speaker": "John Smith",
  "title": "Grace and Truth",
  "scripture": {
    "bookId": 43,
    "chapter": 3,
    "verse": 16,
    "verseEnd": 17
  }
}
```

Ack response: `{ "success": true }`

#### Reconnect OBS

Event: `cts:obs:reconnect`

No payload. Ack response: `{ "success": true }` or `{ "success": false, "error": "..." }`

---

## Notes

- All `POST`/`PUT` bodies must have `Content-Type: application/json` set in Postman.
- The JWT cookie is `HttpOnly` — Postman's cookie jar handles it automatically after login.
- OBS commands will fail with `OBS_UNREACHABLE` if no OBS instance is running or no device connection is configured.
- The session manifest persists in memory until the backend restarts or you explicitly clear it via `cts:session:manifest:update` with empty fields.
