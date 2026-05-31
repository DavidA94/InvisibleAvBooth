import { useEffect } from "react";
import type { ReactNode } from "react";
import { TEST_ID_MODAL_BACKDROP, TEST_ID_MODAL_CONTAINER, TEST_ID_MODAL_HEADER, TEST_ID_MODAL_BODY, TEST_ID_MODAL_FOOTER } from "../constants/testIds";

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
  // Scroll focused input into view when virtual keyboard opens on mobile
  useEffect(() => {
    if (!isOpen || !window.visualViewport) return;
    const onResize = (): void => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    window.visualViewport.addEventListener("resize", onResize);
    return () => window.visualViewport?.removeEventListener("resize", onResize);
  }, [isOpen]);
  if (!isOpen) return null;

  const hasBody = !!children;
  const showBorders = hasBody;

  return (
    <div
      data-testid={TEST_ID_MODAL_BACKDROP}
      className="overlay-backdrop"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      role="dialog"
      tabIndex={-1}
    >
      <div
        data-testid={TEST_ID_MODAL_CONTAINER}
        className={`modal-container ${size === "small" ? "modal-size-small" : "modal-size-large"}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="document"
      >
        {header && (
          <div data-testid={TEST_ID_MODAL_HEADER} className={`modal-header ${showBorders ? "modal-header-bordered" : ""}`}>
            {typeof header === "string" ? <span>{header}</span> : header}
          </div>
        )}
        {children && (
          <div data-testid={TEST_ID_MODAL_BODY} className="modal-body">
            {children}
          </div>
        )}
        {footer && (
          <div data-testid={TEST_ID_MODAL_FOOTER} className={`modal-footer ${showBorders ? "modal-footer-bordered" : ""}`}>
            {typeof footer === "string" ? <span>{footer}</span> : footer}
          </div>
        )}
        {!children && header && footer && <div className="modal-spacer" />}
      </div>
    </div>
  );
}
