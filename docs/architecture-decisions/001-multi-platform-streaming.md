# ADR-001: Multi-Platform Streaming Architecture

**Status:** Accepted
**Date:** 2026-04-18
**Context:** Multi-Platform Streaming feature (spec: `multi-platform-streaming`)

---

## Problem

The system currently streams to a single destination configured in OBS. Churches need to stream simultaneously to YouTube and Facebook (and potentially other platforms in the future). OBS natively supports only one RTMP output at a time.

---

## Options Considered

### Option A: OBS Multi-RTMP Plugin

Use the third-party `obs-multi-rtmp` plugin to add additional RTMP outputs directly in OBS.

- **Pros:** No additional infrastructure; OBS handles everything.
- **Cons:** Third-party plugin with no guaranteed maintenance. `obs-websocket` has no built-in API to control the plugin's additional outputs. Couples the system to a specific OBS plugin version. Admin must install and configure the plugin manually in OBS — violates the "cannot mess this up" principle.

**Rejected.** Unacceptable dependency on an uncontrolled third-party plugin for a critical production path.

### Option B: Direct Platform APIs Only (No Relay)

Use YouTube and Facebook APIs to create broadcasts, then configure OBS to stream to one platform and use FFmpeg to read from that platform's public stream and re-stream to the other.

- **Pros:** No local relay infrastructure.
- **Cons:** Reading from a public stream adds latency (10–30 seconds). The second platform would be significantly delayed. Depends on the first platform's public stream being available, which creates a single point of failure.

**Rejected.** Unacceptable latency and fragile dependency chain.

### Option C: Single FFmpeg Process as Relay

OBS streams to a local FFmpeg process that fans out to all destinations using `-c copy` (no re-encoding).

```
OBS → FFmpeg (listen on localhost:1935) → YouTube RTMP
                                        → Facebook RTMP
```

- **Pros:** Battle-tested RTMP handling. Zero CPU overhead for the copy.
- **Cons:** Adding or removing a destination mid-stream requires restarting the FFmpeg process, causing a brief (~1–2 second) interruption on ALL destinations — not just the one being changed. This violates the requirement that stopping one platform should not affect others.

**Rejected.** Mid-stream destination changes cause disruption to all active streams.

### Option D: node-media-server as Full Relay

Use `node-media-server` (pure Node.js RTMP server) as both the local ingest point and the multi-destination forwarder.

- **Pros:** Pure JS, no native dependencies. Can add/remove destinations mid-stream without interruption.
- **Cons:** Less mature than FFmpeg for RTMP output handling (~6 years vs 20+). Higher memory usage (Node.js runtime). Fewer production hours in critical streaming scenarios.

**Considered but not selected** as the sole solution due to maturity concerns on the output side.

### Option E: Hybrid — node-media-server Ingest + Per-Destination FFmpeg (Selected)

OBS streams to a lightweight `node-media-server` instance running on localhost. The backend spawns one independent FFmpeg process per active platform destination, each reading from the local RTMP server and forwarding via `-c copy` to the platform's ingest URL.

```
OBS → node-media-server (localhost:1935)
        ├── FFmpeg process → YouTube RTMP ingest
        └── FFmpeg process → Facebook RTMP ingest
```

- **Pros:**
  - node-media-server handles the simple, low-risk job of being a local RTMP receiver
  - FFmpeg handles the battle-tested, critical job of RTMP output per destination
  - Independent failure isolation: if the YouTube FFmpeg process crashes, Facebook continues unaffected
  - Clean mid-stream start/stop: stopping YouTube = kill its FFmpeg process; Facebook is untouched
  - Starting a new platform mid-stream = spawn a new FFmpeg process pointed at the local server
  - `-c copy` means zero re-encoding overhead — the stream is bit-for-bit identical to what OBS produces
  - This is the architecture most professional restreaming services use internally

- **Cons:**
  - Two technologies to manage (node-media-server + FFmpeg)
  - FFmpeg is a native binary dependency (but trivially installed on all platforms)

**Selected.** Best combination of reliability, isolation, and mid-stream flexibility.

---

## Decision

Use the hybrid approach (Option E):

1. **node-media-server** runs as a separate Node.js process alongside the backend, listening on a configurable local port (default `1935`). Its only job is to accept the RTMP stream from OBS and make it available for local consumers.

