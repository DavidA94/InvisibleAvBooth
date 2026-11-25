import type { ReactNode } from "react";
import type { LowerThirdItem, PageBreakdown, ScriptureContent } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
import { PaginationControls } from "./PaginationControls";
import { versesOnPage } from "./pageReference";
import {
  TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_VERSES,
  TEST_ID_LOWER_THIRD_EXPANDED_VIEW,
} from "../../constants/testIds";

interface ExpandedScriptureModalProps {
  /** The active scripture item. The parent only renders this while this item is still active (Req 5.27). */
  item: LowerThirdItem;
  transitionLocked: boolean;
  onClose: () => void;
  onPageNext: () => void;
  onPagePrevious: () => void;
  /** Sends dismiss and closes the modal immediately; the parent does both (Req 5.26). */
  onDismissAndClose: () => void;
  /** Sends force-clear; always enabled, no confirmation (Req 5.25). */
  onForceClear: () => void;
}

/**
 * Expanded View: a large, text-only look at what is on screen now, with pagination
 * (lower-thirds spec Req 5.23-5.27).
 *
 * Why it exists: the active row only shows a reference and page range, so volunteers could not tell
 * which words viewers were seeing while paginating. It is text only on purpose: the dashboard has no
 * copy of the rendered graphic and building one would duplicate the overlay renderer (Risk 7).
 *
 * Design constraints worth preserving:
 * - Force Clear is a visible one-tap control with no confirmation (unlike the swipe-revealed one in
 *   the row), so its only protection is placement: bottom-left, away from the right-hand group.
 * - Dismiss and close and Prev/Next are disabled while a transition lock is active, like the widget.
 *   The backend rejects dismiss during a lock; if this button closed the modal anyway the volunteer
 *   would believe the verse was gone while it was still on air. The lock feedback itself (the
 *   "Dismissing" overlay) stays in the widget; this modal adds none of its own.
 * - Close never touches what is on air and is never disabled.
 */
export function ExpandedScriptureModal({
  item,
  transitionLocked,
  onClose,
  onPageNext,
  onPagePrevious,
  onDismissAndClose,
  onForceClear,
}: ExpandedScriptureModalProps): ReactNode {
  const content = item.content as ScriptureContent;
  const pages: PageBreakdown | null = item.pages;

  const footer = (
    <div className="lt-expanded-footer">
      <button className="lt-expanded-btn lt-expanded-btn--danger" onClick={onForceClear} data-testid={TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON}>
        Force Clear
      </button>
      <div className="lt-expanded-footer-actions">
        <button className="lt-expanded-btn" onClick={onClose} data-testid={TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON}>
          Close
        </button>
        <button
          className="lt-expanded-btn lt-expanded-btn--primary"
          onClick={onDismissAndClose}
          disabled={transitionLocked}
          data-testid={TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON}
        >
          Dismiss and close
        </button>
      </div>
    </div>
  );

  return (
    <Modal isOpen onClose={onClose} size="large" header="On screen now" footer={footer}>
      <div data-testid={TEST_ID_LOWER_THIRD_EXPANDED_VIEW}>
        <p className="lt-expanded-reference">{content.formattedReference}</p>
        <div className="lt-expanded-verses" data-testid={TEST_ID_LOWER_THIRD_EXPANDED_VERSES}>
          {versesOnPage(item).map((verse) => (
            <p key={verse.verseNumber} className="lt-expanded-verse">
              {verse.verseNumber > 0 && <span className="lt-expanded-verse-num">{verse.verseNumber}. </span>}
              {verse.text}
            </p>
          ))}
        </div>
        {pages && pages.totalPages > 1 && (
          <div className="lt-expanded-pagination">
            <PaginationControls item={item} pages={pages} transitionLocked={transitionLocked} onPageNext={onPageNext} onPagePrevious={onPagePrevious} />
          </div>
        )}
      </div>
    </Modal>
  );
}
