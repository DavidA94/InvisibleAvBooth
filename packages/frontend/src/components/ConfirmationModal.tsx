import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { Modal } from "./Modal";

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
  const footer = (
    <div className="confirmation-footer">
      <IonButton data-testid="confirmation-cancel-btn" fill="outline" size="default" onClick={onCancel}>
        {cancelLabel}
      </IonButton>
      <IonButton data-testid="confirmation-confirm-btn" color={confirmVariant === "danger" ? "danger" : "primary"} size="default" onClick={onConfirm}>
        {confirmLabel}
      </IonButton>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="small" header={title} footer={footer}>
      {body && <div data-testid="confirmation-body">{typeof body === "string" ? <p className="margin-none">{body}</p> : body}</div>}
    </Modal>
  );
}
