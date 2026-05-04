import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { Modal } from "./Modal";
import { TEST_ID_CONFIRMATION_BODY, TEST_ID_CONFIRMATION_CANCEL_BUTTON, TEST_ID_CONFIRMATION_CONFIRM_BUTTON } from "../constants/testIds";

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
      <IonButton data-testid={TEST_ID_CONFIRMATION_CANCEL_BUTTON} fill="outline" size="default" onClick={onCancel}>
        {cancelLabel}
      </IonButton>
      <IonButton
        data-testid={TEST_ID_CONFIRMATION_CONFIRM_BUTTON}
        color={confirmVariant === "danger" ? "danger" : "primary"}
        size="default"
        onClick={onConfirm}
      >
        {confirmLabel}
      </IonButton>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onCancel} size="small" header={title} footer={footer}>
      {body && <div data-testid={TEST_ID_CONFIRMATION_BODY}>{typeof body === "string" ? <p className="margin-none">{body}</p> : body}</div>}
    </Modal>
  );
}
