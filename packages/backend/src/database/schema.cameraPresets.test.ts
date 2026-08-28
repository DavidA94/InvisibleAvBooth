import { describe, it, expect } from "vitest";
import { applySchema } from "./schema.js";
import Database from "better-sqlite3";

describe("camera_presets schema", () => {
  it("creates camera_presets table with all expected columns", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const cols = (database.pragma("table_info(camera_presets)") as Array<{ name: string }>).map((r) => r.name);

    expect(cols).toEqual([
      "id",
      "cameraId",
      "name",
      "sortOrder",
      "storedOnCamera",
      "cameraPresetSlot",
      "pan",
      "tilt",
      "zoom",
      "focus",
      "autoFocus",
      "aiTracking",
      "aiTilt",
      "aiZoom",
      "createdAt",
    ]);
    database.close();
  });

  it("cascade deletes presets when parent device_connection is removed", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    // Insert a device
    database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("cam1", "camera-ptz", "Main Camera", "127.0.0.1", 5500, "{}", new Date().toISOString());

    // Insert presets
    database
      .prepare("INSERT INTO camera_presets (id, cameraId, name, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run("p1", "cam1", "Wide", 0, new Date().toISOString());
    database
      .prepare("INSERT INTO camera_presets (id, cameraId, name, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run("p2", "cam1", "Close", 1, new Date().toISOString());

    // Verify presets exist
    const before = database.prepare("SELECT COUNT(*) as count FROM camera_presets WHERE cameraId = ?").get("cam1") as { count: number };
    expect(before.count).toBe(2);

    // Delete the device
    database.prepare("DELETE FROM device_connections WHERE id = ?").run("cam1");

    // Presets should be gone
    const after = database.prepare("SELECT COUNT(*) as count FROM camera_presets WHERE cameraId = ?").get("cam1") as { count: number };
    expect(after.count).toBe(0);

    database.close();
  });

  it("sortOrder determines preset ordering", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("cam1", "camera-ptz", "Camera", "127.0.0.1", 5500, "{}", new Date().toISOString());

    database
      .prepare("INSERT INTO camera_presets (id, cameraId, name, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run("p3", "cam1", "Third", 2, new Date().toISOString());
    database
      .prepare("INSERT INTO camera_presets (id, cameraId, name, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run("p1", "cam1", "First", 0, new Date().toISOString());
    database
      .prepare("INSERT INTO camera_presets (id, cameraId, name, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run("p2", "cam1", "Second", 1, new Date().toISOString());

    const presets = database.prepare("SELECT name FROM camera_presets WHERE cameraId = ? ORDER BY sortOrder").all("cam1") as Array<{ name: string }>;

    expect(presets.map((p) => p.name)).toEqual(["First", "Second", "Third"]);

    database.close();
  });

  it("idx_camera_presets_camera index exists", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'camera_presets'").all() as Array<{ name: string }>;

    expect(indexes.map((i) => i.name)).toContain("idx_camera_presets_camera");

    database.close();
  });

  it("nullable position columns accept NULL values", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("cam1", "camera-ptz", "Camera", "127.0.0.1", 5500, "{}", new Date().toISOString());

    expect(() => {
      database
        .prepare(
          "INSERT INTO camera_presets (id, cameraId, name, sortOrder, pan, tilt, zoom, focus, cameraPresetSlot, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("p1", "cam1", "Partial", 0, null, null, 0.5, null, null, new Date().toISOString());
    }).not.toThrow();

    const row = database.prepare("SELECT pan, tilt, zoom, focus, cameraPresetSlot FROM camera_presets WHERE id = ?").get("p1") as {
      pan: number | null;
      tilt: number | null;
      zoom: number | null;
      focus: number | null;
      cameraPresetSlot: number | null;
    };
    expect(row.pan).toBeNull();
    expect(row.tilt).toBeNull();
    expect(row.zoom).toBe(0.5);
    expect(row.focus).toBeNull();
    expect(row.cameraPresetSlot).toBeNull();

    database.close();
  });
});
