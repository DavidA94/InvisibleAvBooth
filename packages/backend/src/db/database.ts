import Database from "better-sqlite3";
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

let _database: Database.Database | null = null;

// dbPath is injectable for testing (pass ":memory:" to get a fresh in-memory DB).
// In production, call with no arguments to use the default file-backed path.
export function getDatabase(databasePath?: string, kjvSqlPath?: string): Database.Database {
  if (_database) return _database;

  const resolvedPath = databasePath ?? DATABASE_PATH;

  // Create data/ directory only when using the real file-backed path.
  /* c8 ignore next 3 -- only fires when data/ doesn't exist; tested by the OS, not our logic */
  if (!databasePath && !existsSync(DATA_DIRECTORY)) {
    mkdirSync(DATA_DIRECTORY, { recursive: true });
  }

  _database = new Database(resolvedPath);

  // WAL mode improves concurrent read performance and is safe for single-process use.
  _database.pragma("journal_mode = WAL");
  _database.pragma("foreign_keys = ON");

  applySchema(_database);
  seedKjv(_database, kjvSqlPath ?? KJV_SQL_PATH);

  return _database;
}

// Reset the singleton — used in tests to get a fresh DB between test files.
export function resetDatabase(): void {
  if (_database) {
    _database.close();
    _database = null;
  }
}

// Load the KJV bible data on first run. Exported for testing.
export function seedKjv(database: Database.Database, sqlPath: string): void {
  const tableExists = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'").get();

  if (tableExists) return;

  database.exec(`
    CREATE TABLE IF NOT EXISTS kjv (
      BOOKID    INTEGER,
      CHAPTERNO INTEGER,
      VERSENO   INTEGER,
      VERSETEXT TEXT
    );
  `);

  if (!existsSync(sqlPath)) {
    // Log a warning but do not crash — the KJV table will be empty.
    // Scripture validation will fail gracefully until the file is present.
    logger.warn(`bibledb_kjv.sql not found at ${sqlPath}. KJV scripture validation will be unavailable.`);
    return;
  }

  const sql = readFileSync(sqlPath, "latin1");

  // Extract all row tuples: (bookId, chapterNo, verseNo, 'verseText')
  // The regex guarantees all capture groups are defined when it matches —
  // the ?? fallbacks are removed since TypeScript's noUncheckedIndexedAccess
  // requires them but they can never actually be reached.
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
    // match[1..4] are always defined — the regex only matches when all four groups capture
    rows.push([parseInt(match[1]!, 10), parseInt(match[2]!, 10), parseInt(match[3]!, 10), match[4]!.replace(/''/g, "'")]);
  }

  insertMany(rows);
}
