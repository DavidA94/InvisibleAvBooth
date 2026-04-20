import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { useStore } from "../store";
import type { Notification } from "../types";

const TOAST_DURATION = 5000;

export function NotificationLayer(): ReactNode {
  const notifications = useStore((s) => s.notifications);
  const toasts = notifications.filter((n) => n.level === "toast");
  const banners = notifications.filter((n) => n.level === "banner");
  const modals = notifications.filter((n) => n.level === "modal");

  return (
    <>
      {toasts.map((t) => (
        <Toast key={t.id} notification={t} />
      ))}
      {banners.length > 0 && <BannerStack banners={banners} />}
      {modals.length > 0 && modals[0] && <ModalNotification notification={modals[0]} />}
    </>
  );
}

function Toast({ notification }: { notification: Notification }): ReactNode {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      useStore.getState().removeNotification(notification.id);
    }, TOAST_DURATION);
    return () => clearTimeout(timer);
  }, [notification.id]);

  if (!visible) return null;

  return (
    <div
      data-testid="notification-toast"
      style={{
        position: "fixed",
        bottom: "1rem",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--color-surface-raised)",
        color: "var(--color-text)",
        padding: "0.75rem 1.25rem",
        borderRadius: "0.375rem",
        fontSize: "0.875rem",
        zIndex: 10000,
      }}
    >
      {notification.message}
    </div>
  );
}

function BannerStack({ banners }: { banners: Notification[] }): ReactNode {
  const [index, setIndex] = useState(0);
  const current = banners[index % banners.length];

  const dismiss = useCallback(() => {
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
        fontSize: "0.875rem",
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
        onClick={dismiss}
        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontWeight: "bold" }}
      >
        ✕
      </button>
    </div>
  );
}

function ModalNotification({ notification }: { notification: Notification }): ReactNode {
  const dismiss = (): void => {
    useStore.getState().removeNotification(notification.id);
  };

  return (
    <div
      data-testid="notification-modal"
      style={{ position: "fixed", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", zIndex: 10001 }}
    >
      <div style={{ background: "var(--color-surface)", borderRadius: "0.5rem", padding: "1.5rem", maxWidth: "24rem", textAlign: "center" }}>
        <p style={{ margin: "0 0 1rem", fontWeight: "bold", color: "var(--color-danger)" }}>{notification.message}</p>
        <button
          onClick={dismiss}
          style={{
            background: "var(--color-primary)",
            color: "var(--color-text)",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.5rem 1.5rem",
            cursor: "pointer",
          }}
        >
          Acknowledge
        </button>
      </div>
    </div>
  );
}
