/**
 * DAO for the streaming_platforms table.
 *
 * Tokens are stored encrypted at rest via AES-256-GCM (crypto.ts).
 * This DAO decrypts tokens on read and encrypts on write — callers
 * always work with plaintext tokens.
 */
import type { Database } from "better-sqlite3";
import { createId } from "@paralleldrive/cuid2";
import { encrypt, decrypt } from "../crypto.js";
import type { PlatformConfig } from "./platformClient.js";

/** Raw row shape from SQLite before token decryption. */
interface PlatformRow {
  id: string;
  platformType: "youtube" | "facebook";
  label: string;
  enabled: number;
  encryptedAccessToken: string;
  encryptedRefreshToken: string | null;
  tokenExpiresAt: string | null;
  metadata: string;
  createdAt: string;
}

export interface UpsertPlatformInput {
  platformType: "youtube" | "facebook";
  label: string;
  enabled?: boolean;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: string;
  metadata?: Record<string, unknown>;
}

export class PlatformConfigDao {
  constructor(private readonly database: Database) {}

  getAll(): PlatformConfig[] {
    const rows = this.database.prepare("SELECT * FROM streaming_platforms").all() as PlatformRow[];
    return rows.map((row) => this.toConfig(row));
  }

  getByType(platformType: "youtube" | "facebook"): PlatformConfig[] {
    const rows = this.database.prepare("SELECT * FROM streaming_platforms WHERE platformType = ?").all(platformType) as PlatformRow[];
    return rows.map((row) => this.toConfig(row));
  }

  getById(id: string): PlatformConfig | null {
    const row = this.database.prepare("SELECT * FROM streaming_platforms WHERE id = ?").get(id) as PlatformRow | undefined;
    return row ? this.toConfig(row) : null;
  }

  upsert(input: UpsertPlatformInput): PlatformConfig {
    const existing = this.database
      .prepare("SELECT id FROM streaming_platforms WHERE platformType = ? AND label = ?")
      .get(input.platformType, input.label) as { id: string } | undefined;

    if (existing) {
      this.database
        .prepare(
          `UPDATE streaming_platforms
           SET enabled = ?, encryptedAccessToken = ?, encryptedRefreshToken = ?,
               tokenExpiresAt = ?, metadata = ?
           WHERE id = ?`,
        )
        .run(
          input.enabled !== false ? 1 : 0,
          encrypt(input.accessToken),
          input.refreshToken ? encrypt(input.refreshToken) : null,
          input.tokenExpiresAt ?? null,
          JSON.stringify(input.metadata ?? {}),
          existing.id,
        );
      return this.getById(existing.id)!;
    }

    const id = createId();
    const createdAt = new Date().toISOString();
    this.database
      .prepare(
        `INSERT INTO streaming_platforms
         (id, platformType, label, enabled, encryptedAccessToken, encryptedRefreshToken, tokenExpiresAt, metadata, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.platformType,
        input.label,
        input.enabled !== false ? 1 : 0,
        encrypt(input.accessToken),
        input.refreshToken ? encrypt(input.refreshToken) : null,
        input.tokenExpiresAt ?? null,
        JSON.stringify(input.metadata ?? {}),
        createdAt,
      );
    return this.getById(id)!;
  }

  delete(id: string): boolean {
    const result = this.database.prepare("DELETE FROM streaming_platforms WHERE id = ?").run(id);
    return result.changes > 0;
  }

  /** Update only the token fields — used after a token refresh. */
  updateTokens(id: string, accessToken: string, refreshToken?: string, tokenExpiresAt?: string): void {
    this.database
      .prepare(
        `UPDATE streaming_platforms
         SET encryptedAccessToken = ?, encryptedRefreshToken = ?, tokenExpiresAt = ?
         WHERE id = ?`,
      )
      .run(encrypt(accessToken), refreshToken ? encrypt(refreshToken) : null, tokenExpiresAt ?? null, id);
  }

  private toConfig(row: PlatformRow): PlatformConfig {
    const config: PlatformConfig = {
      id: row.id,
      platformType: row.platformType,
      label: row.label,
      enabled: row.enabled === 1,
      accessToken: decrypt(row.encryptedAccessToken),
      tokenExpiresAt: row.tokenExpiresAt,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
      createdAt: row.createdAt,
    };
    if (row.encryptedRefreshToken) config.refreshToken = decrypt(row.encryptedRefreshToken);
    return config;
  }
}
