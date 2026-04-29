# Setup Guide

## Prerequisites

- Node.js 20+
- [Caddy](https://caddyserver.com/docs/install) — reverse proxy for HTTPS and unified routing
- `bibledb_kjv.sql` in the repo root (not committed — obtain separately)
- OBS Studio installed with stream settings configured (Settings → Stream → Service, Server, and Stream Key). The backend controls OBS start/stop and metadata, but the stream destination must be configured in OBS directly.

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

All admin routes require an authenticated ADMIN JWT cookie. Navigate to these by URL — they are not linked from the dashboard UI.

| Route              | Description                                                                       |
| ------------------ | --------------------------------------------------------------------------------- |
| `/admin/users`     | Two-panel user management: list + detail form (self-delete/role-change prevented) |
| `/admin/devices`   | Two-panel device management: list + detail form (supports multiple device types)  |

Full REST API:

| Route                                     | Method | Description                  |
| ----------------------------------------- | ------ | ---------------------------- |
| `/api/admin/users`                        | GET    | List all users               |
| `/api/admin/users`                        | POST   | Create a user                |
| `/api/admin/users/:id`                    | GET    | Get a user                   |
| `/api/admin/users/:id`                    | PUT    | Update a user                |
| `/api/admin/users/:id`                    | DELETE | Delete a user                |
| `/api/admin/users/:id/change-password`    | POST   | Reset a user's password      |
| `/api/admin/devices`                      | GET    | List device connections      |
| `/api/admin/devices`                      | POST   | Add a device connection      |
| `/api/admin/devices/:id`                  | GET    | Get a device connection      |
| `/api/admin/devices/:id`                  | PUT    | Update a device connection   |
| `/api/admin/devices/:id`                  | DELETE | Delete a device connection   |
| `/api/admin/dashboards`                   | GET    | List dashboards              |
| `/api/admin/dashboards`                   | POST   | Create a dashboard           |
| `/api/admin/dashboards/:id`              | GET    | Get a dashboard              |
| `/api/admin/dashboards/:id`              | PUT    | Update a dashboard           |
| `/api/admin/dashboards/:id`              | DELETE | Delete a dashboard           |
| `/api/admin/dashboards/:id/widgets`      | GET    | List widgets for a dashboard |
| `/api/admin/dashboards/:id/widgets`      | POST   | Add a widget to a dashboard  |
| `/api/admin/dashboards/:id/widgets/:wid` | GET    | Get a widget                 |
| `/api/admin/dashboards/:id/widgets/:wid` | PUT    | Update a widget              |
| `/api/admin/dashboards/:id/widgets/:wid` | DELETE | Delete a widget              |

---

## Key rotation

If `DEVICE_SECRET_KEY` is changed, all stored device passwords become unreadable. Re-enter all device passwords via `/admin/devices` after rotating the key.
