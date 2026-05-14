import type { VerseData, PageBreakdown, PageInfo } from "@invisible-av-booth/shared";

const MAX_LINES = 4;
const WIDTH_NARROW = "70%";
const WIDTH_WIDE = "80%";

/**
 * Measures scripture verses in a hidden off-screen container and returns
 * page break information. Runs in the overlay's rendering context so fonts
 * and container dimensions are accurate.
 *
 * Cancellable via AbortSignal — rejects with an error if aborted.
 */
export async function measureScripture(verses: VerseData[], signal: AbortSignal): Promise<PageBreakdown> {
  if (signal.aborted) throw new Error("aborted");

  // Create hidden measurement container matching the live display
  const container = document.createElement("div");
  container.style.cssText = `
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    top: -9999px;
    left: -9999px;
    font-size: 1.7cqh;
    line-height: 1.5;
    container-type: size;
  `;

  // Find the aspect-ratio-jail to get the correct container context
  const jail = document.querySelector(".aspect-ratio-jail");
  (jail ?? document.body).appendChild(container);

  try {
    // Measure at narrow width first, then check if wide reduces line count
    const narrowPages = computePages(verses, container, WIDTH_NARROW);
    if (signal.aborted) throw new Error("aborted");

    const widePages = computePages(verses, container, WIDTH_WIDE);
    if (signal.aborted) throw new Error("aborted");

    // Use wide only if it reduces total line count (removes at least one line)
    const useWide = widePages.pages.length < narrowPages.pages.length;
    return useWide ? widePages : narrowPages;
  } finally {
    container.remove();
  }
}

function computePages(verses: VerseData[], container: HTMLElement, width: string): PageBreakdown {
  container.style.width = width;

  const pages: PageInfo[] = [];
  let currentPageVerses: VerseData[] = [];
  let currentLineCount = 0;

  for (const verse of verses) {
    const lines = measureVerseLines(verse, container);

    // Single verse exceeds max — it gets its own page regardless
    if (lines > MAX_LINES && currentPageVerses.length === 0) {
      pages.push({ pageNumber: pages.length + 1, startVerse: verse.verseNumber, endVerse: verse.verseNumber });
      continue;
    }

    // Would overflow — flush current page first
    if (currentLineCount + lines > MAX_LINES && currentPageVerses.length > 0) {
      const first = currentPageVerses[0]!;
      const last = currentPageVerses[currentPageVerses.length - 1]!;
      pages.push({ pageNumber: pages.length + 1, startVerse: first.verseNumber, endVerse: last.verseNumber });
      currentPageVerses = [];
      currentLineCount = 0;
    }

    currentPageVerses.push(verse);
    currentLineCount += lines;
  }

  // Flush remaining
  if (currentPageVerses.length > 0) {
    const first = currentPageVerses[0]!;
    const last = currentPageVerses[currentPageVerses.length - 1]!;
    pages.push({ pageNumber: pages.length + 1, startVerse: first.verseNumber, endVerse: last.verseNumber });
  }

  return { totalPages: pages.length || 1, currentPage: 1, pages: pages.length > 0 ? pages : [{ pageNumber: 1, startVerse: verses[0]?.verseNumber ?? 1, endVerse: verses[verses.length - 1]?.verseNumber ?? 1 }] };
}

function measureVerseLines(verse: VerseData, container: HTMLElement): number {
  const element = document.createElement("p");
  element.style.cssText = "margin: 0; padding: 0;";
  const prefix = verse.verseNumber > 0 ? `${verse.verseNumber}. ` : "";
  element.textContent = prefix + verse.text;
  container.appendChild(element);
  const lineHeight = parseFloat(getComputedStyle(element).lineHeight) || 24;
  const height = element.getBoundingClientRect().height;
  element.remove();
  return Math.max(1, Math.round(height / lineHeight));
}
