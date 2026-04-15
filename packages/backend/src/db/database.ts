import Database from "better-sqlite3";
import { existsSync, mkdirSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { applySchema } from "./schema.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Resolve paths relative to the backend package root (two levels up from src/db/).
// This ensures data/ and the sql file are always found regardless of the working
// directory the process is started from.
const PACKAGE_ROOT = join(__dirname, "..", "..");
const DATA_DIR = join(PACKAGE_ROOT, "data");
const DB_PATH = join(DATA_DIR, "app.db");
const KJV_SQL_PATH = join(PACKAGE_ROOT, "..", "..", "bibledb_kjv.sql");

let _db: Database.Database | null = null;

// dbPath is injectable for testing (pass ":memory:" to get a fresh in-memory DB).
// In production, call with no arguments to use the default file-backed path.
export function getDb(dbPath?: string, kjvSqlPath?: string): Database.Database {
  if (_db) return _db;

  /* c8 ignore next -- DB_PATH fallback only used in production, tests always pass :memory: */
  const resolvedPath = dbPath ?? DB_PATH;

  // Create data/ directory only when using the real file-backed path.
  /* c8 ignore next 3 */
  if (!dbPath && !existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  _db = new Database(resolvedPath);

  // WAL mode improves concurrent read performance and is safe for single-process use.
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  applySchema(_db);
  seedKjv(_db, kjvSqlPath ?? KJV_SQL_PATH);

  return _db;
}

// Reset the singleton — used in tests to get a fresh DB between test files.
export function resetDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// Load the KJV bible data on first run. The SQL file is a MySQL dump that uses
// MySQL-specific syntax (backtick identifiers, ENGINE=MyISAM, /*!...*/ comments,
// multi-row INSERT VALUES). We parse it manually rather than executing it directly
// because SQLite does not understand MySQL dialect.
//
// Strategy: extract all row tuples from the INSERT statements and bulk-insert them
// using a prepared statement. This is done inside a transaction for performance —
// 31,000+ rows inserted one-by-one without a transaction would be extremely slow.
function seedKjv(db: Database.Database, sqlPath: string): void {
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='kjv'")
    .get();

  if (tableExists) return;

  db.exec(`
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
    console.warn(`[WARN] bibledb_kjv.sql not found at ${sqlPath}. KJV scripture validation will be unavailable.`);
    return;
  }

  const sql = readFileSync(sqlPath, "latin1");

  // Extract all row tuples: (bookId, chapterNo, verseNo, 'verseText')
  // The regex matches each row tuple in the multi-row INSERT VALUES list.
  // We use a non-greedy match for the verse text to handle embedded single quotes
  // that are escaped as '' in the SQL dump.
  const rowPattern = /\((\d+),\s*(\d+),\s*(\d+),\s*'((?:[^']|'')*)'\)/g;

  const insert = db.prepare(
    "INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)",
  );

  const insertMany = db.transaction((rows: [number, number, number, string][]) => {
    for (const [bookId, chapter, verse, text] of rows) {
      insert.run(bookId, chapter, verse, text.replace(/''/g, "'"));
    }
  });

  const rows: [number, number, number, string][] = [];
  let match: RegExpExecArray | null;

  while ((match = rowPattern.exec(sql)) !== null) {
    /* c8 ignore next 4 -- regex capture groups are always defined when the pattern matches */
    const bookId = parseInt(match[1] ?? "0", 10);
    const chapter = parseInt(match[2] ?? "0", 10);
    const verse = parseInt(match[3] ?? "0", 10);
    const text = match[4] ?? "";
    rows.push([bookId, chapter, verse, text]);
  }

  insertMany(rows);
}
