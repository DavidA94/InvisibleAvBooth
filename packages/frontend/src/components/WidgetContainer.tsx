import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { IonPopover } from "@ionic/react";
import { useResizeObserver } from "../hooks/useResizeObserver";

export interface ConnectionStatus {
  label: string;
  healthy: boolean;
}

interface WidgetContainerProps {
  title: string;
  connections: ConnectionStatus[];
  children: ReactNode;
}

const COLLAPSE_THRESHOLD = 200;

export function WidgetContainer({ title, connections, children }: WidgetContainerProps): ReactNode {
  const titleBarRef = useRef<HTMLDivElement>(null);
  const width = useResizeObserver(titleBarRef);
  const collapsed = width > 0 && width < COLLAPSE_THRESHOLD;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const indicatorRef = useRef<HTMLSpanElement>(null);

  return (
    <div
      data-testid="widget-container"
      style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--color-surface)", borderRadius: "0.375rem", overflow: "hidden" }}
    >
      <div
        ref={titleBarRef}
        data-testid="widget-title-bar"
        style={{ display: "flex", alignItems: "center", height: "2.5rem", padding: "0 var(--space-widget-inner)", fontSize: "0.875rem" }}
      >
        <span style={{ fontWeight: "bold" }}>{title}</span>
        <span style={{ flex: 1 }} />
        <span
          ref={indicatorRef}
          data-testid="connection-indicators"
          role="button"
          tabIndex={0}
          onClick={() => setPopoverOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setPopoverOpen(true)}
          style={{ display: "flex", alignItems: "center", gap: "0.375rem", cursor: "pointer" }}
        >
          {collapsed ? (
            <>
              <span>Status</span>
              {connections.map((c) => (
                <span key={c.label} className={c.healthy ? "widget-dot-healthy" : "widget-dot-unhealthy"}>
                  ●
                </span>
              ))}
            </>
          ) : (
            connections.map((c) => (
              <span key={c.label} style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {c.label} <span className={c.healthy ? "widget-dot-healthy" : "widget-dot-unhealthy"}>●</span>
              </span>
            ))
          )}
        </span>
        <IonPopover
          data-testid="connection-popover"
          isOpen={popoverOpen}
          onDidDismiss={() => setPopoverOpen(false)}
          reference="event"
          trigger={undefined}
          event={undefined}
        >
          <div style={{ padding: "0.75rem" }}>
            {connections.map((c) => (
              <div key={c.label} style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem" }}>
                <span className={c.healthy ? "widget-dot-healthy" : "widget-dot-unhealthy"}>●</span>
                <span>{c.label}</span>
                <span style={{ color: "var(--color-text-muted)", fontSize: "0.75rem" }}>{c.healthy ? "Healthy" : "Unhealthy"}</span>
              </div>
            ))}
          </div>
        </IonPopover>
      </div>
      <div style={{ flex: 1, padding: "var(--space-widget-inner)", overflow: "hidden" }}>{children}</div>
    </div>
  );
}
