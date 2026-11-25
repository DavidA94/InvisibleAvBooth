import { describe, it, expect } from "vitest";
import { matchesNumberPrefix, sanitizeNumericInput, MAX_NUMERIC_INPUT_LENGTH } from "./numericSelect";

describe("sanitizeNumericInput", () => {
  it.each`
    typed     | kept
    ${"23"}   | ${"23"}
    ${"2a3"}  | ${"23"}
    ${"abc"}  | ${""}
    ${"1-1"}  | ${"11"}
    ${" 7 "}  | ${"7"}
    ${"1.5"}  | ${"15"}
    ${"1234"} | ${"123"}
    ${""}     | ${""}
  `("keeps '$kept' from '$typed'", ({ typed, kept }: { typed: string; kept: string }) => {
    expect(sanitizeNumericInput(typed)).toBe(kept);
  });

  it("caps at the longest KJV chapter/verse number length", () => {
    expect(sanitizeNumericInput("99999")).toHaveLength(MAX_NUMERIC_INPUT_LENGTH);
  });
});

describe("matchesNumberPrefix", () => {
  const labels = ["1", "2", "3", "10", "13", "21", "31", "100", "176"];
  const matching = (input: string): string[] => labels.filter((label) => matchesNumberPrefix({ label }, input));

  it("matches everything when nothing is typed", () => {
    expect(matching("")).toEqual(labels);
  });

  it("matches by prefix, not contains", () => {
    expect(matching("1")).toEqual(["1", "10", "13", "100", "176"]);
    expect(matching("3")).toEqual(["3", "31"]);
  });

  it("puts the exact number first when options are ascending", () => {
    expect(matching("13")[0]).toBe("13");
    expect(matching("17")).toEqual(["176"]);
  });

  it("matches nothing for a number that does not start any option", () => {
    expect(matching("9")).toEqual([]);
  });
});
