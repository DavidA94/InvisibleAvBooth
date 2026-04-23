import type { ReactNode } from "react";
import { IonSpinner } from "@ionic/react";

type OverlayDisplay = "flex-column" | "flex-row" | "block" | "grid";

const DISPLAY_CLASS: Record<OverlayDisplay, string> = {
  "flex-column": "layout-column",
  "flex-row": "layout-row",
  block: "",
  grid: "",
};

interface WidgetErrorOverlayProps {
  isVisible: boolean;
  message: string;
  actionLabel: string;
  onAction?: () => void;
  isPending: boolean;
  /** How the wrapper lays out its children. Defaults to "block". */
  display?: OverlayDisplay;
  children: ReactNode;
}

export function WidgetErrorOverlay({ isVisible, message, actionLabel, onAction, isPending, display = "block", children }: WidgetErrorOverlayProps): ReactNode {
  const interactive = isVisible && onAction && !isPending;

  return (
    <div className={`error-overlay-wrapper ${DISPLAY_CLASS[display]}`}>
      {children}
      {isVisible && (
        <div
          data-testid="widget-error-overlay"
          role={interactive ? "button" : undefined}
          tabIndex={interactive ? 0 : undefined}
          onClick={interactive ? onAction : undefined}
          onKeyDown={interactive ? (e) => e.key === "Enter" && onAction() : undefined}
          className={`overlay-scrim ${interactive ? "cursor-pointer" : ""}`}
        >
          <div className="error-overlay-content">
            <p data-testid="error-overlay-message" className="text-danger text-bold error-overlay-message">
              {message}
            </p>
            <p data-testid="error-overlay-action" className="margin-none">
              {isPending ? <IonSpinner name="crescent" /> : actionLabel}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
