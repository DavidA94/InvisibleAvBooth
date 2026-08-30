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
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      allowedRoles TEXT NOT NULL DEFAULT '[]',
      createdAt TEXT NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_name_lower ON dashboards(LOWER(name));

    CREATE TABLE IF NOT EXISTS widget_configurations (
      id TEXT PRIMARY KEY NOT NULL,
      dashboardId TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      widgetId TEXT NOT NULL,
      gridType TEXT NOT NULL CHECK(gridType IN ('large-landscape', 'large-portrait', 'small-landscape', 'small-portrait')),
      title TEXT NOT NULL,
      col INTEGER NOT NULL,
      row INTEGER NOT NULL,
      colSpan INTEGER NOT NULL,
      rowSpan INTEGER NOT NULL,
      roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
      createdAt TEXT NOT NULL,
      UNIQUE(dashboardId, widgetId, gridType)
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

    CREATE TABLE IF NOT EXISTS mixer_presets (
      id TEXT PRIMARY KEY NOT NULL,
      mixerId TEXT NOT NULL REFERENCES device_connections(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      sortOrder INTEGER NOT NULL DEFAULT 0,
      -- Open OSC address→value map (JSON). v1 holds fader/mute/gain for all
      -- configured channels; future parameters (e.g. EQ) need no schema change.
      payload TEXT NOT NULL DEFAULT '{}',
      createdAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mixer_presets_mixer ON mixer_presets(mixerId);
  `);

  migrateMetadataTemplates(database);
  migrateDashboardSchema(database);
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

/**
 * Migrates the dashboard schema to add slug column and gridType column.
 *
 * Detects old schema by checking if widget_configurations has a gridType column.
 * Since there are no production deployments on the old format, this is a
 * destructive migration — widget_configurations is dropped and recreated.
 * Existing dashboards get a slug derived from their name.
 */
function migrateDashboardSchema(database: Database): void {
  const widgetColumns = database.pragma("table_info(widget_configurations)") as Array<{ name: string }>;
  const hasGridType = widgetColumns.some((col) => col.name === "gridType");
  if (hasGridType) return; // already migrated

  // Check if dashboards table has slug column
  const dashboardColumns = database.pragma("table_info(dashboards)") as Array<{ name: string }>;
  const hasSlug = dashboardColumns.some((col) => col.name === "slug");

  if (!hasSlug) {
    // Add slug column to dashboards — generate default slugs from existing names
    database.exec(`ALTER TABLE dashboards ADD COLUMN slug TEXT NOT NULL DEFAULT ''`);

    // Generate slugs for existing dashboards
    const rows = database.prepare("SELECT id, name FROM dashboards").all() as Array<{ id: string; name: string }>;
    const updateSlug = database.prepare("UPDATE dashboards SET slug = ? WHERE id = ?");
    for (const row of rows) {
      const slug =
        row.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || row.id;
      updateSlug.run(slug, row.id);
    }

    // Add unique constraint on slug (recreate table since SQLite can't add constraints)
    // For simplicity in dev, we just create the unique index
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_slug ON dashboards(slug)`);
    database.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboards_name_lower ON dashboards(LOWER(name))`);
  }

  // Drop and recreate widget_configurations with gridType column
  database.exec(`DROP TABLE IF EXISTS widget_configurations`);
  database.exec(`
    CREATE TABLE widget_configurations (
      id TEXT PRIMARY KEY NOT NULL,
      dashboardId TEXT NOT NULL REFERENCES dashboards(id) ON DELETE CASCADE,
      widgetId TEXT NOT NULL,
      gridType TEXT NOT NULL CHECK(gridType IN ('large-landscape', 'large-portrait', 'small-landscape', 'small-portrait')),
      title TEXT NOT NULL,
      col INTEGER NOT NULL,
      row INTEGER NOT NULL,
      colSpan INTEGER NOT NULL,
      rowSpan INTEGER NOT NULL,
      roleMinimum TEXT NOT NULL CHECK(roleMinimum IN ('ADMIN', 'AvPowerUser', 'AvVolunteer')),
      createdAt TEXT NOT NULL,
      UNIQUE(dashboardId, widgetId, gridType)
    )
  `);
}

export { migrateMetadataTemplates, migrateDashboardSchema };
