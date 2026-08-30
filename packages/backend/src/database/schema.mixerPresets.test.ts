import { describe, it, expect } from "vitest";
import { applySchema } from "./schema.js";
import Database from "better-sqlite3";

describe("mixer_presets schema", () => {
  it("creates mixer_presets table with all expected columns", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const cols = (database.pragma("table_info(mixer_presets)") as Array<{ name: string }>).map((r) => r.name);

    expect(cols).toEqual(["id", "mixerId", "name", "sortOrder", "payload", "createdAt"]);
    database.close();
  });

  it("cascade deletes presets when parent device_connection is removed", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("mix1", "soundboard", "Main Mixer", "127.0.0.1", 10024, "{}", new Date().toISOString());

    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p1", "mix1", "Singers", 0, "{}", new Date().toISOString());
    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p2", "mix1", "Speaker", 1, "{}", new Date().toISOString());

    const before = database.prepare("SELECT COUNT(*) as count FROM mixer_presets WHERE mixerId = ?").get("mix1") as { count: number };
    expect(before.count).toBe(2);

    database.prepare("DELETE FROM device_connections WHERE id = ?").run("mix1");

    const after = database.prepare("SELECT COUNT(*) as count FROM mixer_presets WHERE mixerId = ?").get("mix1") as { count: number };
    expect(after.count).toBe(0);

    database.close();
  });

  it("sortOrder determines preset ordering", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("mix1", "soundboard", "Mixer", "127.0.0.1", 10024, "{}", new Date().toISOString());

    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p3", "mix1", "Third", 2, "{}", new Date().toISOString());
    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p1", "mix1", "First", 0, "{}", new Date().toISOString());
    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p2", "mix1", "Second", 1, "{}", new Date().toISOString());

    const presets = database.prepare("SELECT name FROM mixer_presets WHERE mixerId = ? ORDER BY sortOrder").all("mix1") as Array<{ name: string }>;

    expect(presets.map((p) => p.name)).toEqual(["First", "Second", "Third"]);

    database.close();
  });

  it("idx_mixer_presets_mixer index exists", () => {
    const database = new Database(":memory:");
    applySchema(database);

    const indexes = database.prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'mixer_presets'").all() as Array<{ name: string }>;

    expect(indexes.map((i) => i.name)).toContain("idx_mixer_presets_mixer");

    database.close();
  });

  it("payload stores and round-trips a JSON address→value map", () => {
    const database = new Database(":memory:");
    database.pragma("foreign_keys = ON");
    applySchema(database);

    database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run("mix1", "soundboard", "Mixer", "127.0.0.1", 10024, "{}", new Date().toISOString());

    const payload = JSON.stringify({ "/ch/01/mix/fader": 0.75, "/ch/01/mix/on": 1, "/headamp/000/gain": 12 });
    database
      .prepare("INSERT INTO mixer_presets (id, mixerId, name, sortOrder, payload, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run("p1", "mix1", "Singers", 0, payload, new Date().toISOString());

    const row = database.prepare("SELECT payload FROM mixer_presets WHERE id = ?").get("p1") as { payload: string };
    expect(JSON.parse(row.payload)).toEqual({ "/ch/01/mix/fader": 0.75, "/ch/01/mix/on": 1, "/headamp/000/gain": 12 });

    database.close();
  });
});
