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
    <div style={{ position: "relative", height: "100%" }}>
      {children}
      <div
        data-testid="widget-error-overlay"
        role={onAction && !isPending ? "button" : undefined}
        tabIndex={onAction && !isPending ? 0 : undefined}
        onClick={onAction && !isPending ? onAction : undefined}
        onKeyDown={onAction && !isPending ? (e) => e.key === "Enter" && onAction() : undefined}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: onAction && !isPending ? "pointer" : "default",
        }}
      >
        <div style={{ textAlign: "center", color: "var(--color-text)", padding: "1rem" }}>
          <p data-testid="error-overlay-message" style={{ color: "var(--color-danger)", fontWeight: "bold", margin: "0 0 0.5rem" }}>
            {message}
          </p>
          <p data-testid="error-overlay-action" style={{ margin: 0, fontSize: "0.875rem" }}>
            {isPending ? <IonSpinner name="crescent" /> : actionLabel}
          </p>
        </div>
      </div>
    </div>
  );
}
