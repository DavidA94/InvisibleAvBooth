import type { VerseData, PageBreakdown, PageInfo } from "@invisible-av-booth/shared";

const MAX_LINES = 4;

function log(message: string): void {
  fetch("/api/overlay/logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ level: "info", message }]),
  }).catch(() => {});
}

/**
 * Measures scripture verses and returns page break information.
 * Uses an exact clone of the rendered verse markup inside the overlay's
 * container query context for accurate measurements.
 */
export async function measureScripture(verses: VerseData[], signal: AbortSignal): Promise<PageBreakdown> {
  if (signal.aborted) throw new Error("aborted");
  if (verses.length === 0) {
    return { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 0, endVerse: 0 }], useWideWidth: false };
  }

  // Find the aspect-ratio-jail — measurement must happen inside it for cqw/cqh to resolve
  const jail = document.querySelector(".aspect-ratio-jail");
  if (!jail) {
    return singlePageFallback(verses);
  }

  // Create a hidden clone of the lower-third structure inside the jail
  const wrapper = document.createElement("div");
  wrapper.className = "br-wrapper br-phase--visible";
  wrapper.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;top:-9999px;left:0;";

  const plate = document.createElement("div");
  plate.className = "br-plate";

  const content = document.createElement("div");
  content.className = "br-content";

  const versesContainer = document.createElement("div");
  versesContainer.className = "br-verses";

  content.appendChild(versesContainer);
  plate.appendChild(content);
  wrapper.appendChild(plate);
  jail.appendChild(wrapper);

  try {
    if (signal.aborted) throw new Error("aborted");

    // Measure line height from a sample verse element
    const sampleElement = createVerseElement(verses[0]!);
    versesContainer.appendChild(sampleElement);
    const computedStyle = window.getComputedStyle(sampleElement);
    const lineHeightPx = parseFloat(computedStyle.lineHeight);
    sampleElement.remove();

    if (isNaN(lineHeightPx) || lineHeightPx === 0) {
      return singlePageFallback(verses);
    }

    const narrowResult = computePages(verses, versesContainer, lineHeightPx);
    if (signal.aborted) throw new Error("aborted");

    log(" Narrow (70cqw):: totalLines=" + narrowResult.totalLines + ", pages=" + narrowResult.breakdown.totalPages);

    // Test at 80cqw to see if it reduces total line count
    wrapper.classList.add("br-wrapper--wide");
    const wideResult = computePages(verses, versesContainer, lineHeightPx);
    wrapper.classList.remove("br-wrapper--wide");
    if (signal.aborted) throw new Error("aborted");

    log(" Wide (80cqw):: totalLines=" + wideResult.totalLines + ", pages=" + wideResult.breakdown.totalPages);
    log("Wrapper width narrow: " + wrapper.getBoundingClientRect().width + "px");
    wrapper.classList.add("br-wrapper--wide");
    log("Wrapper width wide: " + wrapper.getBoundingClientRect().width + "px");
    wrapper.classList.remove("br-wrapper--wide");

    // Use wider width if it reduces total lines (even by one)
    if (wideResult.totalLines < narrowResult.totalLines) {
      log("Decision: using WIDE width");
      return { ...wideResult.breakdown, useWideWidth: true };
    }
    log(" Using NARROW width");
    return { ...narrowResult.breakdown, useWideWidth: false };
  } finally {
    wrapper.remove();
  }
}

function createVerseElement(verse: VerseData): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = `br-verse ${verse.verseNumber === 0 ? "br-verse--zero" : ""}`;
  if (verse.verseNumber > 0) {
    const numSpan = document.createElement("span");
    numSpan.className = "br-verse-num";
    numSpan.textContent = `${verse.verseNumber}. `;
    element.appendChild(numSpan);
    element.appendChild(document.createTextNode(verse.text));
  } else {
    element.textContent = verse.text;
  }
  return element;
}

interface ComputeResult {
  breakdown: PageBreakdown;
  totalLines: number;
}

function computePages(verses: VerseData[], container: HTMLElement, lineHeightPx: number): ComputeResult {
  const pages: PageInfo[] = [];
  let currentPageVerses: VerseData[] = [];
  let currentLineCount = 0;
  let totalLines = 0;

  for (const verse of verses) {
    const lines = measureVerseLines(verse, container, lineHeightPx);
    totalLines += lines;

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
    return { breakdown: singlePageFallback(verses), totalLines };
  }

  return { breakdown: { totalPages: pages.length, currentPage: 1, pages, useWideWidth: false }, totalLines };
}

function measureVerseLines(verse: VerseData, container: HTMLElement, lineHeightPx: number): number {
  const element = createVerseElement(verse);
  container.appendChild(element);
  const height = element.getBoundingClientRect().height;
  element.remove();
  return Math.max(1, Math.round(height / lineHeightPx));
}

function singlePageFallback(verses: VerseData[]): PageBreakdown {
  return {
    totalPages: 1,
    currentPage: 1,
    pages: [
      {
        pageNumber: 1,
        startVerse: verses[0]?.verseNumber ?? 0,
        endVerse: verses[verses.length - 1]?.verseNumber ?? 0,
      },
    ],
    useWideWidth: false,
  };
}
