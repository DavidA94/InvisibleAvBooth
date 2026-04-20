import { BIBLE_BOOKS } from "./bibleBooks.js";

export interface ScriptureReference {
  bookId: number;
  chapter: number;
  verse: number;
  verseEnd?: number;
}

export interface SessionManifestFields {
  speaker?: string;
  title?: string;
  scripture?: ScriptureReference;
}

const DEFAULT_TEMPLATE = "{Date} – {Speaker} – {Title}";

export function formatScripture(ref: ScriptureReference): string {
  const bookName = BIBLE_BOOKS[ref.bookId] ?? `Book ${ref.bookId}`;
  const base = `${bookName} ${ref.chapter}:${ref.verse}`;
  return ref.verseEnd ? `${base}-${ref.verseEnd}` : base;
}

/**
 * Interpolates a stream title template with manifest fields.
 * Both frontend and backend call this — single source of truth.
 */
export function interpolateStreamTitle(manifest: SessionManifestFields, template?: string): string {
  const t = template?.trim() || DEFAULT_TEMPLATE;
  const today = new Date().toISOString().slice(0, 10);
  const speaker = manifest.speaker?.trim() || "[No Speaker]";
  const title = manifest.title?.trim() || "[No Title]";
  const scripture = manifest.scripture ? formatScripture(manifest.scripture) : "[No Scripture]";

  return t
    .replace(/\{Date\}/g, today)
    .replace(/\{Speaker\}/g, speaker)
    .replace(/\{Title\}/g, title)
    .replace(/\{Scripture\}/g, scripture);
}
