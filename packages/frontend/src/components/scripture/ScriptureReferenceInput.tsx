import { useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import type { GroupBase } from "react-select";
import {
  BIBLE_BOOKS,
  MAX_CHAPTERS,
  MAX_VERSES,
  getChaptersForBook,
  getVerseRange,
  isChapterValid,
  isVerseValidForBook,
  isVerseValidForChapter,
} from "@invisible-av-booth/shared";
import { darkSelectStyles } from "../../theme/selectStyles";

interface NumberOption {
  value: number;
  label: string;
}

interface BookOption {
  value: number;
  label: string;
}

interface BookGroup extends GroupBase<BookOption> {
  label: string;
  options: BookOption[];
}

interface ScriptureReferenceInputProps {
  bookId: number | null;
  chapter: number | null;
  verse: number | null;
  verseEnd: number | null;
  onBookChange: (bookId: number | null) => void;
  onChapterChange: (chapter: number | null) => void;
  onVerseChange: (verse: number | null) => void;
  onVerseEndChange: (verseEnd: number | null) => void;
}

const OLD_TESTAMENT_IDS = Array.from({ length: 39 }, (_, i) => i + 1);
const NEW_TESTAMENT_IDS = Array.from({ length: 27 }, (_, i) => i + 40);

const BOOK_GROUPS: BookGroup[] = [
  { label: "Old Testament", options: OLD_TESTAMENT_IDS.map((id) => ({ value: id, label: BIBLE_BOOKS[id] ?? "" })) },
  { label: "New Testament", options: NEW_TESTAMENT_IDS.map((id) => ({ value: id, label: BIBLE_BOOKS[id] ?? "" })) },
];

const DEFAULT_CHAPTER_OPTIONS: NumberOption[] = Array.from({ length: MAX_CHAPTERS }, (_, i) => ({ value: i + 1, label: String(i + 1) }));
const DEFAULT_VERSE_OPTIONS: NumberOption[] = Array.from({ length: MAX_VERSES + 1 }, (_, i) => ({ value: i, label: String(i) }));

function toNumberOptions(numbers: number[]): NumberOption[] {
  return numbers.map((n) => ({ value: n, label: String(n) }));
}

function buildChapterOptions(bookId: number | null): NumberOption[] {
  if (!bookId) return DEFAULT_CHAPTER_OPTIONS;
  return toNumberOptions(getChaptersForBook(bookId));
}

function buildVerseOptions(bookId: number | null, chapter: number | null): NumberOption[] {
  if (!bookId) return DEFAULT_VERSE_OPTIONS;
  const { min, max } = getVerseRange(bookId, chapter);
  return Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }));
}

const bookStyles = darkSelectStyles<BookOption>();
const numberStyles = darkSelectStyles<NumberOption>();

