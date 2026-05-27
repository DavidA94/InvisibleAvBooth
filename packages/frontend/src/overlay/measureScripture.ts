import type { VerseData, PageBreakdown, PageInfo } from "@invisible-av-booth/shared";

const MAX_LINES = 4;

/**
 * Measures scripture verses and returns page break information.
 * Uses the overlay's rendering context for accurate measurements.
 */
export async function measureScripture(verses: VerseData[], signal: AbortSignal): Promise<PageBreakdown> {
  if (signal.aborted) throw new Error("aborted");
  if (verses.length === 0) {
    return { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 0, endVerse: 0 }] };
  }

  // Find the aspect-ratio-jail to get its resolved dimensions
  const jail = document.querySelector(".aspect-ratio-jail");
  if (!jail) {
    // Fallback: can't measure without the container
    return singlePageFallback(verses);
  }

  const jailRect = jail.getBoundingClientRect();
  if (jailRect.width === 0 || jailRect.height === 0) {
    return singlePageFallback(verses);
  }

  // Calculate sizes based on container dimensions (matching CSS cqh/cqw)
  const cqh = jailRect.height / 100;
  const cqw = jailRect.width / 100;
  const verseFontSize = 3.5 * cqh;
  const lineHeight = 1.5;
  const lineHeightPx = verseFontSize * lineHeight;
  const containerWidth70 = 70 * cqw; // 70cqw plate width
  const contentPadding = 2 * cqw + 1.5 * cqw; // left + right padding from .br-content
  const availableWidth70 = containerWidth70 - contentPadding;
  const availableWidth80 = 80 * cqw - contentPadding;

  // Create hidden measurement element
  const container = document.createElement("div");
  container.style.cssText = `position:absolute;visibility:hidden;top:-9999px;left:-9999px;font-size:${verseFontSize}px;line-height:${lineHeight};font-family:inherit;`;
  document.body.appendChild(container);

  try {
    if (signal.aborted) throw new Error("aborted");

    const narrowPages = computePages(verses, container, availableWidth70, lineHeightPx);
    if (signal.aborted) throw new Error("aborted");

    const widePages = computePages(verses, container, availableWidth80, lineHeightPx);
    if (signal.aborted) throw new Error("aborted");

    // Use wider width only if it reduces total page count
    return widePages.pages.length < narrowPages.pages.length ? widePages : narrowPages;
  } finally {
    container.remove();
  }
}

function computePages(verses: VerseData[], container: HTMLElement, availableWidth: number, lineHeightPx: number): PageBreakdown {
  container.style.width = `${availableWidth}px`;

  const pages: PageInfo[] = [];
  let currentPageVerses: VerseData[] = [];
  let currentLineCount = 0;

  for (const verse of verses) {
    const lines = measureVerseLines(verse, container, lineHeightPx);

    // Single verse exceeds max — it gets its own page
    if (lines > MAX_LINES && currentPageVerses.length === 0) {
      pages.push({ pageNumber: pages.length + 1, startVerse: verse.verseNumber, endVerse: verse.verseNumber });
      continue;
    }

    // Would overflow — flush current page
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

  if (pages.length === 0) {
    return singlePageFallback(verses);
  }

  return { totalPages: pages.length, currentPage: 1, pages };
}

function measureVerseLines(verse: VerseData, container: HTMLElement, lineHeightPx: number): number {
  const element = document.createElement("p");
  element.style.cssText = "margin:0;padding:0;white-space:normal;word-wrap:break-word;";
  const prefix = verse.verseNumber > 0 ? `${verse.verseNumber}. ` : "";
  element.textContent = prefix + verse.text;
  container.appendChild(element);
  const height = element.getBoundingClientRect().height;
  element.remove();
  return Math.max(1, Math.round(height / lineHeightPx));
}

function singlePageFallback(verses: VerseData[]): PageBreakdown {
  return {
    totalPages: 1,
    currentPage: 1,
    pages: [{
      pageNumber: 1,
      startVerse: verses[0]?.verseNumber ?? 0,
      endVerse: verses[verses.length - 1]?.verseNumber ?? 0,
    }],
  };
}
