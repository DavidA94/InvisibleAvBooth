import { describe, it, expect } from "vitest";
import {
  MAX_CHAPTERS,
  MAX_VERSES,
  getChaptersForBook,
  getVerseRange,
  isChapterValid,
  isVerseValidForBook,
  isVerseValidForChapter,
} from "./scriptureLookup";

describe("getChaptersForBook", () => {
  it("returns 1..150 when bookId is null", () => {
    const chapters = getChaptersForBook(null);
    expect(chapters.length).toBe(MAX_CHAPTERS);
    expect(chapters[0]).toBe(1);
    expect(chapters[chapters.length - 1]).toBe(150);
  });

  it("returns 1..150 for an invalid bookId", () => {
    const chapters = getChaptersForBook(999);
    expect(chapters.length).toBe(MAX_CHAPTERS);
  });

  it("returns 50 chapters for Genesis (bookId 1)", () => {
    const chapters = getChaptersForBook(1);
    expect(chapters.length).toBe(50);
    expect(chapters[0]).toBe(1);
    expect(chapters[49]).toBe(50);
  });

  it("returns 150 chapters for Psalms (bookId 19)", () => {
    const chapters = getChaptersForBook(19);
    expect(chapters.length).toBe(150);
  });

  it("returns 1 chapter for Obadiah (bookId 31)", () => {
    const chapters = getChaptersForBook(31);
    expect(chapters.length).toBe(1);
    expect(chapters[0]).toBe(1);
  });

  it("returns chapters in sorted order", () => {
    const chapters = getChaptersForBook(1);
    for (let i = 1; i < chapters.length; i++) {
      expect(chapters[i]).toBeGreaterThan(chapters[i - 1]!);
    }
  });
});

describe("getVerseRange", () => {
  it("returns 0..176 when bookId is null", () => {
    expect(getVerseRange(null, null)).toEqual({ min: 0, max: MAX_VERSES });
  });

  it("returns 0..176 for an invalid bookId", () => {
    expect(getVerseRange(999, null)).toEqual({ min: 0, max: MAX_VERSES });
  });

  it("returns range across all chapters when only book is set", () => {
    // Genesis: all verses start at 1, longest chapter is ch24 with 67 verses
    const range = getVerseRange(1, null);
    expect(range.min).toBe(1);
    expect(range.max).toBe(67);
  });

  it("returns exact range for a specific chapter", () => {
    // Genesis 1 has 31 verses
    const range = getVerseRange(1, 1);
    expect(range).toEqual({ min: 1, max: 31 });
  });

  it("returns exact range for Psalm 119 (176 verses)", () => {
    const range = getVerseRange(19, 119);
    expect(range).toEqual({ min: 1, max: 176 });
  });

  it("returns exact range for Psalm 150 (6 verses)", () => {
    const range = getVerseRange(19, 150);
    expect(range).toEqual({ min: 1, max: 6 });
  });

  it("returns min 0 for Psalms when no chapter (some psalms start at verse 0)", () => {
    const range = getVerseRange(19, null);
    expect(range.min).toBe(0);
  });

  it("returns default range for invalid chapter in valid book", () => {
    expect(getVerseRange(1, 999)).toEqual({ min: 0, max: MAX_VERSES });
  });
});

describe("isChapterValid", () => {
  it("returns true for Genesis chapter 1", () => {
    expect(isChapterValid(1, 1)).toBe(true);
  });

  it("returns true for Genesis chapter 50", () => {
    expect(isChapterValid(1, 50)).toBe(true);
  });

  it("returns false for Genesis chapter 51", () => {
    expect(isChapterValid(1, 51)).toBe(false);
  });

  it("returns false for invalid bookId", () => {
    expect(isChapterValid(999, 1)).toBe(false);
  });

  it("returns true for Psalms chapter 150", () => {
    expect(isChapterValid(19, 150)).toBe(true);
  });

  it("returns false for Psalms chapter 151", () => {
    expect(isChapterValid(19, 151)).toBe(false);
  });
});

describe("isVerseValidForBook", () => {
  it("returns true for verse 1 in Genesis", () => {
    expect(isVerseValidForBook(1, 1)).toBe(true);
  });

  it("returns true for verse 67 in Genesis (exists in ch24)", () => {
    expect(isVerseValidForBook(1, 67)).toBe(true);
  });

  it("returns false for verse 68 in Genesis (no chapter has 68 verses)", () => {
    expect(isVerseValidForBook(1, 68)).toBe(false);
  });

  it("returns false for invalid bookId", () => {
    expect(isVerseValidForBook(999, 1)).toBe(false);
  });

  it("returns true for verse 176 in Psalms (Psalm 119)", () => {
    expect(isVerseValidForBook(19, 176)).toBe(true);
  });

  it("returns false for verse 177 in Psalms", () => {
    expect(isVerseValidForBook(19, 177)).toBe(false);
  });
});

describe("isVerseValidForChapter", () => {
  it("returns true for Genesis 1:31", () => {
    expect(isVerseValidForChapter(1, 1, 31)).toBe(true);
  });

  it("returns false for Genesis 1:32 (only 31 verses)", () => {
    expect(isVerseValidForChapter(1, 1, 32)).toBe(false);
  });

  it("returns false for invalid bookId", () => {
    expect(isVerseValidForChapter(999, 1, 1)).toBe(false);
  });

  it("returns false for invalid chapter", () => {
    expect(isVerseValidForChapter(1, 999, 1)).toBe(false);
  });

  it("returns true for Psalm 119:176", () => {
    expect(isVerseValidForChapter(19, 119, 176)).toBe(true);
  });

  it("returns false for Psalm 150:7 (only 6 verses)", () => {
    expect(isVerseValidForChapter(19, 150, 7)).toBe(false);
  });
});
