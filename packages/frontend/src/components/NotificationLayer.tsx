import { useState, useCallback, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { useIonToast } from "@ionic/react";
import { useStore } from "../store";
import type { Notification } from "../types";

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
  const toasts: Notification[] = useStore((s) => s.notifications.filter((n) => n.level === "toast"));

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
  const banners = useStore((s) => s.notifications.filter((n) => n.level === "banner"));
  const [index, setIndex] = useState(0);
  const current = banners[index % banners.length];

  const handleDismiss = useCallback(() => {
    if (current) useStore.getState().removeNotification(current.id);
  }, [current]);

  if (!current) return null;

  return (
    <div
      data-testid="notification-banner"
      style={{
        position: "fixed",
        top: "3rem",
        left: "50%",
        transform: "translateX(-50%)",
        background: current.severity === "error" ? "var(--color-danger)" : "var(--color-warning)",
        color: current.severity === "error" ? "var(--color-text)" : "var(--color-bg)",
        padding: "0.5rem 1rem",
        borderRadius: "0.375rem",
        fontSize: "max(0.875rem, 14px)",
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        zIndex: 10000,
      }}
    >
      <span>{current.message}</span>
      {banners.length > 1 && (
        <span data-testid="banner-counter" style={{ fontSize: "0.75rem" }}>
          {(index % banners.length) + 1} of {banners.length}
          <button
            onClick={() => setIndex((i) => i - 1)}
            style={{ marginLeft: "0.25rem", background: "none", border: "none", color: "inherit", cursor: "pointer" }}
          >
            ◀
          </button>
          <button onClick={() => setIndex((i) => i + 1)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer" }}>
            ▶
          </button>
        </span>
      )}
      <button
        data-testid="banner-dismiss"
        onClick={handleDismiss}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
      >
        ✕
      </button>
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function ModalManager(): ReactNode {
  const modals = useStore((s) => s.notifications.filter((n) => n.level === "modal"));
  const current = modals[0];

  if (!current) return null;

  return (
    <div
      data-testid="notification-modal"
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 10001 }}
    >
      <div style={{ background: "var(--color-surface)", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "24rem", textAlign: "center" }}>
        <p style={{ margin: "0 0 1rem", fontWeight: "bold", color: "var(--color-danger)", fontSize: "max(1rem, 16px)" }}>{current.message}</p>
        <button
          onClick={() => useStore.getState().removeNotification(current.id)}
          style={{
            background: "var(--color-primary)",
            color: "var(--color-text)",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.5rem 1.5rem",
            cursor: "pointer",
            fontSize: "max(0.875rem, 14px)",
          }}
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}
