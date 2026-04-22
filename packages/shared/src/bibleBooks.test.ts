import { describe, it, expect } from "vitest";
import { BIBLE_BOOKS } from "./bibleBooks";

describe("BIBLE_BOOKS", () => {
  it("contains 66 books", () => {
    expect(Object.keys(BIBLE_BOOKS).length).toBe(66);
  });

  it("starts with Genesis (bookId 1)", () => {
    expect(BIBLE_BOOKS[1]).toBe("Genesis");
  });

  it("ends with Revelation (bookId 66)", () => {
    expect(BIBLE_BOOKS[66]).toBe("Revelation");
  });

  it("uses Roman numeral prefixes for numbered books", () => {
    expect(BIBLE_BOOKS[9]).toBe("I Samuel");
    expect(BIBLE_BOOKS[10]).toBe("II Samuel");
    expect(BIBLE_BOOKS[64]).toBe("III John");
  });

  it("has sequential bookIds from 1 to 66", () => {
    for (let id = 1; id <= 66; id++) {
      expect(BIBLE_BOOKS[id]).toBeDefined();
    }
  });

  it("Old Testament ends at Malachi (bookId 39)", () => {
    expect(BIBLE_BOOKS[39]).toBe("Malachi");
  });

  it("New Testament starts at Matthew (bookId 40)", () => {
    expect(BIBLE_BOOKS[40]).toBe("Matthew");
  });
});
