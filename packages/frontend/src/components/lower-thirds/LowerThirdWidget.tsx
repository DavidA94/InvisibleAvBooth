import type { ReactNode } from "react";
import { WidgetContainer } from "../WidgetContainer";
import { useLowerThirdState } from "../../hooks/useLowerThirdState";
import { LowerThirdRow } from "./LowerThirdRow";
import type { ConnectionStatus } from "../../types";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

function deriveOverlayStatus(overlayConnected: boolean, overlayResolutionCorrect: boolean, hasTemplates: boolean): ConnectionStatus {
  if (!hasTemplates) return { label: "Overlay", status: "inactive" };
  if (!overlayConnected) return { label: "Overlay", status: "unhealthy" };
  if (!overlayResolutionCorrect) return { label: "Overlay", status: "degraded" };
  return { label: "Overlay", status: "healthy" };
}

export function LowerThirdWidget(): ReactNode {
  const { state, sendCommand } = useLowerThirdState();
  const { active, library, phase, autoDismissAt, overlayConnected, overlayResolutionCorrect, transitionLocked } = state;

  const hasTemplates = library.some((i) => i.source === "template");
  const connections = [deriveOverlayStatus(overlayConnected, overlayResolutionCorrect, hasTemplates)];

  const templateItems = library.filter((i) => i.source === "template").sort((a, b) => (a.templateName ?? "").localeCompare(b.templateName ?? ""));
  const volunteerItems = library.filter((i) => i.source === "volunteer").sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handleDismiss = (): void => {
    void sendCommand({ type: "dismiss-active" });
  };

  const handleForceClear = (): void => {
    void sendCommand({ type: "force-clear" });
  };

  const handleActivate = (itemId: string): void => {
    void sendCommand({ type: "activate", itemId });
  };

  const handleRemove = (itemId: string): void => {
    void sendCommand({ type: "remove-from-library", itemId });
  };

  const handlePageNext = (): void => {
    void sendCommand({ type: "page-next" });
  };

  const handlePagePrevious = (): void => {
    void sendCommand({ type: "page-previous" });
  };

  return (
    <WidgetContainer title="Lower Thirds" connections={connections}>
      <div className="lower-third-widget" data-testid="lower-third-widget">
        {/* Active Section */}
        <section className="lt-section" data-testid="lt-active-section">
          <h3 className="lt-section-title">Active</h3>
          {active ? (
            <LowerThirdRow
              item={active}
              section="active"
              isActive={true}
              transitionLocked={transitionLocked}
              phase={phase}
              autoDismissAt={autoDismissAt}
              onDismiss={handleDismiss}
              onForceClear={handleForceClear}
              onPageNext={handlePageNext}
              onPagePrevious={handlePagePrevious}
            />
          ) : (
            <p className="lt-empty-state">Nothing active</p>
          )}
        </section>

        {/* Library Section */}
        <section className="lt-section" data-testid="lt-library-section">
          <h3 className="lt-section-title">Library</h3>
          {templateItems.length === 0 && volunteerItems.length === 0 ? (
            <p className="lt-empty-state">No items available</p>
          ) : (
            <>
              {templateItems.map((item) => (
                <LowerThirdRow
                  key={item.id}
                  item={item}
                  section="library"
                  isActive={active?.id === item.id}
                  transitionLocked={transitionLocked}
                  onActivate={handleActivate}
                  onRemove={handleRemove}
                />
              ))}
              {volunteerItems.map((item) => (
                <LowerThirdRow
                  key={item.id}
                  item={item}
                  section="library"
                  isActive={active?.id === item.id}
                  transitionLocked={transitionLocked}
                  onActivate={handleActivate}
                  onRemove={handleRemove}
                />
              ))}
            </>
          )}
        </section>
      </div>
    </WidgetContainer>
  );
}