2. **FFmpeg** is spawned as one child process per active streaming destination. Each process reads from the local RTMP server and forwards to the platform's ingest URL using `-c copy` (no re-encoding). The backend manages the lifecycle of these processes.

3. **OBS** is configured to stream to `rtmp://localhost:{port}/live/stream` instead of directly to a platform. The backend updates OBS's stream service settings via `obs-websocket` to point at the local relay before starting the stream.

4. **Platform APIs** (YouTube Live Streaming API, Facebook Live Video API) are called by the backend to create broadcasts, set titles/descriptions, obtain RTMP ingest URLs, and manage broadcast lifecycle (transition to live, end broadcast).

---

## Consequences

### OBS Service Rework

The existing `ObsService.startStream()` safe-start sequence changes significantly:

- **Before:** Update OBS stream metadata → Start OBS stream (OBS streams directly to the configured platform)
- **After:** Create platform broadcasts via APIs → Get RTMP ingest URLs → Ensure relay is running → Configure OBS to stream to local relay → Start OBS stream → Spawn per-destination FFmpeg processes → Transition platform broadcasts to live

`ObsService.updateStreamMetadata()` via `SetStreamServiceSettings` becomes irrelevant for platform metadata — titles and descriptions are set via each platform's API. OBS's stream settings are now always pointed at the local relay.

### New Infrastructure Dependencies

- **FFmpeg** must be installed on the host machine. This is a one-line install on all supported platforms and is documented in `docs/setup.md`.
- **node-media-server** is added as an npm dependency.

### Failure Modes

| Failure                                 | Impact                                     | Recovery                                                       |
| --------------------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| node-media-server crashes               | All streams stop (OBS has nowhere to send) | Backend detects and restarts; OBS auto-reconnects              |
| Single FFmpeg process crashes           | One platform loses stream; others continue | Backend detects exit, surfaces banner, allows restart          |
| Platform API rejects broadcast creation | That platform is skipped; others proceed   | Banner notification; admin checks platform config              |
| OAuth token expired/revoked             | Platform API calls fail for that platform  | Banner: "YouTube authorization expired — admin must reconnect" |
| OBS disconnects from relay              | All streams stop (no source data)          | Existing OBS reconnect logic applies                           |

### Token Management

Both YouTube and Facebook use OAuth 2.0. After the one-time admin consent flow:

- **YouTube:** Refresh tokens are long-lived. The backend silently refreshes access tokens (1-hour expiry) using the stored refresh token. No user interaction required after initial setup.
- **Facebook:** Page access tokens obtained through the long-lived token exchange flow are effectively permanent. No refresh cycle needed unless the admin revokes the app.

Refresh tokens are encrypted at rest using the same AES-256-GCM pattern as device connection passwords (`DEVICE_SECRET_KEY`).

The backend validates platform tokens on startup by making a lightweight API call to each configured platform. Invalid tokens surface immediately as a banner notification rather than failing silently during a live service.

### YouTube API Quota

The YouTube Data API has a default daily quota of 10,000 units. Key costs:

| Operation | Cost | Typical usage per service |
|---|---|---|
| `liveBroadcasts.insert` | ~1,600 units | 1 per service |
| `liveStreams.insert` | ~50 units | 1 per service |
| `liveBroadcasts.bind` | ~50 units | 1 per service |
| `liveStreams.list` (health poll) | ~1 unit | ~240 per 2-hour service (every 30s) |
| `liveBroadcasts.transition` | ~50 units | 0 (using `enableAutoStart`/`enableAutoStop`) |

A typical single-service day uses ~2,000 units. The default 10,000 quota supports 4-5 broadcast creations per day, which is sufficient for 1-2 services plus a few false starts or test runs. If higher usage is needed, quota increases can be requested from the Google Cloud Console.

---

## Setup Impact

The admin setup flow for streaming platforms:

1. Navigate to Admin → Streaming Platforms → YouTube (or Facebook)
2. Click "Connect to YouTube" → browser redirects to Google/Facebook OAuth consent screen
3. Admin approves → redirect back to app → backend stores encrypted refresh token
4. Done. Never needs to be touched again unless switching accounts.

The volunteer experience is unchanged — they see platform checkboxes on the stream start flow and a "Manage Streams" modal during streaming. They never interact with OAuth or platform configuration.
