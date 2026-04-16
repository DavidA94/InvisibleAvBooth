import type { Database } from "better-sqlite3";

// All application tables, including the KJV bible table.
// The KJV table is created here alongside all other tables — seedKjv() in database.ts
// handles loading the data separately on first run.
export function applySchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
      requiresPasswordChange INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS device_connections (
      id TEXT PRIMARY KEY NOT NULL,
      deviceType TEXT NOT NULL,
      label TEXT NOT NULL,
      host TEXT NOT NULL,
      port INTEGER NOT NULL,
      encryptedPassword TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      features TEXT NOT NULL DEFAULT '{}',
      enabled INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboards (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      allowedRoles TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS widget_configurations (
      id TEXT PRIMARY KEY NOT NULL,
      dashboardId TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      widgetId TEXT NOT NULL,
      title TEXT NOT NULL,
      col INTEGER NOT NULL,
      row INTEGER NOT NULL,
      colSpan INTEGER NOT NULL,
      rowSpan INTEGER NOT NULL,
      roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
      createdAt TEXT NOT NULL,
      UNIQUE(dashboardId, widgetId)
    );

    CREATE TABLE IF NOT EXISTS kjv (
      BOOKID    INTEGER,
      CHAPTERNO INTEGER,
      VERSENO   INTEGER,
      VERSETEXT TEXT
    );
  `);
}
