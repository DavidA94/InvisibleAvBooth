import { TEST_ID_LT_DISMISS_BUTTON, TEST_ID_LT_SHOW_BUTTON, TEST_ID_LT_FORCE_CLEAR_AREA, TEST_ID_LT_GO_LIVE_AREA, TEST_ID_LT_DELETE_AREA, TEST_ID_LT_PAGINATION, TEST_ID_LT_STATUS_OVERLAY, TEST_ID_LT_COUNTDOWN } from "../../constants/testIds";
import type { ReactNode } from "react";
import type { LowerThirdItem, AnimationPhase, TitleContent, TitleSubtitleContent, ScriptureContent } from "@invisible-av-booth/shared";

interface LowerThirdRowProps {
  item: LowerThirdItem;
  section: "active" | "library";
  isActive: boolean;
  transitionLocked: boolean;
  phase?: AnimationPhase;
  autoDismissAt?: string | null;
  onDismiss?: () => void;
  onForceClear?: () => void;
  onActivate?: (itemId: string) => void;
  onRemove?: (itemId: string) => void;
  onPageNext?: () => void;
  onPagePrevious?: () => void;
}

function getDisplayTitle(item: LowerThirdItem): string {
  if (item.source === "template" && item.templateName) return item.templateName;
  const content = item.content;
  if ("title" in content) return (content as TitleContent | TitleSubtitleContent).title;
  return (content as ScriptureContent).formattedReference;
}

function getSubtitle(item: LowerThirdItem): string {
  if (item.source === "template") return "Template";
  if (item.type === "Scripture" && item.pages) return `Scripture · ${item.pages.totalPages} page${item.pages.totalPages > 1 ? "s" : ""}`;
  if (item.type === "Scripture" && !item.pages) return "Scripture · Pending";
  return item.type === "TitleSubtitle" ? "Title + Subtitle" : item.type;
}

export function LowerThirdRow({
  item,
  section,
  isActive,
  transitionLocked,
  phase,
  autoDismissAt,
  onDismiss,
  onForceClear,
  onActivate,
  onRemove,
  onPageNext,
  onPagePrevious,
}: LowerThirdRowProps): ReactNode {
  const isDismissing = section === "active" && phase === "dismissing";
  const showStatusOverlay = isDismissing;

  return (
    <div
      className={`lt-row ${item.used ? "lt-row--used" : ""} ${isActive && section === "library" ? "lt-row--active-badge" : ""}`}
      data-testid={`lt-row-${item.id}`}
    >
      {/* Status overlay */}
      {showStatusOverlay && <div className="lt-status-overlay" data-testid={TEST_ID_LT_STATUS_OVERLAY}>Dismissing</div>}

      {/* Active badge for library items */}
      {isActive && section === "library" && <div className="lt-badge">Active</div>}

      {/* Content */}
      <div className="lt-row-content">
        <span className="lt-row-title">{getDisplayTitle(item)}</span>
        <span className="lt-row-subtitle">{getSubtitle(item)}</span>
      </div>

      {/* Primary action button */}
      {section === "active" && (
        <button
          className="lt-action-btn lt-action-primary"
          onClick={onDismiss}
          disabled={transitionLocked || showStatusOverlay}
          data-testid={TEST_ID_LT_DISMISS_BUTTON}
          aria-label="Dismiss"
        >
          <span className="lt-action-icon">✕</span>
          <span className="lt-action-label">Dismiss</span>
        </button>
      )}

      {section === "library" && !isActive && (
        <button
          className="lt-action-btn lt-action-primary"
          onClick={() => onActivate?.(item.id)}
          disabled={transitionLocked}
          data-testid={TEST_ID_LT_SHOW_BUTTON}
          aria-label="Show"
        >
          <span className="lt-action-icon">▶</span>
          <span className="lt-action-label">Show</span>
        </button>
      )}

      {/* Pagination controls for active scripture */}
      {section === "active" && item.pages && item.pages.totalPages > 1 && (
        <div className="lt-pagination" data-testid={TEST_ID_LT_PAGINATION}>
          <button
            className="lt-action-btn"
            onClick={onPagePrevious}
            disabled={transitionLocked || item.pages.currentPage <= 1}
            aria-label="Previous page"
          >
            ◀
          </button>
          <span className="lt-page-info">
            Page {item.pages.currentPage} / {item.pages.totalPages}
          </span>
          <button
            className="lt-action-btn"
            onClick={onPageNext}
            disabled={transitionLocked || item.pages.currentPage >= item.pages.totalPages}
            aria-label="Next page"
          >
            ▶
          </button>
        </div>
      )}

      {/* Swipe-revealed actions would be handled by a swipe container wrapper */}
      {/* Force Clear (swipe-left on active) */}
      {section === "active" && (
        <div className="lt-swipe-actions lt-swipe-left" data-testid={TEST_ID_LT_FORCE_CLEAR_AREA}>
          <button className="lt-action-btn lt-action-danger" onClick={onForceClear} aria-label="Force Clear">
            <span className="lt-action-icon">⛔</span>
            <span className="lt-action-label">Force Clear</span>
          </button>
        </div>
      )}

      {/* Go Live (swipe-right on library) / Delete (swipe-left on volunteer items) */}
      {section === "library" && !isActive && (
        <>
          <div className="lt-swipe-actions lt-swipe-right" data-testid={TEST_ID_LT_GO_LIVE_AREA}>
            <button
              className="lt-action-btn lt-action-go-live"
              onClick={() => onActivate?.(item.id)}
              disabled={transitionLocked}
              aria-label="Go Live"
            >
              <span className="lt-action-icon">⚡</span>
              <span className="lt-action-label">Go Live</span>
            </button>
          </div>
          {item.source === "volunteer" && (
            <div className="lt-swipe-actions lt-swipe-left" data-testid={TEST_ID_LT_DELETE_AREA}>
              <button className="lt-action-btn lt-action-danger" onClick={() => onRemove?.(item.id)} aria-label="Delete">
                <span className="lt-action-icon">🗑</span>
                <span className="lt-action-label">Delete</span>
              </button>
            </div>
          )}
        </>
      )}

      {/* Auto-dismiss countdown placeholder */}
      {section === "active" && autoDismissAt && !isDismissing && (
        <div className="lt-countdown" data-testid={TEST_ID_LT_COUNTDOWN}>
          {/* ActiveCountdown component will be implemented in task 30 */}
        </div>
      )}
    </div>
  );
}
