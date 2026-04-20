import type { ReactNode } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  body?: string | ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  confirmVariant?: "danger" | "primary";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title,
  body,
  confirmLabel,
  cancelLabel,
  confirmVariant = "danger",
  onConfirm,
  onCancel,
}: ConfirmationModalProps): ReactNode {
  if (!isOpen) return null;

  return (
    <div
      data-testid="confirmation-modal"
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 9999 }}
      onClick={onCancel}
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
      role="dialog"
      tabIndex={-1}
    >
      <div
        style={{ background: "var(--color-surface)", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "24rem", width: "90%" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {title && (
          <h2 data-testid="confirmation-title" style={{ margin: "0 0 0.75rem", fontWeight: "bold" }}>
            {title}
          </h2>
        )}
        {body && (
          <div data-testid="confirmation-body" style={{ marginBottom: "1rem" }}>
            {typeof body === "string" ? <p style={{ margin: 0 }}>{body}</p> : body}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            data-testid="confirmation-confirm-btn"
            onClick={onConfirm}
            color={confirmVariant}
            style={{
              background: confirmVariant === "danger" ? "var(--color-danger)" : "var(--color-primary)",
              color: "var(--color-text)",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0.625rem 1.25rem",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
          <button
            data-testid="confirmation-cancel-btn"
            onClick={onCancel}
            style={{
              background: "transparent",
              color: "var(--color-text)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.375rem",
              padding: "0.625rem 1.25rem",
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
