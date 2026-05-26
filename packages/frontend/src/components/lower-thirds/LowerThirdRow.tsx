import { TEST_ID_LT_DISMISS_BUTTON, TEST_ID_LT_SHOW_BUTTON, TEST_ID_LT_STATUS_OVERLAY, TEST_ID_LT_COUNTDOWN } from "../../constants/testIds";
import type { ReactNode } from "react";
import type { LowerThirdItem, AnimationPhase, TitleContent, TitleSubtitleContent, ScriptureContent } from "@invisible-av-booth/shared";
import { SwipeableRow } from "./SwipeableRow";
import { ActiveCountdown } from "./ActiveCountdown";

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
}: LowerThirdRowProps): ReactNode {
  const isDismissing = section === "active" && phase === "dismissing";

  // Build swipe-revealed actions
  const leftActions = section === "active" ? (
    <button className="lt-action-btn lt-action-danger" onClick={onForceClear} aria-label="Force Clear">
      <span className="lt-action-icon">⛔</span>
      <span className="lt-action-label">Force Clear</span>
    </button>
  ) : item.source === "volunteer" && !isActive ? (
    <button className="lt-action-btn lt-action-danger" onClick={() => onRemove?.(item.id)} aria-label="Delete">
      <span className="lt-action-icon">🗑</span>
      <span className="lt-action-label">Delete</span>
    </button>
  ) : section === "library" && !isActive ? (
    <button className="lt-action-btn lt-action-go-live" onClick={() => onActivate?.(item.id)} disabled={transitionLocked} aria-label="Go Live">
      <span className="lt-action-icon">⚡</span>
      <span className="lt-action-label">Go Live</span>
    </button>
  ) : undefined;

  const rightActions = section === "library" && !isActive ? (
    <button className="lt-action-btn lt-action-go-live" onClick={() => onActivate?.(item.id)} disabled={transitionLocked} aria-label="Go Live">
      <span className="lt-action-icon">⚡</span>
      <span className="lt-action-label">Go Live</span>
    </button>
  ) : undefined;

  const rowContent = (
    <div className={`lt-row ${item.used ? "lt-row--used" : ""} ${isActive && section === "library" ? "lt-row--active-badge" : ""}`} data-testid={`lt-row-${item.id}`}>
      {isDismissing && <div className="lt-status-overlay" data-testid={TEST_ID_LT_STATUS_OVERLAY}>Dismissing</div>}
      {isActive && section === "library" && <div className="lt-badge">Active</div>}

      <div className="lt-row-content">
        <span className="lt-row-title">{getDisplayTitle(item)}</span>
        <span className="lt-row-subtitle">{getSubtitle(item)}</span>
      </div>

      {/* Auto-dismiss countdown */}
      {section === "active" && autoDismissAt && !isDismissing && (
        <ActiveCountdown autoDismissAt={autoDismissAt} />
      )}

      {/* Primary action button */}
      {section === "active" && (
        <button className="lt-action-btn lt-action-primary" onClick={onDismiss} disabled={transitionLocked || isDismissing} data-testid={TEST_ID_LT_DISMISS_BUTTON} aria-label="Dismiss">
          <span className="lt-action-icon">✕</span>
          <span className="lt-action-label">Dismiss</span>
        </button>
      )}
      {section === "library" && !isActive && (
        <button className="lt-action-btn lt-action-primary" onClick={() => onActivate?.(item.id)} disabled={transitionLocked} data-testid={TEST_ID_LT_SHOW_BUTTON} aria-label="Show">
          <span className="lt-action-icon">▶</span>
          <span className="lt-action-label">Show</span>
        </button>
      )}
    </div>
  );

  return (
    <SwipeableRow leftActions={leftActions} rightActions={rightActions}>
      {rowContent}
    </SwipeableRow>
  );
}
