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
  // verse 0 with no verseEnd → chapter only (e.g., "Psalm 23")
  if (ref.verse === 0 && !ref.verseEnd) return `${bookName} ${ref.chapter}`;
  // verse 0 with verseEnd → range starting at 1 (e.g., "Psalm 23:1-2")
  const displayVerse = ref.verse === 0 ? 1 : ref.verse;
  const base = `${bookName} ${ref.chapter}:${displayVerse}`;
  return ref.verseEnd ? `${base}-${ref.verseEnd}` : base;
}

/**
 * Interpolates a template string with manifest fields.
 * Both frontend and backend call this — single source of truth.
 */
export function interpolateTemplate(manifest: SessionManifestFields, template?: string, verseTextResolver?: (ref: ScriptureReference) => string): string {
  const t = template?.trim() || DEFAULT_TEMPLATE;
  const today = new Date().toISOString().slice(0, 10);
  const speaker = manifest.speaker?.trim() || "[No Speaker]";
  const title = manifest.title?.trim() || "[No Title]";
  const scripture = manifest.scripture ? formatScripture(manifest.scripture) : "[No Scripture]";

  let result = t
    .replace(/\{Date\}/g, today)
    .replace(/\{Speaker\}/g, speaker)
    .replace(/\{Title\}/g, title)
    .replace(/\{Scripture\}/g, scripture);

  result = result.replace(/\{verseText\}/g, () => {
    if (!manifest.scripture) return "[No Verse Text]";
    if (!verseTextResolver) {
      return `${formatScripture(manifest.scripture)} (full text included on stream)`;
    }
    return verseTextResolver(manifest.scripture);
  });

  return result;
}

/** @deprecated Use interpolateTemplate instead */
export const interpolateStreamTitle = interpolateTemplate;
