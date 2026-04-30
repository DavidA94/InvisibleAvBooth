import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { PlatformConfigDao } from "./platformConfigDao.js";
import type { UpsertPlatformInput } from "./platformConfigDao.js";
import { decrypt } from "../crypto.js";

beforeAll(() => {
  process.env["DEVICE_SECRET_KEY"] = "a".repeat(64);
});

function makeDatabase(): Database.Database {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  return database;
}

const YOUTUBE_INPUT: UpsertPlatformInput = {
  platformType: "youtube",
  label: "Main YouTube",
  accessToken: "yt-access-token",
  refreshToken: "yt-refresh-token",
  tokenExpiresAt: "2026-12-31T00:00:00Z",
  metadata: { clientId: "yt-client-id", clientSecret: "yt-secret" },
};

const FACEBOOK_INPUT: UpsertPlatformInput = {
  platformType: "facebook",
  label: "Church Page",
  accessToken: "fb-page-token",
  metadata: { pageId: "123456" },
};

describe("PlatformConfigDao", () => {
  let database: Database.Database;
  let dao: PlatformConfigDao;

  beforeEach(() => {
    database = makeDatabase();
    dao = new PlatformConfigDao(database);
  });

  describe("upsert (insert)", () => {
    it("creates a new platform config and returns decrypted tokens", () => {
      const result = dao.upsert(YOUTUBE_INPUT);
      expect(result.platformType).toBe("youtube");
      expect(result.label).toBe("Main YouTube");
      expect(result.accessToken).toBe("yt-access-token");
      expect(result.refreshToken).toBe("yt-refresh-token");
      expect(result.tokenExpiresAt).toBe("2026-12-31T00:00:00Z");
      expect(result.metadata).toEqual({ clientId: "yt-client-id", clientSecret: "yt-secret" });
      expect(result.enabled).toBe(true);
      expect(result.id).toBeTruthy();
    });

    it("stores tokens encrypted in the database", () => {
      const result = dao.upsert(YOUTUBE_INPUT);
      const raw = database.prepare("SELECT encryptedAccessToken FROM streaming_platforms WHERE id = ?").get(result.id) as {
        encryptedAccessToken: string;
      };
      // Raw value is encrypted — not the plaintext
      expect(raw.encryptedAccessToken).not.toBe("yt-access-token");
      // But decrypting it yields the original
      expect(decrypt(raw.encryptedAccessToken)).toBe("yt-access-token");
    });

    it("handles null refreshToken", () => {
      const result = dao.upsert(FACEBOOK_INPUT);
      expect(result.refreshToken).toBeUndefined();
    });
  });

  describe("upsert (update)", () => {
    it("updates existing config when platformType + label match", () => {
      const first = dao.upsert(YOUTUBE_INPUT);
      const updated = dao.upsert({ ...YOUTUBE_INPUT, accessToken: "new-token" });
      expect(updated.id).toBe(first.id);
      expect(updated.accessToken).toBe("new-token");
    });
  });

  describe("getAll", () => {
    it("returns all platform configs", () => {
      dao.upsert(YOUTUBE_INPUT);
      dao.upsert(FACEBOOK_INPUT);
      const all = dao.getAll();
      expect(all).toHaveLength(2);
    });

    it("returns empty array when no configs exist", () => {
      expect(dao.getAll()).toEqual([]);
    });
  });

  describe("getByType", () => {
    it("filters by platform type", () => {
      dao.upsert(YOUTUBE_INPUT);
      dao.upsert(FACEBOOK_INPUT);
      const youtube = dao.getByType("youtube");
      expect(youtube).toHaveLength(1);
      expect(youtube[0]!.platformType).toBe("youtube");
    });
  });

  describe("getById", () => {
    it("returns config by id", () => {
      const created = dao.upsert(YOUTUBE_INPUT);
      const found = dao.getById(created.id);
      expect(found).not.toBeNull();
      expect(found!.accessToken).toBe("yt-access-token");
    });

    it("returns null for unknown id", () => {
      expect(dao.getById("nonexistent")).toBeNull();
    });
  });

  describe("delete", () => {
    it("removes a platform config", () => {
      const created = dao.upsert(YOUTUBE_INPUT);
      expect(dao.delete(created.id)).toBe(true);
      expect(dao.getById(created.id)).toBeNull();
    });

    it("returns false for unknown id", () => {
      expect(dao.delete("nonexistent")).toBe(false);
    });
  });

  describe("updateTokens", () => {
    it("updates only token fields", () => {
      const created = dao.upsert(YOUTUBE_INPUT);
      dao.updateTokens(created.id, "refreshed-access", "refreshed-refresh", "2027-01-01T00:00:00Z");
      const updated = dao.getById(created.id)!;
      expect(updated.accessToken).toBe("refreshed-access");
      expect(updated.refreshToken).toBe("refreshed-refresh");
      expect(updated.tokenExpiresAt).toBe("2027-01-01T00:00:00Z");
      // Other fields unchanged
      expect(updated.label).toBe("Main YouTube");
    });

    it("clears refreshToken when not provided", () => {
      const created = dao.upsert(YOUTUBE_INPUT);
      dao.updateTokens(created.id, "new-access");
      const updated = dao.getById(created.id)!;
      expect(updated.refreshToken).toBeUndefined();
    });
  });

  describe("enabled flag", () => {
    it("defaults to enabled", () => {
      const result = dao.upsert(YOUTUBE_INPUT);
      expect(result.enabled).toBe(true);
    });

    it("respects explicit enabled=false", () => {
      const result = dao.upsert({ ...YOUTUBE_INPUT, enabled: false });
      expect(result.enabled).toBe(false);
    });
  });
});
