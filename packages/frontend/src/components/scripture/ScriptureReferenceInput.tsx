import { useMemo, useCallback } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import type { GroupBase } from "react-select";
import { BIBLE_BOOKS, MAX_CHAPTERS, MAX_VERSES, getChaptersForBook, getVerseRange } from "@invisible-av-booth/shared";
import { darkSelectStyles } from "../../theme/selectStyles";
import { cascadeBookChange, cascadeChapterChange, cascadeVerseChange, cascadeVerseEndChange } from "./scriptureCascade";
import {
  TEST_ID_SCRIPTURE_BOOK_SELECT,
  TEST_ID_SCRIPTURE_CHAPTER_SELECT,
  TEST_ID_SCRIPTURE_VERSE_SELECT,
  TEST_ID_SCRIPTURE_VERSE_END_SELECT,
} from "../../constants/testIds";

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
  { label: "Old Testament", options: OLD_TESTAMENT_IDS.map((id) => ({ value: id, label: BIBLE_BOOKS[id]! })) },
  { label: "New Testament", options: NEW_TESTAMENT_IDS.map((id) => ({ value: id, label: BIBLE_BOOKS[id]! })) },
];

function toNumberOptions(numbers: number[]): NumberOption[] {
  return numbers.map((n) => ({ value: n, label: String(n) }));
}

const DEFAULT_CHAPTER_OPTIONS: NumberOption[] = toNumberOptions(Array.from({ length: MAX_CHAPTERS }, (_, i) => i + 1));
const DEFAULT_VERSE_OPTIONS: NumberOption[] = toNumberOptions(Array.from({ length: MAX_VERSES + 1 }, (_, i) => i));

function buildChapterOptions(bookId: number | null): NumberOption[] {
  if (!bookId) return DEFAULT_CHAPTER_OPTIONS;
  return toNumberOptions(getChaptersForBook(bookId));
}

function buildVerseOptions(bookId: number | null, chapter: number | null): NumberOption[] {
  if (!bookId) return DEFAULT_VERSE_OPTIONS;
  const { min, max } = getVerseRange(bookId, chapter);
  return Array.from({ length: max - min + 1 }, (_, i) => ({ value: min + i, label: String(min + i) }));
}

const bookStyles = darkSelectStyles<BookOption, false, BookGroup>();
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

      const result = cascadeBookChange(newBookId, { chapter, verse, verseEnd });
      if (result.chapter !== undefined) onChapterChange(result.chapter);
      if (result.verse !== undefined) onVerseChange(result.verse);
      if (result.verseEnd !== undefined) onVerseEndChange(result.verseEnd);
    },
    [chapter, verse, verseEnd, onBookChange, onChapterChange, onVerseChange, onVerseEndChange],
  );

  const handleChapterChange = useCallback(
    (option: NumberOption | null) => {
      const newChapter = option?.value ?? null;
      onChapterChange(newChapter);

      const result = cascadeChapterChange(bookId, newChapter, { verse, verseEnd });
      if (result.verse !== undefined) onVerseChange(result.verse);
      if (result.verseEnd !== undefined) onVerseEndChange(result.verseEnd);
    },
    [bookId, verse, verseEnd, onChapterChange, onVerseChange, onVerseEndChange],
  );

  const handleVerseChange = useCallback(
    (option: NumberOption | null) => {
      const newVerse = option?.value ?? null;
      const swap = cascadeVerseChange(newVerse, verseEnd);
      if (swap) {
        onVerseChange(swap.verse);
        onVerseEndChange(swap.verseEnd);
      } else {
        onVerseChange(newVerse);
      }
    },
    [verseEnd, onVerseChange, onVerseEndChange],
  );

  const handleVerseEndChange = useCallback(
    (option: NumberOption | null) => {
      const newVerseEnd = option?.value ?? null;
      const swap = cascadeVerseEndChange(verse, newVerseEnd);
      if (swap) {
        onVerseChange(swap.verse);
        onVerseEndChange(swap.verseEnd);
      } else {
        onVerseEndChange(newVerseEnd);
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
      <div data-testid={TEST_ID_SCRIPTURE_BOOK_SELECT}>
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
        <div className="fill-remaining" data-testid={TEST_ID_SCRIPTURE_CHAPTER_SELECT}>
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
        <div className="fill-remaining" data-testid={TEST_ID_SCRIPTURE_VERSE_SELECT}>
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
        <div className="fill-remaining" data-testid={TEST_ID_SCRIPTURE_VERSE_END_SELECT}>
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
