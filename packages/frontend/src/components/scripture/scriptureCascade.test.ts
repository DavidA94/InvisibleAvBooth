import { describe, it, expect } from "vitest";
import { cascadeBookChange, cascadeChapterChange, cascadeVerseChange, cascadeVerseEndChange } from "./scriptureCascade";

describe("cascadeBookChange", () => {
  it.each`
    scenario                              | newBookId | current                                        | expected
    ${"null book — no resets"}            | ${null}   | ${{ chapter: 5, verse: 3, verseEnd: 7 }}       | ${{ chapter: undefined, verse: undefined, verseEnd: undefined }}
    ${"valid chapter stays"}              | ${1}      | ${{ chapter: 1, verse: null, verseEnd: null }} | ${{ chapter: undefined, verse: undefined, verseEnd: undefined }}
    ${"invalid chapter clears all"}       | ${1}      | ${{ chapter: 999, verse: 3, verseEnd: 5 }}     | ${{ chapter: null, verse: null, verseEnd: null }}
    ${"invalid verse clears verse+end"}   | ${1}      | ${{ chapter: 1, verse: 999, verseEnd: 5 }}     | ${{ chapter: undefined, verse: null, verseEnd: null }}
    ${"invalid verseEnd clears only end"} | ${1}      | ${{ chapter: 1, verse: 1, verseEnd: 999 }}     | ${{ chapter: undefined, verse: undefined, verseEnd: null }}
    ${"all valid — no resets"}            | ${1}      | ${{ chapter: 1, verse: 1, verseEnd: 5 }}       | ${{ chapter: undefined, verse: undefined, verseEnd: undefined }}
  `("$scenario", ({ newBookId, current, expected }) => {
    expect(cascadeBookChange(newBookId, current)).toEqual(expected);
  });
});

describe("cascadeChapterChange", () => {
  it.each`
    scenario                              | bookId  | newChapter | current                        | expected
    ${"null chapter — no resets"}         | ${1}    | ${null}    | ${{ verse: 3, verseEnd: 5 }}   | ${{ chapter: undefined, verse: undefined, verseEnd: undefined }}
    ${"null bookId — no resets"}          | ${null} | ${1}       | ${{ verse: 3, verseEnd: 5 }}   | ${{ chapter: undefined, verse: undefined, verseEnd: undefined }}
    ${"invalid verse clears verse+end"}   | ${1}    | ${1}       | ${{ verse: 999, verseEnd: 5 }} | ${{ chapter: undefined, verse: null, verseEnd: null }}
    ${"invalid verseEnd clears only end"} | ${1}    | ${1}       | ${{ verse: 1, verseEnd: 999 }} | ${{ chapter: undefined, verse: undefined, verseEnd: null }}
    ${"all valid — no resets"}            | ${1}    | ${1}       | ${{ verse: 1, verseEnd: 5 }}   | ${{ chapter: undefined, verse: undefined, verseEnd: undefined }}
  `("$scenario", ({ bookId, newChapter, current, expected }) => {
    expect(cascadeChapterChange(bookId, newChapter, current)).toEqual(expected);
  });
});

describe("cascadeVerseChange", () => {
  it.each`
    scenario                     | newVerse | verseEnd | expected
    ${"no swap needed"}          | ${3}     | ${7}     | ${null}
    ${"swaps when verse > end"}  | ${10}    | ${5}     | ${{ verse: 5, verseEnd: 10 }}
    ${"null verse — no swap"}    | ${null}  | ${5}     | ${null}
    ${"null verseEnd — no swap"} | ${3}     | ${null}  | ${null}
  `("$scenario", ({ newVerse, verseEnd, expected }) => {
    expect(cascadeVerseChange(newVerse, verseEnd)).toEqual(expected);
  });
});

describe("cascadeVerseEndChange", () => {
  it.each`
    scenario                     | verse   | newVerseEnd | expected
    ${"no swap needed"}          | ${3}    | ${7}        | ${null}
    ${"swaps when end < verse"}  | ${10}   | ${5}        | ${{ verse: 5, verseEnd: 10 }}
    ${"null verse — no swap"}    | ${null} | ${5}        | ${null}
    ${"null verseEnd — no swap"} | ${3}    | ${null}     | ${null}
  `("$scenario", ({ verse, newVerseEnd, expected }) => {
    expect(cascadeVerseEndChange(verse, newVerseEnd)).toEqual(expected);
  });
});
