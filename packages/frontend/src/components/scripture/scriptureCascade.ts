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
