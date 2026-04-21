import type { ReactNode } from "react";

type ModalSize = "small" | "large";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  size?: ModalSize;
  header?: string | ReactNode;
  footer?: string | ReactNode;
  children?: ReactNode;
}

export function Modal({ isOpen, onClose, size = "small", header, footer, children }: ModalProps): ReactNode {
  if (!isOpen) return null;

  const width = size === "small" ? "50%" : "80%";
  const hasBody = !!children;
  const showBorders = hasBody;

  return (
    <div
      data-testid="modal-backdrop"
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 9999 }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      tabIndex={-1}
    >
      <div
        data-testid="modal-container"
        style={{
          background: "var(--color-surface)",
          borderRadius: "0.5rem",
          width,
          maxWidth: "90vw",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {header && (
          <div
            data-testid="modal-header"
            style={{
              padding: "1rem 1.25rem",
              fontWeight: "bold",
              fontSize: "1.125rem",
              borderBottom: showBorders ? "1px solid var(--color-border)" : undefined,
            }}
          >
            {typeof header === "string" ? <span>{header}</span> : header}
          </div>
        )}
        {children && (
          <div data-testid="modal-body" style={{ padding: "1.25rem", overflow: "auto", flex: "1 1 auto" }}>
            {children}
          </div>
        )}
        {footer && (
          <div
            data-testid="modal-footer"
            style={{
              padding: "1rem 1.25rem",
              borderTop: showBorders ? "1px solid var(--color-border)" : undefined,
            }}
          >
            {typeof footer === "string" ? <span>{footer}</span> : footer}
          </div>
        )}
        {/* Header + footer only (no body) — just spacing between them */}
        {!children && header && footer && <div style={{ height: "0.5rem" }} />}
      </div>
    </div>
  );
}
