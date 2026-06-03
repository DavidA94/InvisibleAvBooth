import { describe, it, expect, vi, beforeEach } from "vitest";
import type { VerseData } from "@invisible-av-booth/shared";

// measureScripture makes fetch calls for logging — suppress them
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({}));
});

const verse1: VerseData = { verseNumber: 1, text: "In the beginning God created the heaven and the earth." };
const verse2: VerseData = { verseNumber: 2, text: "And the earth was without form, and void." };
const verse0: VerseData = { verseNumber: 0, text: "A section heading." };

function buildJail(): HTMLElement {
  const jail = document.createElement("div");
  jail.className = "aspect-ratio-jail";
  document.body.appendChild(jail);
  return jail;
}

/**
 * Mock getBoundingClientRect so that each paragraph element reports a height
 * that lets us control line count. lineHeight = 20px; each verse = 1 line.
 */
function mockMeasurements(lineHeightPx = 20, verseHeightPx = 20): void {
  vi.spyOn(window, "getComputedStyle").mockImplementation(
    (element) =>
      ({
        lineHeight: `${lineHeightPx}px`,
        // Return computed style for the element
      }) as CSSStyleDeclaration,
  );
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if ((this as HTMLElement).tagName === "P") {
      return { height: verseHeightPx, width: 100, top: 0, left: 0, bottom: verseHeightPx, right: 100 } as DOMRect;
    }
    return { height: 0, width: 0, top: 0, left: 0, bottom: 0, right: 0 } as DOMRect;
  });
}

describe("measureScripture", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("rejects immediately when signal is already aborted", async () => {
    const { measureScripture } = await import("./measureScripture");
    const controller = new AbortController();
    controller.abort();
    await expect(measureScripture([verse1], controller.signal)).rejects.toThrow("aborted");
  });

  it("returns single page fallback for empty verses", async () => {
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([], new AbortController().signal);
    expect(result.totalPages).toBe(1);
    expect(result.pages[0]).toMatchObject({ startVerse: 0, endVerse: 0 });
  });

  it("returns single page fallback when no jail element exists", async () => {
    const { measureScripture } = await import("./measureScripture");
    // No jail in document
    const result = await measureScripture([verse1, verse2], new AbortController().signal);
    expect(result.totalPages).toBe(1);
    expect(result.useWideWidth).toBe(false);
  });

  it("returns single page fallback when lineHeight is NaN", async () => {
    buildJail();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ lineHeight: "normal" } as CSSStyleDeclaration);
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([verse1], new AbortController().signal);
    expect(result.totalPages).toBe(1);
  });

  it("computes single page for 2 verses fitting in 4 lines", async () => {
    buildJail();
    mockMeasurements(20, 20); // each verse = 1 line, max 4 lines
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([verse1, verse2], new AbortController().signal);
    expect(result.totalPages).toBe(1);
    expect(result.pages[0]).toMatchObject({ startVerse: 1, endVerse: 2 });
  });

  it("splits into multiple pages when verses exceed 4 lines", async () => {
    buildJail();
    // Each verse = 3 lines; 3+3 = 6 > 4, so 2 pages
    mockMeasurements(20, 60);
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([verse1, verse2], new AbortController().signal);
    expect(result.totalPages).toBe(2);
  });

  it("uses wide width when it reduces total lines", async () => {
    buildJail();
    vi.spyOn(window, "getComputedStyle").mockReturnValue({ lineHeight: "20px" } as CSSStyleDeclaration);
    // Each verse paragraph returns different heights based on whether wrapper has wide class.
    // We simulate: narrow = 3 lines (60px) each, wide = 1 line (20px) each.
    // measureScripture adds "br-wrapper--wide" to the wrapper during wide measurement.
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
      if ((this as HTMLElement).tagName === "P") {
        const wrapper = this.closest(".br-wrapper");
        const isWide = wrapper?.classList.contains("br-wrapper--wide") ?? false;
        const height = isWide ? 20 : 60;
        return { height, width: 100, top: 0, left: 0, bottom: height, right: 100 } as DOMRect;
      }
      return { height: 0, width: 0, top: 0, left: 0, bottom: 0, right: 0 } as DOMRect;
    });
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([verse1, verse2], new AbortController().signal);
    expect(result.useWideWidth).toBe(true);
  });

  it("handles verseNumber 0 (section heading)", async () => {
    buildJail();
    mockMeasurements(20, 20);
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([verse0], new AbortController().signal);
    expect(result.totalPages).toBe(1);
  });

  it("rejects when signal aborts during processing", async () => {
    buildJail();
    const controller = new AbortController();
    vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
      controller.abort();
      return { lineHeight: "20px" } as CSSStyleDeclaration;
    });
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ height: 20 } as DOMRect);
    const { measureScripture } = await import("./measureScripture");
    await expect(measureScripture([verse1], controller.signal)).rejects.toThrow("aborted");
  });
});

// ── computePages (internal, tested via measureScripture indirectly) ───────────

describe("computePages — large verse exceeds max lines", () => {
  it("puts an oversized single verse on its own page", async () => {
    buildJail();
    // Each verse = 6 lines > MAX_LINES(4), must get its own page
    mockMeasurements(20, 120);
    const { measureScripture } = await import("./measureScripture");
    const result = await measureScripture([verse1], new AbortController().signal);
    // Single oversized verse → one page
    expect(result.totalPages).toBe(1);
    expect(result.pages[0]?.startVerse).toBe(1);
    expect(result.pages[0]?.endVerse).toBe(1);
  });

  it("flushes current page when adding verse would overflow", async () => {
    buildJail();
    mockMeasurements(20, 60); // 3 lines each; 3+3=6 > 4
    const { measureScripture } = await import("./measureScripture");
    const verses: VerseData[] = [
      { verseNumber: 1, text: "verse 1" },
      { verseNumber: 2, text: "verse 2" },
      { verseNumber: 3, text: "verse 3" },
    ];
    const result = await measureScripture(verses, new AbortController().signal);
    expect(result.totalPages).toBeGreaterThan(1);
  });
});
