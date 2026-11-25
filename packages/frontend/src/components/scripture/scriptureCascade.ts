/**
 * Pure logic for cascading resets when scripture reference selections change.
 * Extracted from ScriptureReferenceInput for testability.
 */
import { isChapterValid, isVerseValidForBook, isVerseValidForChapter } from "@invisible-av-booth/shared";

export interface ScriptureState {
  bookId: number | null;
  chapter: number | null;
  verse: number | null;
  verseEnd: number | null;
}

export interface ScriptureCascadeResult {
  chapter: number | null | undefined; // undefined = no change
  verse: number | null | undefined;
  verseEnd: number | null | undefined;
}

/** Compute which fields to reset when the book changes. */
export function cascadeBookChange(newBookId: number | null, current: Omit<ScriptureState, "bookId">): ScriptureCascadeResult {
  if (!newBookId) return { chapter: undefined, verse: undefined, verseEnd: undefined };

  if (current.chapter && !isChapterValid(newBookId, current.chapter)) {
    return { chapter: null, verse: null, verseEnd: null };
  }

  if (current.verse) {
    const verseValid = current.chapter ? isVerseValidForChapter(newBookId, current.chapter, current.verse) : isVerseValidForBook(newBookId, current.verse);
    if (!verseValid) {
      return { chapter: undefined, verse: null, verseEnd: null };
    }
  }

  if (current.verseEnd) {
    const verseEndValid = current.chapter
      ? isVerseValidForChapter(newBookId, current.chapter, current.verseEnd)
      : isVerseValidForBook(newBookId, current.verseEnd);
    if (!verseEndValid) {
      return { chapter: undefined, verse: undefined, verseEnd: null };
    }
  }

  return { chapter: undefined, verse: undefined, verseEnd: undefined };
}

/** Compute which fields to reset when the chapter changes. */
export function cascadeChapterChange(
  bookId: number | null,
  newChapter: number | null,
  current: Pick<ScriptureState, "verse" | "verseEnd">,
): ScriptureCascadeResult {
  if (!newChapter || !bookId) return { chapter: undefined, verse: undefined, verseEnd: undefined };

  if (current.verse && !isVerseValidForChapter(bookId, newChapter, current.verse)) {
    return { chapter: undefined, verse: null, verseEnd: null };
  }

  if (current.verseEnd && !isVerseValidForChapter(bookId, newChapter, current.verseEnd)) {
    return { chapter: undefined, verse: undefined, verseEnd: null };
  }

  return { chapter: undefined, verse: undefined, verseEnd: undefined };
}

/** Compute verse/verseEnd swap when verse changes. */
export function cascadeVerseChange(newVerse: number | null, verseEnd: number | null): { verse: number; verseEnd: number } | null {
  if (newVerse && verseEnd && newVerse > verseEnd) {
    return { verse: verseEnd, verseEnd: newVerse };
  }
  return null;
}

/** Compute verse/verseEnd swap when verseEnd changes. */
export function cascadeVerseEndChange(verse: number | null, newVerseEnd: number | null): { verse: number; verseEnd: number } | null {
  if (newVerseEnd && verse && newVerseEnd < verse) {
    return { verse: newVerseEnd, verseEnd: verse };
  }
  return null;
}

// ── Auto-advance (Req 19.11) ──────────────────────────────────────────────────

export type ScriptureField = "book" | "chapter" | "verse" | "verseEnd";

const NEXT_FIELD: Record<ScriptureField, Exclude<ScriptureField, "book"> | null> = {
  book: "chapter",
  chapter: "verse",
  verse: "verseEnd",
  verseEnd: null,
};

/**
 * Which field should receive focus after the volunteer picks a value, so the on-screen keyboard
 * stays open through "John ⏎ 3 ⏎ 16 ⏎ 18 ⏎" instead of closing and reopening per field.
 *
 * Rules: only the immediately next field, and only if it is empty AFTER cascade resets (pass the
 * post-cascade values). A clear (`selected === null`) never advances. Focus never skips past a filled
 * field: if the next field has a value the volunteer is correcting one field, so focus stays put.
 */
export function nextFieldToFocus(
  changed: ScriptureField,
  selected: number | null,
  after: Pick<ScriptureState, "chapter" | "verse" | "verseEnd">,
): Exclude<ScriptureField, "book"> | null {
  if (selected === null) return null;
  const next = NEXT_FIELD[changed];
  if (next === null) return null;
  return after[next] === null ? next : null;
}
