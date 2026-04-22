import { BIBLE_REFERENCES } from "./bibleReferences.js";

/** Maximum number of chapters any book has (Psalms = 150). */
export const MAX_CHAPTERS = 150;

/** Maximum number of verses any chapter has (Psalm 119 = 176). */
export const MAX_VERSES = 176;

/** Returns sorted chapter numbers for a book, or 1..MAX_CHAPTERS if bookId is null/invalid. */
export function getChaptersForBook(bookId: number | null): number[] {
  if (!bookId) return rangeInclusive(1, MAX_CHAPTERS);
  const bookData = BIBLE_REFERENCES[bookId];
  if (!bookData) return rangeInclusive(1, MAX_CHAPTERS);
  return Object.keys(bookData).map(Number).sort((a, b) => a - b);
}

/**
 * Returns the min and max valid verse numbers.
 * - No book: 1..MAX_VERSES
 * - Book only: 1..max(verse count across all chapters)
 * - Book + chapter: exact range for that chapter
 */
export function getVerseRange(bookId: number | null, chapter: number | null): { min: number; max: number } {
  if (!bookId) return { min: 0, max: MAX_VERSES };
  const bookData = BIBLE_REFERENCES[bookId];
  if (!bookData) return { min: 0, max: MAX_VERSES };

  if (chapter) {
    const verses = bookData[chapter];
    if (!verses || verses.length === 0) return { min: 0, max: MAX_VERSES };
    return { min: Math.min(...verses), max: Math.max(...verses) };
  }

  const allVerses = Object.values(bookData).flat();
  return { min: Math.min(...allVerses), max: Math.max(...allVerses) };
}

/** Returns true if the chapter exists in the given book. */
export function isChapterValid(bookId: number, chapter: number): boolean {
  const bookData = BIBLE_REFERENCES[bookId];
  return !!bookData && chapter in bookData;
}

/** Returns true if the verse exists in any chapter of the given book. */
export function isVerseValidForBook(bookId: number, verse: number): boolean {
  const bookData = BIBLE_REFERENCES[bookId];
  if (!bookData) return false;
  return Object.values(bookData).some((verses) => verses.includes(verse));
}

/** Returns true if the verse exists in the specific chapter of the given book. */
export function isVerseValidForChapter(bookId: number, chapter: number, verse: number): boolean {
  const bookData = BIBLE_REFERENCES[bookId];
  if (!bookData) return false;
  const verses = bookData[chapter];
  return !!verses && verses.includes(verse);
}

function rangeInclusive(start: number, end: number): number[] {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