export function ScriptureReferenceInput({
  bookId,
  chapter,
  verse,
  verseEnd,
  onBookChange,
  onChapterChange,
  onVerseChange,
  onVerseEndChange,
}: ScriptureReferenceInputProps): ReactNode {
  const chapterOptions = useMemo(() => buildChapterOptions(bookId), [bookId]);
  const verseOptions = useMemo(() => buildVerseOptions(bookId, chapter), [bookId, chapter]);
  const verseEndOptions = useMemo(() => buildVerseOptions(bookId, chapter), [bookId, chapter]);

  const handleBookChange = useCallback(
    (option: BookOption | null) => {
      const newBookId = option?.value ?? null;
      onBookChange(newBookId);

      if (newBookId) {
        if (chapter && !isChapterValid(newBookId, chapter)) {
          onChapterChange(null);
          onVerseChange(null);
          onVerseEndChange(null);
          return;
        }
        if (verse) {
          const verseValid = chapter
            ? isVerseValidForChapter(newBookId, chapter, verse)
            : isVerseValidForBook(newBookId, verse);
          if (!verseValid) {
            onVerseChange(null);
            onVerseEndChange(null);
            return;
          }
        }
        if (verseEnd) {
          const verseEndValid = chapter
            ? isVerseValidForChapter(newBookId, chapter, verseEnd)
            : isVerseValidForBook(newBookId, verseEnd);
          if (!verseEndValid) {
            onVerseEndChange(null);
          }
        }
      }
    },
    [chapter, verse, verseEnd, onBookChange, onChapterChange, onVerseChange, onVerseEndChange],
  );

  const handleChapterChange = useCallback(
    (option: NumberOption | null) => {
      const newChapter = option?.value ?? null;
      onChapterChange(newChapter);

      if (newChapter && bookId) {
        if (verse && !isVerseValidForChapter(bookId, newChapter, verse)) {
          onVerseChange(null);
          onVerseEndChange(null);
          return;
        }
        if (verseEnd && !isVerseValidForChapter(bookId, newChapter, verseEnd)) {
          onVerseEndChange(null);
        }
      }
    },
    [bookId, verse, verseEnd, onChapterChange, onVerseChange, onVerseEndChange],
  );

  const handleVerseChange = useCallback(
    (option: NumberOption | null) => {
      const newVerse = option?.value ?? null;
      onVerseChange(newVerse);

      if (newVerse && verseEnd && newVerse > verseEnd) {
        onVerseChange(verseEnd);
        onVerseEndChange(newVerse);
      }
    },
    [verseEnd, onVerseChange, onVerseEndChange],
  );

  const handleVerseEndChange = useCallback(
    (option: NumberOption | null) => {
      const newVerseEnd = option?.value ?? null;
      onVerseEndChange(newVerseEnd);

      if (newVerseEnd && verse && newVerseEnd < verse) {
        onVerseChange(newVerseEnd);
        onVerseEndChange(verse);
      }
    },
    [verse, onVerseChange, onVerseEndChange],
  );

  const selectedBook = useMemo(() => {
    if (!bookId) return null;
    return { value: bookId, label: BIBLE_BOOKS[bookId] ?? "" };
  }, [bookId]);

  const selectedChapter = useMemo(() => (chapter ? { value: chapter, label: String(chapter) } : null), [chapter]);
  const selectedVerse = useMemo(() => (verse ? { value: verse, label: String(verse) } : null), [verse]);
  const selectedVerseEnd = useMemo(() => (verseEnd ? { value: verseEnd, label: String(verseEnd) } : null), [verseEnd]);

  return (
    <>
      <div data-testid="scripture-book-select">
        <Select<BookOption, false, BookGroup>
          options={BOOK_GROUPS}
          value={selectedBook}
          onChange={handleBookChange}
          placeholder="Book"
          isClearable
          isSearchable
          styles={bookStyles}
          menuPortalTarget={document.body}
        />
      </div>
      <div className="manifest-scripture-row">
        <div className="fill-remaining" data-testid="scripture-chapter-select">
          <Select<NumberOption>
            options={chapterOptions}
            value={selectedChapter}
            onChange={handleChapterChange}
            placeholder="Ch"
            isClearable
            isSearchable={false}
            styles={numberStyles}
            menuPortalTarget={document.body}
          />
        </div>
        <div className="fill-remaining" data-testid="scripture-verse-select">
          <Select<NumberOption>
            options={verseOptions}
            value={selectedVerse}
            onChange={handleVerseChange}
            placeholder="Verse"
            isClearable
            isSearchable={false}
            styles={numberStyles}
            menuPortalTarget={document.body}
          />
        </div>
        <div className="fill-remaining" data-testid="scripture-verse-end-select">
          <Select<NumberOption>
            options={verseEndOptions}
            value={selectedVerseEnd}
            onChange={handleVerseEndChange}
            placeholder="End"
            isClearable
            isSearchable={false}
            styles={numberStyles}
            menuPortalTarget={document.body}
          />
        </div>
      </div>
    </>
  );
}
