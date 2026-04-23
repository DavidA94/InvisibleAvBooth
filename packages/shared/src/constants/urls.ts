// API route path constants shared between frontend, backend, and tests.
// All backend routes use the /api prefix.

// ── Auth ───────────────────────────────────────────────────────────────────────

export const URL_AUTH_LOGIN = "/api/auth/login" as const;
export const URL_AUTH_LOGOUT = "/api/auth/logout" as const;
export const URL_AUTH_CHECK = "/api/auth/check" as const;
export const URL_AUTH_CHANGE_PASSWORD = "/api/auth/change-password" as const;

// ── Admin Users ────────────────────────────────────────────────────────────────

export const URL_ADMIN_USERS = "/api/admin/users" as const;
export const URL_ADMIN_USER_BY_ID = (id: string): string => `/api/admin/users/${id}`;
export const URL_ADMIN_USER_CHANGE_PASSWORD = (id: string): string => `/api/admin/users/${id}/change-password`;

// ── Admin Devices ──────────────────────────────────────────────────────────────

export const URL_ADMIN_DEVICES = "/api/admin/devices" as const;
export const URL_ADMIN_DEVICE_BY_ID = (id: string): string => `/api/admin/devices/${id}`;

// ── Admin Dashboards ───────────────────────────────────────────────────────────

export const URL_ADMIN_DASHBOARDS = "/api/admin/dashboards" as const;

// ── Dashboards ─────────────────────────────────────────────────────────────────

export const URL_DASHBOARDS = "/api/dashboards" as const;
export const URL_DASHBOARD_LAYOUT = (id: string): string => `/api/dashboards/${id}/layout`;

// ── Session ────────────────────────────────────────────────────────────────────

export const URL_SESSION_MANIFEST = "/api/session/manifest" as const;

// ── KJV ────────────────────────────────────────────────────────────────────────

export const URL_KJV_VALIDATE = "/api/kjv/validate" as const;

// ── Logs ───────────────────────────────────────────────────────────────────────

export const URL_LOGS = "/api/logs" as const;
