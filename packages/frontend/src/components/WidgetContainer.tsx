import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { IonPopover } from "@ionic/react";
import { useResizeObserver } from "../hooks/useResizeObserver";
import type { ConnectionStatus } from "../types";
import { TEST_ID_WIDGET_CONTAINER, TEST_ID_WIDGET_TITLE_BAR, TEST_ID_CONNECTION_INDICATORS, TEST_ID_CONNECTION_POPOVER } from "../constants/testIds";

export type { ConnectionStatus };

interface WidgetContainerProps {
  title: string;
  connections: ConnectionStatus[];
  children: ReactNode;
}

const COLLAPSE_THRESHOLD = 200;

const DOT_CLASS: Record<ConnectionStatus["status"], string> = {
  healthy: "widget-dot-healthy",
  degraded: "widget-dot-degraded",
  unhealthy: "widget-dot-unhealthy",
  inactive: "widget-dot-inactive",
};

const STATUS_LABEL: Record<ConnectionStatus["status"], string> = {
  healthy: "Healthy",
  degraded: "Degraded",
  unhealthy: "Unhealthy",
  inactive: "Inactive",
};

let instanceCounter = 0;

export function WidgetContainer({ title, connections, children }: WidgetContainerProps): ReactNode {
  const titleBarRef = useRef<HTMLDivElement>(null);
  const width = useResizeObserver(titleBarRef);
  const collapsed = width > 0 && width < COLLAPSE_THRESHOLD;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [triggerId] = useState(() => `wc-indicators-${++instanceCounter}`);

  return (
    <div data-testid={TEST_ID_WIDGET_CONTAINER} className="widget-wrapper">
      <div ref={titleBarRef} data-testid={TEST_ID_WIDGET_TITLE_BAR} className="widget-title-bar">
        <span className="text-bold">{title}</span>
        <span className="fill-remaining" />
        <span
          id={triggerId}
          data-testid={TEST_ID_CONNECTION_INDICATORS}
          role="button"
          tabIndex={0}
          onClick={() => setPopoverOpen(true)}
          onKeyDown={(e) => e.key === "Enter" && setPopoverOpen(true)}
          className="widget-indicators"
        >
          {collapsed ? (
            <>
              <span>Status</span>
              {connections.map((c) => (
                <span key={c.label} data-status={c.status} className={DOT_CLASS[c.status]}>●</span>
              ))}
            </>
          ) : (
            connections.map((c) => (
              <span key={c.label} className="layout-row gap-tight">
                {c.label} <span data-status={c.status} className={DOT_CLASS[c.status]}>●</span>
              </span>
            ))
          )}
        </span>
        <IonPopover
          data-testid={TEST_ID_CONNECTION_POPOVER}
          isOpen={popoverOpen}
          onDidDismiss={() => setPopoverOpen(false)}
          trigger={triggerId}
          side="bottom"
          alignment="end"
        >
          <div className="padding-standard">
            {connections.map((c) => (
              <div key={c.label} className="popover-status-row">
                <span data-status={c.status} className={DOT_CLASS[c.status]}>●</span>
                <span className="popover-status-label">{c.label}</span>
                <span className="text-muted">{STATUS_LABEL[c.status]}</span>
              </div>
            ))}
          </div>
        </IonPopover>
      </div>
      <div className="widget-content">{children}</div>
    </div>
  );
}
