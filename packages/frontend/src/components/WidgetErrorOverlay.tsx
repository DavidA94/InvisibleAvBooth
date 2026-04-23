import type { ReactNode } from "react";
import { IonSpinner } from "@ionic/react";

interface WidgetErrorOverlayProps {
  isVisible: boolean;
  message: string;
  actionLabel: string;
  onAction?: () => void;
  isPending: boolean;
  children: ReactNode;
}

export function WidgetErrorOverlay({ isVisible, message, actionLabel, onAction, isPending, children }: WidgetErrorOverlayProps): ReactNode {
  if (!isVisible) return <>{children}</>;

  const interactive = onAction && !isPending;

  return (
    <div className="error-overlay-wrapper">
      {children}
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
    </div>
  );
}
