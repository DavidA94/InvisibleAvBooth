# Setup Guide

## Prerequisites

- Node.js 20+
- `bibledb_kjv.sql` in the repo root (not committed — obtain separately)

---

## 1. Generate DEVICE_SECRET_KEY

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

## 2. Install dependencies

```bash
npm install
```

---

## 3. First startup

```bash
cd packages/backend
npx tsx src/index.ts
```

On first startup with no users in the database, the backend:

1. Creates a default `admin` account with a randomly generated password
2. Prints the credentials to stdout
3. Writes them to `data/bootstrap.txt`

**Save the password immediately.** `data/bootstrap.txt` is deleted automatically after you change the password.

---

## 4. Run the seed script

The seed script creates the default dashboard and OBS widget configuration. Run it once before first use:

```bash
cd packages/backend
npx tsx scripts/seed-dashboard.ts
```

The script is idempotent — safe to run multiple times.

---

## 5. First login and password change

1. Open the app in a browser
2. Log in with username `admin` and the bootstrap password
3. You will be redirected to `/change-password` — change the password before accessing the dashboard

---

## Admin Routes

All admin routes require an authenticated ADMIN JWT cookie.

| Route                                     | Method | Description                  |
| ----------------------------------------- | ------ | ---------------------------- |
| `/admin/users`                            | GET    | List all users               |
| `/admin/users`                            | POST   | Create a user                |
| `/admin/users/:id`                        | GET    | Get a user                   |
| `/admin/users/:id`                        | PUT    | Update a user                |
| `/admin/users/:id`                        | DELETE | Delete a user                |
| `/admin/users/:id/change-password`        | POST   | Change a user's password     |
| `/admin/devices`                          | GET    | List device connections      |
| `/admin/devices`                          | POST   | Add a device connection      |
| `/admin/devices/:id`                      | GET    | Get a device connection      |
| `/admin/devices/:id`                      | PUT    | Update a device connection   |
| `/admin/devices/:id`                      | DELETE | Delete a device connection   |
| `/admin/dashboards`                       | GET    | List dashboards              |
| `/admin/dashboards`                       | POST   | Create a dashboard           |
| `/admin/dashboards/:id`                   | GET    | Get a dashboard              |
| `/admin/dashboards/:id`                   | PUT    | Update a dashboard           |
| `/admin/dashboards/:id`                   | DELETE | Delete a dashboard           |
| `/admin/dashboards/:id/widgets`           | GET    | List widgets for a dashboard |
| `/admin/dashboards/:id/widgets`           | POST   | Add a widget to a dashboard  |
| `/admin/dashboards/:id/widgets/:widgetId` | GET    | Get a widget                 |
| `/admin/dashboards/:id/widgets/:widgetId` | PUT    | Update a widget              |
| `/admin/dashboards/:id/widgets/:widgetId` | DELETE | Delete a widget              |

---

## Key rotation

If `DEVICE_SECRET_KEY` is changed, all stored device passwords become unreadable. Re-enter all device passwords via `/admin/devices` after rotating the key.
