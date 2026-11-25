import type { LowerThirdItem, PageInfo, ScriptureContent, VerseData } from "@invisible-av-booth/shared";
import { BIBLE_BOOKS } from "@invisible-av-booth/shared";

/**
 * Human-readable scripture range for one page, e.g. "Genesis 1:3-4" or "Genesis 1:3".
 *
 * Shared by the active item's pagination row and the Show page popover so the volunteer sees the
 * same wording for "the verses on this page" everywhere. Keeping one formatter prevents the two
 * lists drifting apart.
 */
export function formatPageRange(item: LowerThirdItem, page: PageInfo): string {
  const content = item.content as ScriptureContent;
  const bookName = BIBLE_BOOKS[content.reference.bookId] ?? "";
  const chapter = content.reference.chapter;

  if (page.startVerse === page.endVerse) {
    return `${bookName} ${chapter}:${page.startVerse}`;
  }
  return `${bookName} ${chapter}:${page.startVerse}-${page.endVerse}`;
}

/**
 * The verses on the page currently on screen for an active scripture item.
 *
 * Uses the same inclusive start/end verse filter as the overlay (overlayEngine `buildContentHtml`), so
 * the Expanded View shows the same words viewers see. If the item has no page breakdown (unmeasured
 * or single-page fallback) every verse is returned, matching the overlay.
 */
export function versesOnPage(item: LowerThirdItem): VerseData[] {
  const content = item.content as ScriptureContent;
  const pageInfo = item.pages?.pages[item.pages.currentPage - 1];
  if (!pageInfo) return content.verses;
  return content.verses.filter((verse) => verse.verseNumber >= pageInfo.startVerse && verse.verseNumber <= pageInfo.endVerse);
}
