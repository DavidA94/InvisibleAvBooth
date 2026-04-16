import BetterSqlite3 from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { applySchema } from "./schema.js";
import { logger } from "../logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve paths relative to the backend package root (two levels up from src/database/).
// This ensures data/ and the sql file are always found regardless of the working
// directory the process is started from.
const PACKAGE_ROOT = join(__dirname, "..", "..");
const DATA_DIRECTORY = join(PACKAGE_ROOT, "data");
const DATABASE_PATH = join(DATA_DIRECTORY, "app.db");
const KJV_SQL_PATH = join(PACKAGE_ROOT, "..", "..", "bibledb_kjv.sql");

// Static class — no instance data needed; the database is a process-level singleton.
// All methods are static; the private #instance field holds the single connection.
export class DatabaseManager {
  static #instance: BetterSqlite3.Database | null = null;

  // databasePath is injectable for testing (pass ":memory:" to get a fresh in-memory DB).
  // In production, call with no arguments to use the default file-backed path.
  static getDatabase(databasePath?: string, kjvSqlPath?: string): BetterSqlite3.Database {
    if (DatabaseManager.#instance) return DatabaseManager.#instance;

    const resolvedPath = databasePath ?? DATABASE_PATH;

    // Create data/ directory only when using the real file-backed path.
    /* c8 ignore next 3 -- only fires when data/ doesn't exist; tested by the OS, not our logic */
    if (!databasePath && !existsSync(DATA_DIRECTORY)) {
      mkdirSync(DATA_DIRECTORY, { recursive: true });
    }

    DatabaseManager.#instance = new BetterSqlite3(resolvedPath);

    // WAL mode improves concurrent read performance and is safe for single-process use.
    DatabaseManager.#instance.pragma("journal_mode = WAL");
    DatabaseManager.#instance.pragma("foreign_keys = ON");

    applySchema(DatabaseManager.#instance);
    DatabaseManager.seedKjv(DatabaseManager.#instance, kjvSqlPath ?? KJV_SQL_PATH);

    return DatabaseManager.#instance;
  }

  // Reset the singleton — used in tests to get a fresh database between test files.
  static resetDatabase(): void {
    if (DatabaseManager.#instance) {
      DatabaseManager.#instance.close();
      DatabaseManager.#instance = null;
    }
  }

  // Load the KJV bible data on first run. The schema (CREATE TABLE) is handled by
  // applySchema() — this method only inserts rows, skipping if data already exists.
  //
  // The SQL file is a MySQL dump that uses MySQL-specific syntax (backtick identifiers,
  // ENGINE=MyISAM, /*!...*/ comments, multi-row INSERT VALUES). We parse it manually
  // rather than executing it directly because SQLite does not understand MySQL dialect.
  //
  // Strategy: extract all row tuples from the INSERT statements and bulk-insert them
  // using a prepared statement inside a transaction for performance —
  // 31,000+ rows inserted one-by-one without a transaction would be extremely slow.
  static seedKjv(database: BetterSqlite3.Database, sqlPath: string): void {
    const hasData = database.prepare("SELECT 1 FROM kjv LIMIT 1").get();
    if (hasData) return;

    if (!existsSync(sqlPath)) {
      // Log a warning but do not crash — the KJV table will be empty.
      // Scripture validation will fail gracefully until the file is present.
      logger.warn(`bibledb_kjv.sql not found at ${sqlPath}. KJV scripture validation will be unavailable.`);
      return;
    }

    const sql = readFileSync(sqlPath, "latin1");

    // Extract all row tuples: (bookId, chapterNo, verseNo, 'verseText')
    // The regex guarantees all capture groups are defined when it matches.
    const rowPattern = /\((\d+),\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\)/g;

    const insert = database.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)");

    const insertMany = database.transaction((rows: [number, number, number, string][]) => {
      for (const [bookId, chapter, verse, text] of rows) {
        insert.run(bookId, chapter, verse, text.replace(/''/g, "'"));
      }
    });

    const rows: [number, number, number, string][] = [];
    let match: RegExpExecArray | null;

    while ((match = rowPattern.exec(sql)) !== null) {
      rows.push([parseInt(match[1]!, 10), parseInt(match[2]!, 10), parseInt(match[3]!, 10), match[4]!.replace(/''/g, "'")]);
    }

    insertMany(rows);
  }
}

// Convenience exports so call sites don't need to reference DatabaseManager directly.
export const getDatabase = DatabaseManager.getDatabase.bind(DatabaseManager);
export const resetDatabase = DatabaseManager.resetDatabase.bind(DatabaseManager);
export const seedKjv = DatabaseManager.seedKjv.bind(DatabaseManager);
