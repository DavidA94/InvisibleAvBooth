import { TEST_ID_LOWER_THIRD_WIDGET, TEST_ID_LOWER_THIRD_ACTIVE_SECTION, TEST_ID_LOWER_THIRD_LIBRARY_SECTION } from "../../constants/testIds";
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
    sendCommand({ type: "activate", itemId });
  };

  const handleActivateImmediate = (itemId: string): void => {
    sendCommand({ type: "activate", itemId, skipAnimation: true });
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
  const [openRowId, setOpenRowId] = useState<string | null>(null);

  const handleAddSave = (input: AddLowerThirdInput): void => {
    sendCommand({ type: "add-to-library", input });
    setAddType(null);
  };

  const handleAddGoLive = (input: AddLowerThirdInput): void => {
    sendCommand({ type: "add-to-library", input }).then((result) => {
      if (result.success && "itemId" in result) {
        sendCommand({ type: "activate", itemId: (result as { itemId: string }).itemId });
      }
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
        <section className="lt-section" data-testid={TEST_ID_LOWER_THIRD_ACTIVE_SECTION}>
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
                onSwipeOpen={() => setOpenRowId(active.id)}
                forceClose={openRowId !== active.id && openRowId !== null}
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
        <section className="lt-section lt-section--library" data-testid={TEST_ID_LOWER_THIRD_LIBRARY_SECTION}>
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
                    onActivateImmediate={handleActivateImmediate}
                    onRemove={handleRemove}
                    onSwipeOpen={() => setOpenRowId(item.id)}
                    forceClose={openRowId !== item.id && openRowId !== null}
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
                    onActivateImmediate={handleActivateImmediate}
                    onRemove={handleRemove}
                    onEdit={setEditItem}
                    onSwipeOpen={() => setOpenRowId(item.id)}
                    forceClose={openRowId !== item.id && openRowId !== null}
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
              <button
                className="lt-add-option"
                onClick={() => {
                  setAddType("Title");
                  setShowAddDropdown(false);
                }}
              >
                Title
              </button>
              <button
                className="lt-add-option"
                onClick={() => {
                  setAddType("TitleSubtitle");
                  setShowAddDropdown(false);
                }}
              >
                Title + Subtitle
              </button>
              <button
                className="lt-add-option"
                onClick={() => {
                  setAddType("Scripture");
                  setShowAddDropdown(false);
                }}
              >
                Scripture
              </button>
            </div>
          )}
        </div>

        {addType && <AddLowerThirdDialog type={addType} onSave={handleAddSave} onGoLive={handleAddGoLive} onCancel={() => setAddType(null)} />}

        {editItem && <EditLowerThirdDialog item={editItem} onSave={handleEditSave} onCancel={() => setEditItem(null)} />}
      </div>
    </WidgetContainer>
  );
}
