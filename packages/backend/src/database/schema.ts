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

    CREATE TABLE IF NOT EXISTS metadata_templates (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('title', 'description', 'lower_third')),
      formatString TEXT NOT NULL,
      roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
      lowerThirdType TEXT CHECK(lowerThirdType IN ('Title', 'TitleSubtitle', 'Scripture')),
      autoDismissMs INTEGER,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS streaming_platforms (
      id TEXT PRIMARY KEY NOT NULL,
      platformType TEXT NOT NULL CHECK(platformType IN ('youtube', 'facebook')),
      label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      encryptedAccessToken TEXT NOT NULL,
      encryptedRefreshToken TEXT,
      tokenExpiresAt TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL,
      UNIQUE(platformType, label)
    );

    CREATE TABLE IF NOT EXISTS oauth_states (
      state TEXT PRIMARY KEY NOT NULL,
      platformType TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kjv (
      BOOKID    INTEGER,
      CHAPTERNO INTEGER,
      VERSENO   INTEGER,
      VERSETEXT TEXT
    );

    CREATE TABLE IF NOT EXISTS camera_presets (
      id TEXT PRIMARY KEY NOT NULL,
      cameraId TEXT NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      storedOnCamera INTEGER NOT NULL DEFAULT 0,
      cameraPresetSlot INTEGER,
      pan REAL,
      tilt REAL,
      zoom REAL,
      focus REAL,
      autoFocus INTEGER NOT NULL DEFAULT 1,
      aiTracking INTEGER NOT NULL DEFAULT 0,
      aiTilt INTEGER NOT NULL DEFAULT 0,
      aiZoom INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_camera_presets_camera ON camera_presets(cameraId);
  `);

  migrateMetadataTemplates(database);
}

/**
 * Migrates the metadata_templates table to add lower-third columns if they don't exist.
 * SQLite cannot ALTER CHECK constraints, so we detect the old schema and recreate the table.
 */
function migrateMetadataTemplates(database: Database): void {
  const columns = database.pragma("table_info(metadata_templates)") as Array<{ name: string }>;
  const hasLowerThirdType = columns.some((col) => col.name === "lowerThirdType");
  if (hasLowerThirdType) return; // already migrated

  database.exec(`
    CREATE TABLE metadata_templates_new (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('title', 'description', 'lower_third')),
      formatString TEXT NOT NULL,
      roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
      lowerThirdType TEXT CHECK(lowerThirdType IN ('Title', 'TitleSubtitle', 'Scripture')),
      autoDismissMs INTEGER,
      createdAt TEXT NOT NULL
    );

    INSERT INTO metadata_templates_new (id, name, category, formatString, roleMinimum, createdAt)
    SELECT id, name, category, formatString, roleMinimum, createdAt FROM metadata_templates;

    DROP TABLE metadata_templates;

    ALTER TABLE metadata_templates_new RENAME TO metadata_templates;
  `);
}
