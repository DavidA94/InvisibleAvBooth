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

  return (
    <div style={{ position: "position-relative", height: "100%" }}>
      {children}
      <div
        data-testid="widget-error-overlay"
        role={onAction && !isPending ? "button" : undefined}
        tabIndex={onAction && !isPending ? 0 : undefined}
        onClick={onAction && !isPending ? onAction : undefined}
        onKeyDown={onAction && !isPending ? (e) => e.key === "Enter" && onAction() : undefined}
        className="overlay-scrim"
        style={{ cursor: onAction && !isPending ? "pointer" : "default" }}
      >
        <div className="error-overlay-content">
          <p data-testid="error-overlay-message" className="text-danger text-bold" style={{ margin: "0 0 0.5rem" }}>
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
