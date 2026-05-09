import { describe, it, expect } from "vitest";
import { extractTokens, computeRequiredTokens, buildDraftManifest, hasDescriptionContent } from "./sessionManifestLogic";
import type { Template } from "./sessionManifestLogic";

const T = (overrides: Partial<Template>): Template => ({
  id: "t1",
  name: "T",
  category: "title",
  formatString: "",
  ...overrides,
});

describe("extractTokens", () => {
  it.each`
    scenario                       | format                            | expected
    ${"no tokens"}                 | ${"Plain text"}                   | ${[]}
    ${"single token"}              | ${"Hello {Speaker}"}              | ${["Speaker"]}
    ${"multiple tokens"}           | ${"{Date} – {Speaker} – {Title}"} | ${["Date", "Speaker", "Title"]}
    ${"duplicate tokens deduped"}  | ${"{Name} and {Name}"}            | ${["Name"]}
    ${"empty format"}              | ${""}                             | ${[]}
    ${"underscored/digited token"} | ${"{verse_1}"}                    | ${["verse_1"]}
  `("$scenario", ({ format, expected }) => {
    expect([...extractTokens(format)].sort()).toEqual(expected.sort());
  });
});

describe("computeRequiredTokens", () => {
  it.each`
    scenario                                  | titleFormat    | descFormat               | expected
    ${"no templates"}                         | ${null}        | ${null}                  | ${[]}
    ${"title only"}                           | ${"{Speaker}"} | ${null}                  | ${["Speaker"]}
    ${"description only"}                     | ${null}        | ${"{Title}"}             | ${["Title"]}
    ${"union of both"}                        | ${"{Speaker}"} | ${"{Title} {Scripture}"} | ${["Speaker", "Title", "Scripture"]}
    ${"empty descFormat contributes nothing"} | ${"{Speaker}"} | ${""}                    | ${["Speaker"]}
  `("$scenario", ({ titleFormat, descFormat, expected }) => {
    const titleT = titleFormat !== null ? T({ formatString: titleFormat }) : undefined;
    const descT = descFormat !== null ? T({ formatString: descFormat, category: "description" }) : undefined;
    expect([...computeRequiredTokens(titleT, descT)].sort()).toEqual(expected.sort());
  });
});

describe("buildDraftManifest", () => {
  const BLANK = { speaker: "", title: "", bookId: null, chapter: null, verse: null, verseEnd: null };

  it("returns empty draft when all fields blank", () => {
    expect(buildDraftManifest(BLANK)).toEqual({});
  });

  it.each`
    scenario                            | inputs                                                                           | expected
    ${"speaker only"}                   | ${{ ...BLANK, speaker: "John" }}                                                 | ${{ speaker: "John" }}
    ${"title only"}                     | ${{ ...BLANK, title: "Grace" }}                                                  | ${{ title: "Grace" }}
    ${"single verse"}                   | ${{ ...BLANK, bookId: 1, chapter: 2, verse: 3 }}                                 | ${{ scripture: { bookId: 1, chapter: 2, verse: 3 } }}
    ${"verse zero (chapter only)"}      | ${{ ...BLANK, bookId: 19, chapter: 23, verse: 0 }}                               | ${{ scripture: { bookId: 19, chapter: 23, verse: 0 } }}
    ${"verse zero with range"}          | ${{ ...BLANK, bookId: 19, chapter: 23, verse: 0, verseEnd: 2 }}                  | ${{ scripture: { bookId: 19, chapter: 23, verse: 0, verseEnd: 2 } }}
    ${"verse range"}                    | ${{ ...BLANK, bookId: 1, chapter: 2, verse: 3, verseEnd: 5 }}                    | ${{ scripture: { bookId: 1, chapter: 2, verse: 3, verseEnd: 5 } }}
    ${"partial scripture (no verse)"}   | ${{ ...BLANK, bookId: 1, chapter: 2 }}                                           | ${{}}
    ${"partial scripture (no chapter)"} | ${{ ...BLANK, bookId: 1, verse: 3 }}                                             | ${{}}
    ${"all fields"}                     | ${{ speaker: "J", title: "G", bookId: 1, chapter: 2, verse: 3, verseEnd: null }} | ${{ speaker: "J", title: "G", scripture: { bookId: 1, chapter: 2, verse: 3 } }}
  `("$scenario", ({ inputs, expected }) => {
    expect(buildDraftManifest(inputs)).toEqual(expected);
  });
});

describe("hasDescriptionContent", () => {
  it.each`
    scenario                | template                                                                 | expected
    ${"undefined template"} | ${undefined}                                                             | ${false}
    ${"None template"}      | ${T({ name: "None", formatString: "", category: "description" })}        | ${false}
    ${"empty format"}       | ${T({ name: "Empty", formatString: "", category: "description" })}       | ${false}
    ${"has format"}         | ${T({ name: "Real", formatString: "{Title}", category: "description" })} | ${true}
  `("$scenario → $expected", ({ template, expected }) => {
    expect(hasDescriptionContent(template)).toBe(expected);
  });
});
