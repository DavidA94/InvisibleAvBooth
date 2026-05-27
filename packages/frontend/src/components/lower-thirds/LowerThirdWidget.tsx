import { TEST_ID_LOWER_THIRD_WIDGET, TEST_ID_LT_ACTIVE_SECTION, TEST_ID_LT_LIBRARY_SECTION } from "../../constants/testIds";
import { useState } from "react";
import type { ReactNode } from "react";
import { IonButton } from "@ionic/react";
import { WidgetContainer } from "../WidgetContainer";
import { useLowerThirdState } from "../../hooks/useLowerThirdState";
import { LowerThirdRow } from "./LowerThirdRow";
import { AddLowerThirdDialog } from "./AddLowerThirdDialog";
import { EditLowerThirdDialog } from "./EditLowerThirdDialog";
import { PaginationControls } from "./PaginationControls";
import type { ConnectionStatus } from "../../types";
import type { LowerThirdItem, LowerThirdType, AddLowerThirdInput, EditLowerThirdInput } from "@invisible-av-booth/shared";
import "./LowerThirdWidget.css";

function deriveOverlayStatus(overlayConnected: boolean, overlayResolutionCorrect: boolean, hasTemplates: boolean): ConnectionStatus {
  if (!hasTemplates) return { label: "Overlay", status: "inactive" };
  if (!overlayConnected) return { label: "Overlay", status: "unhealthy" };
  if (!overlayResolutionCorrect) return { label: "Overlay", status: "degraded" };
  return { label: "Overlay", status: "healthy" };
}

export function LowerThirdWidget(): ReactNode {
  const { state, sendCommand } = useLowerThirdState();
  const { active, library, phase, autoDismissAt, overlayConnected, overlayResolutionCorrect, transitionLocked } = state;

  const hasTemplates = library.some((item) => item.source === "template");
  const connections = [deriveOverlayStatus(overlayConnected, overlayResolutionCorrect, hasTemplates)];

  const templateItems = library.filter((item) => item.source === "template").sort((a, b) => (a.templateName ?? "").localeCompare(b.templateName ?? ""));
  const volunteerItems = library.filter((item) => item.source === "volunteer").sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const handleDismiss = (): void => {
    void sendCommand({ type: "dismiss-active" });
  };

  const handleForceClear = (): void => {
    void sendCommand({ type: "force-clear" });
  };

  const handleActivate = (itemId: string): void => {
    console.log("[LT] Activating item:", itemId);
    sendCommand({ type: "activate", itemId }).then((result) => {
      console.log("[LT] Activate result:", result);
    });
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

  const [addType, setAddType] = useState<LowerThirdType | null>(null);
  const [showAddDropdown, setShowAddDropdown] = useState(false);
  const [editItem, setEditItem] = useState<LowerThirdItem | null>(null);

  const handleAddSave = (input: AddLowerThirdInput): void => {
    console.log("[LT] Adding to library:", input);
    sendCommand({ type: "add-to-library", input }).then((result) => {
      console.log("[LT] Add result:", result);
    });
    setAddType(null);
  };

  const handleEditSave = (itemId: string, patch: EditLowerThirdInput): void => {
    void sendCommand({ type: "edit-library-item", itemId, patch });
    setEditItem(null);
  };

  return (
    <WidgetContainer title="Lower Thirds" connections={connections}>
      <div className="lower-third-widget" data-testid={TEST_ID_LOWER_THIRD_WIDGET}>
        {/* Active Section */}
        <section className="lt-section" data-testid={TEST_ID_LT_ACTIVE_SECTION}>
          <span className="lt-section-title">Active</span>
          {active ? (
            <>
              <LowerThirdRow
                item={active}
                section="active"
                isActive={true}
                transitionLocked={transitionLocked}
                phase={phase}
                autoDismissAt={autoDismissAt}
                onDismiss={handleDismiss}
                onForceClear={handleForceClear}
              />
              {active.pages && active.pages.totalPages > 1 && (
                <PaginationControls
                  item={active}
                  pages={active.pages}
                  transitionLocked={transitionLocked}
                  onPageNext={handlePageNext}
                  onPagePrevious={handlePagePrevious}
                />
              )}
            </>
          ) : (
            <p className="lt-empty-state">Nothing active</p>
          )}
        </section>

        {/* Library Section */}
        <section className="lt-section lt-section--library" data-testid={TEST_ID_LT_LIBRARY_SECTION}>
          <span className="lt-section-title">Library</span>
          <div className="lt-library-items">
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
                    onEdit={setEditItem}
                  />
                ))}
              </>
            )}
          </div>
        </section>

        {/* Add Button */}
        <div className="lt-add-area">
          <IonButton expand="block" fill="outline" size="small" onClick={() => setShowAddDropdown(!showAddDropdown)}>
            Add
          </IonButton>
          {showAddDropdown && (
            <div className="lt-add-dropdown">
              <button className="lt-add-option" onClick={() => { setAddType("Title"); setShowAddDropdown(false); }}>Title</button>
              <button className="lt-add-option" onClick={() => { setAddType("TitleSubtitle"); setShowAddDropdown(false); }}>Title + Subtitle</button>
              <button className="lt-add-option" onClick={() => { setAddType("Scripture"); setShowAddDropdown(false); }}>Scripture</button>
            </div>
          )}
        </div>

        {addType && (
          <AddLowerThirdDialog type={addType} onSave={handleAddSave} onCancel={() => setAddType(null)} />
        )}

        {editItem && (
          <EditLowerThirdDialog item={editItem} onSave={handleEditSave} onCancel={() => setEditItem(null)} />
        )}
      </div>
    </WidgetContainer>
  );
}
