import { describe, it, expect } from "vitest";
import { formatPageRange, versesOnPage } from "./pageReference";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

const item = {
  type: "Scripture",
  content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 }, formattedReference: "John 3:16-18", verses: [] },
} as unknown as LowerThirdItem;

describe("formatPageRange", () => {
  it("formats a multi-verse page as a range", () => {
    expect(formatPageRange(item, { pageNumber: 1, startVerse: 16, endVerse: 17 })).toBe("John 3:16-17");
  });

  it("formats a single-verse page without a range", () => {
    expect(formatPageRange(item, { pageNumber: 2, startVerse: 18, endVerse: 18 })).toBe("John 3:18");
  });
});

describe("versesOnPage", () => {
  const verses = [
    { verseNumber: 16, text: "sixteen" },
    { verseNumber: 17, text: "seventeen" },
    { verseNumber: 18, text: "eighteen" },
  ];
  const paged = (currentPage: number): LowerThirdItem =>
    ({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 }, formattedReference: "John 3:16-18", verses },
      pages: {
        totalPages: 2,
        currentPage,
        pages: [
          { pageNumber: 1, startVerse: 16, endVerse: 17 },
          { pageNumber: 2, startVerse: 18, endVerse: 18 },
        ],
        useWideWidth: false,
      },
    }) as unknown as LowerThirdItem;

  it("returns only the verses on the first page", () => {
    expect(versesOnPage(paged(1)).map((verse) => verse.verseNumber)).toEqual([16, 17]);
  });

  it("returns only the verses on a later page", () => {
    expect(versesOnPage(paged(2)).map((verse) => verse.verseNumber)).toEqual([18]);
  });

  it("returns every verse when there is no page breakdown", () => {
    const item = { ...paged(1), pages: null } as LowerThirdItem;
    expect(versesOnPage(item)).toHaveLength(3);
  });
});
