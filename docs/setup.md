# Setup Guide

## Prerequisites

- Node.js 20+
- [Caddy](https://caddyserver.com/docs/install) — reverse proxy for HTTPS and unified routing
- [FFmpeg](https://ffmpeg.org/download.html) — required for multi-platform streaming relay (minimum version 4.4 recommended; must be on PATH)
- `bibledb_kjv.sql` in the repo root (not committed — obtain separately)
- OBS Studio installed with **H.264 video codec and AAC audio codec** configured (required for `-c copy` compatibility with the RTMP relay)

---

## 1. Install Caddy

Follow the [official install guide](https://caddyserver.com/docs/install) for your platform. Caddy is a single binary with no dependencies.

After installing, generate the TLS certificate:

```bash
bash scripts/generate-cert.sh
```

This creates a self-signed certificate in `certs/` valid for `invisible.av` and `localhost` (CN=invisible.av, O=Invisible AV Booth, OU=Development, 10-year expiry).

### Trusting the certificate

**Linux (server machine):**

```bash
sudo cp certs/localhost.crt /usr/local/share/ca-certificates/invisible-av.crt
sudo update-ca-certificates
```

**Windows (if running via WSL):**

1. Copy `certs/localhost.crt` to the Windows filesystem
2. Double-click the `.crt` file → Install Certificate → Local Machine → Place in "Trusted Root Certification Authorities"

**Tablets / client devices:** Import `certs/localhost.crt` as a trusted CA certificate via the device's security settings.

---

## 2. DNS Setup

To access the app at `https://invisible.av`, configure DNS resolution on your network:

**Option A — Router DNS:** Add a DNS entry on your router pointing `invisible.av` to the server's LAN IP address. All devices on the network will resolve it automatically.

**Option B — Hosts file (per device):** Add an entry to each device's hosts file:

- **Linux/macOS:** `/etc/hosts`
- **Windows:** `C:\Windows\System32\drivers\etc\hosts`

```
192.168.x.x  invisible.av
```

Replace `192.168.x.x` with the server's LAN IP.

`https://localhost` always works on the server machine itself without any DNS setup.

---

## 3. Firewall Setup

Caddy listens on ports 443 (HTTPS) and 80 (HTTP → HTTPS redirect). If other devices on the LAN need to access the app, allow inbound traffic on these ports.

**Windows (if running via WSL):** Open an elevated PowerShell and run:

```powershell
New-NetFirewallRule -DisplayName "Invisible AV Booth (HTTPS)" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
New-NetFirewallRule -DisplayName "Invisible AV Booth (HTTP)" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow
```

**Linux (ufw):**

```bash
sudo ufw allow 443/tcp
sudo ufw allow 80/tcp
```

**Linux (iptables):**

```bash
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
```

Port 80 is needed because Caddy auto-redirects HTTP → HTTPS. Without it, devices hitting `http://invisible.av` would time out instead of redirecting.

---

## 4. WSL Mirrored Networking (Windows only)

If running on WSL2, enable mirrored networking so that external devices can reach WSL services. Add to `C:\Users\<username>\.wslconfig`:

```ini
[wsl2]
networkingMode=mirrored
```

Then restart WSL:

```powershell
wsl --shutdown
```

Without mirrored networking, WSL2 uses a virtual network adapter and external devices cannot reach services running inside WSL.

---

## 5. Generate DEVICE_SECRET_KEY

The backend encrypts device passwords at rest using AES-256-GCM. A 32-byte key is required.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy `.env.example` to `.env` in `packages/backend/` and set the value:

```
DEVICE_SECRET_KEY=<64-character hex string>
```

Optional environment variables:

```
RELAY_PORT=1935          # RTMP relay port (default: 1935)
YOUTUBE_CLIENT_ID=       # Google Cloud Console OAuth client ID
YOUTUBE_CLIENT_SECRET=   # Google Cloud Console OAuth client secret
FACEBOOK_APP_ID=         # Facebook Developer portal app ID
FACEBOOK_APP_SECRET=     # Facebook Developer portal app secret
```

The `.env` file must be in `packages/backend/` — that is the working directory when the server runs. It is gitignored and loaded automatically on startup. Never commit it.

---

## 6. Install dependencies

```bash
npm install
```

---

## 7. First startup

Start all services:

```bash
npm run dev:full
```

This starts Caddy (with sudo for port 443), the backend, and the Vite dev server. Access the app at **https://invisible.av** (or **https://localhost**).

On first startup with no users in the database, the backend:

1. Creates a default `admin` account with a randomly generated password
2. Prints the credentials to stdout
3. Writes them to `data/bootstrap.txt`

**Save the password immediately.** `data/bootstrap.txt` is deleted automatically after you change the password.

---

## 8. Run the seed script

The seed script creates the default dashboard and OBS widget configuration. Run it once before first use:

```bash
cd packages/backend
npx tsx scripts/seed-dashboard.ts
```

The script is idempotent — safe to run multiple times.

---

## 9. First login and password change

1. Open **https://invisible.av** in a browser
2. Log in with username `admin` and the bootstrap password
3. You will be redirected to `/change-password` — change the password before accessing the dashboard

---

## Development

### Full stack (recommended)

```bash
npm run dev:full
```

Starts Caddy + backend + Vite dev server. Access at **https://invisible.av**. Caddy routes `/api/*` and `/socket.io/*` to the backend (port 3001), everything else to Vite (port 5173). Press Ctrl+C to stop all services.

### Individual servers

```bash
npm run dev:backend   # Express on :3001
npm run dev:frontend  # Vite on :5173
```

Each command ensures Caddy is running first (prompts for sudo once if needed). The second command detects Caddy is already running and skips — no second password prompt. Access the app at **https://invisible.av** regardless of which command you use.

---

## Production

```bash
npm run build
sudo caddy start --config Caddyfile
cd packages/backend && node dist/index.js   # or use a process manager like PM2
```

Caddy serves the built static files from `packages/frontend/dist` and proxies API/Socket.io requests to the backend. Access at **https://invisible.av**.

---

## Admin Routes

All admin routes require an authenticated ADMIN JWT cookie. Navigate via the **Admin Pages** link in the title bar (visible to ADMIN users only).

| Route                       | Description                                                                       |
| --------------------------- | --------------------------------------------------------------------------------- |
| `/admin`                    | Admin index — card grid linking to all admin sections                             |
| `/admin/users`              | Two-panel user management: list + detail form (self-delete/role-change prevented) |
| `/admin/devices`            | Two-panel device management: list + detail form (supports multiple device types)  |
| `/admin/templates`          | Metadata template management: title and description templates with validation     |
| `/admin/platforms/youtube`  | YouTube streaming platform configuration and OAuth connection                     |
| `/admin/platforms/facebook` | Facebook streaming platform configuration and OAuth connection                    |

Full REST API:

| Route                                    | Method | Description                  |
| ---------------------------------------- | ------ | ---------------------------- |
| `/api/admin/users`                       | GET    | List all users               |
| `/api/admin/users`                       | POST   | Create a user                |
| `/api/admin/users/:id`                   | GET    | Get a user                   |
| `/api/admin/users/:id`                   | PUT    | Update a user                |
| `/api/admin/users/:id`                   | DELETE | Delete a user                |
| `/api/admin/users/:id/change-password`   | POST   | Reset a user's password      |
| `/api/admin/devices`                     | GET    | List device connections      |
| `/api/admin/devices`                     | POST   | Add a device connection      |
| `/api/admin/devices/:id`                 | GET    | Get a device connection      |
| `/api/admin/devices/:id`                 | PUT    | Update a device connection   |
| `/api/admin/devices/:id`                 | DELETE | Delete a device connection   |
| `/api/admin/dashboards`                  | GET    | List dashboards              |
| `/api/admin/dashboards`                  | POST   | Create a dashboard           |
| `/api/admin/dashboards/:id`              | GET    | Get a dashboard              |
| `/api/admin/dashboards/:id`              | PUT    | Update a dashboard           |
| `/api/admin/dashboards/:id`              | DELETE | Delete a dashboard           |
| `/api/admin/dashboards/:id/widgets`      | GET    | List widgets for a dashboard |
| `/api/admin/dashboards/:id/widgets`      | POST   | Add a widget to a dashboard  |
| `/api/admin/dashboards/:id/widgets/:wid` | GET    | Get a widget                 |
| `/api/admin/dashboards/:id/widgets/:wid` | PUT    | Update a widget              |
| `/api/admin/dashboards/:id/widgets/:wid` | DELETE | Delete a widget              |

---

## YouTube OAuth Setup (optional)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select an existing one)
3. Enable the **YouTube Data API v3**
4. Go to **Credentials** → **Create Credentials** → **OAuth client ID**
5. Application type: **Web application**
6. **Authorized JavaScript origins:** Leave blank. The OAuth flow is server-side — no browser-based JS client is used.
7. **Authorized redirect URI:** `https://localhost/api/auth/callback/youtube`
8. Copy the Client ID and Client Secret to your `.env` file
9. In the app, go to `/admin/platforms/youtube` and click **Connect**

> **Why `localhost`?** Google's OAuth console rejects non-public domains like `invisible.av`. Since the OAuth callback is handled by the backend (which runs behind Caddy), `localhost` works when the admin performs the one-time connection from a browser on the server machine. This is a setup-time action only — after tokens are stored, all streaming operations work from any device on the network (tablets, etc.) via `invisible.av`.
>
> **Using a real domain:** If you have a public domain (e.g., `av.yourchurch.org`), you can use that instead of `localhost`. Add it to the Caddyfile, update the redirect URI in Google Cloud Console, and set `APP_URL` in your `.env`. Caddy will auto-obtain a Let's Encrypt certificate for public domains.

---

## Facebook OAuth Setup (optional)

### Create the Meta App

1. Go to [Meta for Developers](https://developers.facebook.com/) and log in
2. Navigate to [**My Apps**](https://developers.facebook.com/apps/) → **Create App**
3. Enter an app name (e.g., "Church Livestream") and contact email → **Next**
4. Under **Use cases**, select **Other** → **Next**
5. Select app type **Business** → **Next**
6. Connect a business portfolio (or select "I don't want to connect a business portfolio yet") → **Next**
7. Review and click **Go to dashboard**

### Configure permissions

1. In the left sidebar, click **App Review** → **Permissions and Features**
2. Find and request **Standard Access** for:
   - `publish_video` — required for live streaming
   - `pages_manage_posts` — required if streaming to a Page
   - `pages_read_engagement` — required for reading Page info
3. In development mode, these permissions work immediately for app admins and test users. For production use with other accounts, submit for App Review.

### Add Facebook Login product

1. In the left sidebar, click **Add Product**
2. Find **Facebook Login for Business** and click **Set Up**
3. Under **Facebook Login for Business** → **Settings**:
   - Set **Valid OAuth Redirect URIs** to: `https://localhost/api/auth/callback/facebook`
   - Save changes

### Get credentials

1. In the left sidebar, click **App Settings** → **Basic**
2. Copy the **App ID** and **App Secret** to your `.env` file:
   ```
   FACEBOOK_APP_ID=<your app id>
   FACEBOOK_APP_SECRET=<your app secret>
   ```

### Connect in the app

1. Go to `/admin/platforms/facebook` and click **Connect Facebook**
2. Authorize the app in the Facebook dialog
3. After redirect, choose your streaming target:
   - **A Page** — if your account manages Pages. Page streams are always public.
   - **My Profile** — streams to your personal profile. Supports privacy settings (Public, Friends, Only Me). Requires the account to be 60+ days old with 100+ followers.
4. If only one Page exists and no other options, it's auto-selected.

> **Why `localhost`?** Meta rejects non-public domains like `invisible.av` as redirect URIs. The admin must perform the one-time OAuth connection from a browser on the server machine. After tokens are stored, streaming works from any device via `invisible.av`.
>
> **Privacy:** User profile connections default to "Only Me" for safe testing. Change the default in `/admin/platforms/facebook`. ADMIN and AvPowerUser can override per-stream in the Manage Streams modal.
>
> **Development mode:** Only app admins and test users (added under **App Roles** in the dashboard) can use the app's permissions. For production use with other Facebook accounts, submit permissions for App Review.
>
> **Using a real domain:** If you have a public domain, update the Valid OAuth Redirect URI in Facebook Login settings and set `APP_URL` in your `.env`.

---

## Key rotation

If `DEVICE_SECRET_KEY` is changed, all stored device passwords become unreadable. Re-enter all device passwords via `/admin/devices` after rotating the key.

---

## Lower-Third Overlay (OBS Browser Source)

---

## NDI Setup (Video Preview & Camera Control)

### OBS Preview — DistroAV Plugin

The OBS Preview widget displays a real-time feed of what OBS is outputting, regardless of streaming/recording state. This requires the DistroAV (NDI) plugin:

1. **Install DistroAV:**
   - **Linux (apt):** `sudo apt install obs-ndi`
   - **Windows:** Download from [github.com/DistroAV/DistroAV/releases](https://github.com/DistroAV/DistroAV/releases) and run the installer
   - **macOS:** `brew install obs-ndi`

2. **Enable NDI output in OBS:**
   - Open OBS → Tools → NDI Output Settings
   - Check "Main Output"
   - The output name defaults to `MACHINE-NAME (OBS)` — note this value

3. **Configure in Invisible A/V Booth:**
   - Go to `/admin/devices`, select your OBS connection
   - Enter the NDI output name in the "NDI Output Name" field (e.g., `MY-PC (OBS)`)
   - Save

The preview widget will display "OBS Preview Unavailable" if DistroAV is not enabled or OBS is not running. Once configured, the preview is always available when OBS is running — even without streaming or recording active.

### Camera Features — NDI SDK

Camera video preview and PTZ control require the NDI SDK (via the `grandiose` native module):

1. **Install the NDI SDK:**
   - Download from [ndi.video/tools](https://ndi.video/tools/) (NDI SDK, free registration)
   - **Linux:** Extract and copy libraries to `/usr/local/lib`, run `sudo ldconfig`
   - **Windows:** Run the installer (adds to PATH automatically)

2. **Build native bindings:**

   ```bash
   cd packages/backend
   npm rebuild grandiose
   ```

3. If the NDI SDK is not installed, the system logs an error at startup and camera features are disabled. OBS preview, streaming, and all other features continue to work normally.

### Camera AI Tracking Credentials (Tongveo NVS20A-4KN)

To configure AI tracking for supported camera models, you need the camera's HTTP cookie and credential ID. These are obtained from the camera's web interface:

1. Open the camera's web interface (e.g., `http://192.168.1.x`) in a browser
2. Log in and enable AI tracking manually once
3. Open browser Developer Tools → Network tab
4. Toggle AI tracking on/off and find the request to `/api/aiControl`
5. Copy the `Cookie` header value from the request headers
6. Find the request to `/api/setPTZCmd` and copy the `ID` field from the JSON body

Enter these values in the camera's admin configuration under "AI Tracking Configuration."

> **Warning:** These credentials may expire on camera reboot or session timeout. If AI tracking commands start failing, re-obtain the cookie from the camera's web interface.

---

## Lower-Third Overlay (OBS Browser Source)

The lower-third system uses a static HTML file loaded in OBS as a browser source. This file wraps an iFrame that connects to the frontend overlay page.

### OBS Browser Source Configuration

1. In OBS, add a **Browser** source to your scene
2. Set the **Local file** checkbox and point it to:
   ```
   file:///path/to/InvisibleAvBooth/packages/overlay/lower-thirds.html
   ```
3. Set **Width** to `1920` and **Height** to `1080`
4. Ensure these checkboxes are **unchecked** (OBS defaults):
   - ☐ Shutdown source when not visible
   - ☐ Refresh browser when scene becomes active
5. Leave "Custom CSS" empty

### Configuring the Overlay URL

The static wrapper needs to know where the frontend is hosted. Edit `packages/overlay/lower-thirds.html` and set the `data-overlay-url` attribute on the `<body>` tag:

```html
<body data-overlay-url="https://invisible.av/overlay/lower-thirds"></body>
```

If your deployment uses a different hostname (e.g., `https://localhost`), update this value accordingly.

### Resolution Mismatch Detection

If the OBS browser source is not configured at 1920×1080, the system will display a persistent warning banner on the volunteer dashboard:

> "OBS browser source is misconfigured ({width}×{height}). Expected 1920×1080 at 16:9."

Fix by adjusting the browser source Width/Height in OBS properties.

### Environment Variables

| Variable                             | Default | Description                                                                                                               |
| ------------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------- |
| `VITE_OVERLAY_DISCONNECT_TIMEOUT_MS` | `15000` | Time (ms) before the overlay auto-dismisses a stuck graphic when disconnected from the backend. Build-time configuration. |
