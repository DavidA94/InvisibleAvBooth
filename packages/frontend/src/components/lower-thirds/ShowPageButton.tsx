import { useState } from "react";
import type { ReactNode } from "react";
import { IonIcon, IonPopover } from "@ionic/react";
import { documentOutline } from "ionicons/icons";
import type { LowerThirdItem, PageBreakdown } from "@invisible-av-booth/shared";
import { TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON, TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER, TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION } from "../../constants/testIds";
import { formatPageRange } from "./pageReference";

interface ShowPageButtonProps {
  item: LowerThirdItem;
  pages: PageBreakdown;
  transitionLocked: boolean;
  /** Called with the 1-based page the volunteer picked. The popover has already closed. */
  onShowPage: (itemId: string, page: number) => void;
}

/**
 * "Show page" — start a multi-page scripture on a chosen page instead of page 1
 * (lower-thirds spec Req 5.19-5.22, supersedes Risk 4).
 *
 * Why it looks the way it does:
 * - It sits left of Show with a deliberately larger gap (see `.lt-show-page-btn`) so a volunteer
 *   aiming for Show in a hurry cannot hit this by accident.
 * - Entries are full-width and at least 2.75rem tall (WCAG 2.5.5 primary-action target size) because
 *   this is used on a tablet, live, often in a dim booth.
 * - The popover is only mounted while open. That keeps closed state free of stale overlays, and
 *   means picking a page, tapping away, or the lock engaging all leave nothing behind.
 * - Selecting a page closes the popover first, then reports. A rejected request (e.g. page count
 *   changed after re-measurement) therefore never leaves a popover hanging open over a live control.
 */
export function ShowPageButton({ item, pages, transitionLocked, onShowPage }: ShowPageButtonProps): ReactNode {
  const [open, setOpen] = useState(false);
  const triggerId = `lt-show-page-${item.id}`;

  const handleSelect = (page: number): void => {
    setOpen(false);
    onShowPage(item.id, page);
  };

  return (
    <>
      <button
        id={triggerId}
        className="lt-action-btn lt-show-page-btn"
        onClick={() => setOpen(true)}
        disabled={transitionLocked}
        data-testid={TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON}
        data-state={open ? "open" : "closed"}
        aria-label="Show page"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <IonIcon icon={documentOutline} className="lt-action-icon" aria-hidden="true" />
        <span className="lt-action-label">Show page</span>
      </button>
      {open && (
        <IonPopover
          isOpen
          trigger={triggerId}
          onDidDismiss={() => setOpen(false)}
          side="bottom"
          alignment="end"
          className="lt-show-page-ion-popover"
          data-testid={TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER}
        >
          <div className="lt-show-page-list" role="listbox" aria-label="Choose a page to show">
            {pages.pages.map((page) => (
              <button
                key={page.pageNumber}
                role="option"
                aria-selected={false}
                className="lt-show-page-option"
                onClick={() => handleSelect(page.pageNumber)}
                data-testid={`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-${page.pageNumber}`}
              >
                <span className="lt-show-page-option-number">Page {page.pageNumber}</span>
                <span className="lt-show-page-option-range">{formatPageRange(item, page)}</span>
              </button>
            ))}
          </div>
        </IonPopover>
      )}
    </>
  );
}
