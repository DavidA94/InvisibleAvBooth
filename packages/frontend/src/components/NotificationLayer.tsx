import { useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useIonToast } from "@ionic/react";
import { useStore } from "../store";
import { useShallow } from "zustand/react/shallow";
import { TEST_ID_NOTIFICATION_BANNER, TEST_ID_BANNER_COUNTER, TEST_ID_BANNER_DISMISS, TEST_ID_NOTIFICATION_MODAL } from "../constants/testIds";
import type { Notification } from "../types";
import { Modal } from "./Modal";

const ANIMATION_DELAY = 500;
const TOAST_DURATION = 5000;

export function NotificationLayer(): ReactNode {
  return (
    <>
      <ToastManager />
      <BannerManager />
      <ModalManager />
    </>
  );
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function ToastManager(): ReactNode {
  const [present, dismiss] = useIonToast();
  const toasts: Notification[] = useStore(useShallow((s) => s.notifications.filter((n) => n.level === "toast")));

  // Track the ID of the actively rendering toast to prevent duplicate presents
  const hasActiveToast = useRef<boolean | null>(false);

  useEffect(() => {
    const showToast = (notification: Notification): void => {
      present({
        message: notification.message,
        duration: TOAST_DURATION,
        position: "bottom",
        color: notification.severity === "error" ? "danger" : notification.severity === "warning" ? "warning" : "primary",
        onWillPresent: () => {
          // Clear this now that we've show the toast. That way if we have another one, the ID check at (2) works
          useStore.getState().removeNotification(notification.id);
        },
      });
    };

    // Nothing to do if we don't have a first toast
    if (!toasts[0]) {
      hasActiveToast.current = false;
      return;
    }

    const notification: Notification = toasts[0];
    dismiss().then(() => {
      if (hasActiveToast.current) {
        setTimeout(() => {
          showToast(notification);
        }, ANIMATION_DELAY);
      } else {
        hasActiveToast.current = true;
        showToast(notification);
      }
    });
  }, [dismiss, present, toasts]);

  return null;
}

// ── Banner ────────────────────────────────────────────────────────────────────

function BannerManager(): ReactNode {
  const banners = useStore(useShallow((s) => s.notifications.filter((n) => n.level === "banner")));
  const [index, setIndex] = useState(0);
  const current = banners[index % banners.length];

  const handleDismiss = useCallback(() => {
    if (current) useStore.getState().removeNotification(current.id);
  }, [current]);

  if (!current) return null;

  return (
    <div
      data-testid={TEST_ID_NOTIFICATION_BANNER}
      className={`notification-banner ${current.severity === "error" ? "notification-banner-error" : "notification-banner-warning"}`}
    >
      <span>{current.message}</span>
      {banners.length > 1 && (
        <span data-testid={TEST_ID_BANNER_COUNTER} className="text-caption">
          {(index % banners.length) + 1} of {banners.length}
          <button onClick={() => setIndex((i) => i - 1)} className="button-unstyled margin-left-tight">
            ◀
          </button>
          <button onClick={() => setIndex((i) => i + 1)} className="button-unstyled">
            ▶
          </button>
        </span>
      )}
      <button data-testid={TEST_ID_BANNER_DISMISS} onClick={handleDismiss} className="button-unstyled text-bold">
        ✕
      </button>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ModalManager(): ReactNode {
  const modals = useStore(useShallow((s) => s.notifications.filter((n) => n.level === "modal")));
  const current = modals[0];

  const handleAcknowledge = useCallback(() => {
    if (current) useStore.getState().removeNotification(current.id);
  }, [current]);

  return (
    <Modal
      isOpen={!!current}
      onClose={handleAcknowledge}
      header="Error"
      footer={
        <div data-testid={TEST_ID_NOTIFICATION_MODAL} className="layout-row justify-end">
          <button onClick={handleAcknowledge} className="button-primary button-padding-standard text-bold">
            Acknowledge
          </button>
        </div>
      }
    >
      <p className="margin-none text-bold text-danger">{current?.message}</p>
    </Modal>
  );
}
