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

  const hasBody = !!children;
  const showBorders = hasBody;

  return (
    <div
      data-testid="modal-backdrop"
      className="overlay-backdrop"
      style={{ zIndex: 9999 }}
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      tabIndex={-1}
    >
      <div
        data-testid="modal-container"
        className="modal-container"
        style={{ width: size === "small" ? "50%" : "80%", maxWidth: "90vw", maxHeight: "80vh" }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {header && (
          <div
            data-testid="modal-header"
            className="modal-header"
            style={{ borderBottom: showBorders ? "1px solid var(--color-border)" : undefined }}
          >
            {typeof header === "string" ? <span>{header}</span> : header}
          </div>
        )}
        {children && (
          <div data-testid="modal-body" className="modal-body">
            {children}
          </div>
        )}
        {footer && (
          <div
            data-testid="modal-footer"
            className="modal-footer"
            style={{ borderTop: showBorders ? "1px solid var(--color-border)" : undefined }}
          >
            {typeof footer === "string" ? <span>{footer}</span> : footer}
          </div>
        )}
        {!children && header && footer && <div className="modal-spacer" />}
      </div>
    </div>
  );
}
