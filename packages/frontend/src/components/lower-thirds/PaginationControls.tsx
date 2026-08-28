import { TEST_ID_LOWER_THIRD_PAGINATION, TEST_ID_LOWER_THIRD_PAGE_INFO } from "../../constants/testIds";
import type { ReactNode } from "react";
import type { PageBreakdown, ScriptureContent, LowerThirdItem } from "@invisible-av-booth/shared";
import { BIBLE_BOOKS } from "@invisible-av-booth/shared";

interface PaginationControlsProps {
  item: LowerThirdItem;
  pages: PageBreakdown;
  transitionLocked: boolean;
  onPageNext: () => void;
  onPagePrevious: () => void;
}

function formatPageReference(item: LowerThirdItem, pages: PageBreakdown): string {
  const content = item.content as ScriptureContent;
  const currentPageInfo = pages.pages[pages.currentPage - 1];
  if (!currentPageInfo) return "";

  const bookName = BIBLE_BOOKS[content.reference.bookId] ?? "";
  const chapter = content.reference.chapter;

  if (currentPageInfo.startVerse === currentPageInfo.endVerse) {
    return `${bookName} ${chapter}:${currentPageInfo.startVerse}`;
  }
  return `${bookName} ${chapter}:${currentPageInfo.startVerse}-${currentPageInfo.endVerse}`;
}

export function PaginationControls({ item, pages, transitionLocked, onPageNext, onPagePrevious }: PaginationControlsProps): ReactNode {
  return (
    <div className="lt-pagination" data-testid={TEST_ID_LOWER_THIRD_PAGINATION}>
      <button
        className="lt-action-btn lt-pagination-btn"
        onClick={onPagePrevious}
        disabled={transitionLocked || pages.currentPage <= 1}
        aria-label="Previous page"
      >
        ◀
      </button>
      <span className="lt-page-info" data-testid={TEST_ID_LOWER_THIRD_PAGE_INFO}>
        {formatPageReference(item, pages)}
      </span>
      <button
        className="lt-action-btn lt-pagination-btn"
        onClick={onPageNext}
        disabled={transitionLocked || pages.currentPage >= pages.totalPages}
        aria-label="Next page"
      >
        ▶
      </button>
    </div>
  );
}
