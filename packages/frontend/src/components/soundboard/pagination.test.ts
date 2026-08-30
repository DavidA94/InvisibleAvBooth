import { describe, it, expect } from "vitest";
import { computePaginationLayout, channelsForPage, rangeLabel, STRIP_MIN_WIDTH_REM, BASE_FONT_SIZE } from "./pagination";

/** Width in px that fits exactly `n` strips of STRIP_MIN_WIDTH_REM. */
const widthForStrips = (n: number): number => n * STRIP_MIN_WIDTH_REM * BASE_FONT_SIZE;

describe("computePaginationLayout", () => {
  it("does not paginate when all channels fit", () => {
    const layout = computePaginationLayout(widthForStrips(6), 4);
    expect(layout.paginated).toBe(false);
    expect(layout.perPage).toBe(4);
    expect(layout.pageCount).toBe(1);
  });

  it("paginates when channels exceed strips that fit; last slot is the pager", () => {
    // 6 strips fit, 9 channels → perPage = 5, 2 pages.
    const layout = computePaginationLayout(widthForStrips(6), 9);
    expect(layout.paginated).toBe(true);
    expect(layout.perPage).toBe(5);
    expect(layout.pageCount).toBe(2);
  });

  it("boundary: exactly 3 strips fit with overflow → show 2 channels + pager", () => {
    const layout = computePaginationLayout(widthForStrips(3), 9);
    expect(layout.paginated).toBe(true);
    expect(layout.perPage).toBe(2); // 3 fit − 1 pager
  });

  it("handles zero channels", () => {
    const layout = computePaginationLayout(widthForStrips(3), 0);
    expect(layout.paginated).toBe(false);
    expect(layout.pageCount).toBe(0);
  });

  it("always fits at least one strip even on a tiny width", () => {
    const layout = computePaginationLayout(10, 5);
    expect(layout.perPage).toBeGreaterThanOrEqual(1);
  });
});

describe("channelsForPage", () => {
  it("returns the correct 1-based channels for each page", () => {
    // perPage 2, 5 channels.
    expect(channelsForPage(0, 2, 5)).toEqual([1, 2]);
    expect(channelsForPage(1, 2, 5)).toEqual([3, 4]);
    expect(channelsForPage(2, 2, 5)).toEqual([5]); // last page partial
  });

  it("returns [] for a page past the end", () => {
    expect(channelsForPage(5, 2, 4)).toEqual([]);
  });
});

describe("rangeLabel", () => {
  it("formats an accurate range for a full page", () => {
    // perPage 3, 9 channels: page 1 (0-based) → channels 4–6.
    expect(rangeLabel(1, 3, 9)).toBe("See channels 4–6 of 9");
  });

  it("clamps the end to the channel count on the last page", () => {
    expect(rangeLabel(2, 3, 8)).toBe("See channels 7–8 of 8");
  });

  it("labels the first range", () => {
    expect(rangeLabel(0, 3, 9)).toBe("See channels 1–3 of 9");
  });
});
