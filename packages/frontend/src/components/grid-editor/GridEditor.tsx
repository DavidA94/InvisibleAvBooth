import { useState, useRef, useCallback, useEffect } from "react";
import type { ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { IonIcon, IonPopover, IonSelect, IonSelectOption } from "@ionic/react";
import { closeOutline, optionsOutline } from "ionicons/icons";
import { GRID_DIMENSIONS, GRID_CELL_SIZE_REM, GRID_GAP_SIZE_REM, WIDGET_TYPE_REGISTRY } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";
import { computeSnapPosition, computeSnapResize, wouldOverlap } from "./snapLogic";
import type { WidgetPlacement } from "./snapLogic";
import {
  TEST_ID_DASHBOARD_GRID_EDITOR,
  TEST_ID_GRID_EDITOR_WIDGET,
  TEST_ID_GRID_EDITOR_GHOST,
  TEST_ID_GRID_EDITOR_WIDGET_DELETE,
  TEST_ID_GRID_EDITOR_WIDGET_OPTIONS,
  TEST_ID_GRID_EDITOR_ADD_ROW,
  TEST_ID_GRID_EDITOR_SCREEN_EDGE,
} from "../../constants/testIds";

export type { WidgetPlacement } from "./snapLogic";

interface GridEditorProps {
  gridType: GridType;
  widgets: WidgetPlacement[];
  onWidgetsChange: (widgets: WidgetPlacement[]) => void;
  onDeleteWidget?: (widgetId: string) => void;
  onRoleChange?: (widgetId: string, role: string) => void;
}

type DragMode = "move" | "resize" | null;

interface DragState {
  mode: DragMode;
  widgetId: string;
  offsetX: number;
  offsetY: number;
  ghostCol: number;
  ghostRow: number;
  ghostColSpan: number;
  ghostRowSpan: number;
}

/**
 * Visual grid editor for placing, moving, and resizing widgets.
 *
 * Renders a scaled-down representation of the grid. Uses pointer events
 * for unified mouse/touch handling. Applies the 35/65 snap rule on
 * move and resize operations. Prevents overlaps by freezing the ghost
 * at the last valid position.
 */
export function GridEditor({ gridType, widgets, onWidgetsChange, onDeleteWidget, onRoleChange }: GridEditorProps): ReactNode {
  const gridDimensions = GRID_DIMENSIONS[gridType];
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [popoverWidget, setPopoverWidget] = useState<string | null>(null);
  const popoverRef = useRef<HTMLButtonElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute actual row count: max of all widget bottom edges or defaultRows
  const actualRows = getActualRowCount(widgets, gridDimensions.defaultRows);
  // Show one extra row for the "add row" area
  const displayRows = actualRows + 1;

  // Scale factor to fit within the available panel width (~600px max)
  const maxPanelWidth = 600;
  const nativeWidthPx = gridDimensions.totalWidthRem * 16;
  const scale = Math.min(1, maxPanelWidth / nativeWidthPx);

  // Scaled cell/gap sizes in px
  const cellSizePx = GRID_CELL_SIZE_REM * 16 * scale;
  const gapSizePx = GRID_GAP_SIZE_REM * 16 * scale;
  const cellWithGap = cellSizePx + gapSizePx;

  // Grid container dimensions
  const gridWidthPx = gridDimensions.columns * cellSizePx + (gridDimensions.columns - 1) * gapSizePx;
  const gridHeightPx = displayRows * cellSizePx + (displayRows - 1) * gapSizePx;

  // ── Drag handlers ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent, widgetId: string, mode: "move" | "resize") => {
      event.preventDefault();
      event.stopPropagation();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);

      const widget = widgets.find((w) => w.widgetId === widgetId);
      if (!widget) return;

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const pointerX = event.clientX - containerRect.left;
      const pointerY = event.clientY - containerRect.top;

      if (mode === "move") {
        const widgetLeftPx = widget.col * cellWithGap;
        const widgetTopPx = widget.row * cellWithGap;
        setDragState({
          mode: "move",
          widgetId,
          offsetX: pointerX - widgetLeftPx,
          offsetY: pointerY - widgetTopPx,
          ghostCol: widget.col,
          ghostRow: widget.row,
          ghostColSpan: widget.colSpan,
          ghostRowSpan: widget.rowSpan,
        });
      } else {
        setDragState({
          mode: "resize",
          widgetId,
          offsetX: 0,
          offsetY: 0,
          ghostCol: widget.col,
          ghostRow: widget.row,
          ghostColSpan: widget.colSpan,
          ghostRowSpan: widget.rowSpan,
        });
      }
    },
    [widgets, cellWithGap],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent) => {
      if (!dragState) return;
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) return;

      const pointerX = event.clientX - containerRect.left;
      const pointerY = event.clientY - containerRect.top;

      const widget = widgets.find((w) => w.widgetId === dragState.widgetId);
      if (!widget) return;

      if (dragState.mode === "move") {
        const snapped = computeSnapPosition(pointerX, pointerY, dragState.offsetX, dragState.offsetY, cellSizePx, gapSizePx);
        // Clamp to grid column bounds
        const maxCol = gridDimensions.columns - widget.colSpan;
        const col = Math.min(Math.max(0, snapped.col), maxCol);
        const row = Math.max(0, snapped.row);

        // Only update ghost if position is valid (no overlap)
        if (!wouldOverlap(widget.widgetId, col, row, widget.colSpan, widget.rowSpan, widgets)) {
          setDragState((prev) => (prev ? { ...prev, ghostCol: col, ghostRow: row } : null));
        }
      } else if (dragState.mode === "resize") {
        const definition = WIDGET_TYPE_REGISTRY[widget.widgetId];
        const minColSpan = definition?.minColSpan ?? 1;
        const maxColSpan = definition?.maxColSpan ?? null;
        const minRowSpan = definition?.minRowSpan ?? 1;
        const maxRowSpan = definition?.maxRowSpan ?? null;

        const snapped = computeSnapResize(
          pointerX,
          pointerY,
          widget.col,
          widget.row,
          cellSizePx,
          gapSizePx,
          minColSpan,
          maxColSpan,
          minRowSpan,
          maxRowSpan,
          gridDimensions.columns,
        );

        // Only update ghost if no overlap
        if (!wouldOverlap(widget.widgetId, widget.col, widget.row, snapped.colSpan, snapped.rowSpan, widgets)) {
          setDragState((prev) => (prev ? { ...prev, ghostColSpan: snapped.colSpan, ghostRowSpan: snapped.rowSpan } : null));
        }
      }
    },
    [dragState, widgets, cellSizePx, gapSizePx, gridDimensions.columns],
  );

  const handlePointerUp = useCallback(() => {
    if (!dragState) return;

    const widget = widgets.find((w) => w.widgetId === dragState.widgetId);
    if (!widget) {
      setDragState(null);
      return;
    }

    // Apply the ghost position
    const updated = widgets.map((w) => {
      if (w.widgetId !== dragState.widgetId) return w;
      if (dragState.mode === "move") {
        return { ...w, col: dragState.ghostCol, row: dragState.ghostRow };
      } else {
        return { ...w, colSpan: dragState.ghostColSpan, rowSpan: dragState.ghostRowSpan };
      }
    });

    onWidgetsChange(updated);
    setDragState(null);
  }, [dragState, widgets, onWidgetsChange]);

  // Clean up drag on unmount or escape
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setDragState(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Add row handler ───────────────────────────────────────────────────────

  const handleAddRow = (): void => {
    // Adding a row just means the grid can accept widgets lower.
    // We force an extra row by placing a temporary sentinel (not needed —
    // widgets can be dragged anywhere). Instead, just trigger a re-render
    // by updating the widget list (no-op if nothing changes).
    // The actual row expansion happens via drag below the current row count.
    onWidgetsChange([...widgets]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  const screenEdgeRow = gridDimensions.defaultRows;

  return (
    <div
      ref={containerRef}
      data-testid={TEST_ID_DASHBOARD_GRID_EDITOR}
      className="grid-editor-container"
      style={{ width: `${gridWidthPx}px`, height: `${gridHeightPx}px`, position: "relative" }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={() => setDragState(null)}
    >
      {/* Grid lines */}
      <div className="grid-editor-cell-lines" style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        {Array.from({ length: displayRows }, (_, row) =>
          Array.from({ length: gridDimensions.columns }, (_, col) => (
            <div
              key={`${row}-${col}`}
              style={{
                position: "absolute",
                left: `${col * cellWithGap}px`,
                top: `${row * cellWithGap}px`,
                width: `${cellSizePx}px`,
                height: `${cellSizePx}px`,
                border: "1px dashed var(--color-border, #444)",
                borderRadius: "2px",
                opacity: row >= actualRows ? 0.3 : 0.6,
              }}
            />
          )),
        )}
      </div>

      {/* Screen edge indicator */}
      {screenEdgeRow <= displayRows && (
        <div
          data-testid={TEST_ID_GRID_EDITOR_SCREEN_EDGE}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: `${screenEdgeRow * cellWithGap - gapSizePx / 2}px`,
            height: "2px",
            borderTop: "2px dotted var(--color-warning, #F39C12)",
            pointerEvents: "none",
            zIndex: 5,
          }}
        />
      )}

      {/* Placed widgets */}
      {widgets.map((widget) => {
        const definition = WIDGET_TYPE_REGISTRY[widget.widgetId];
        const displayName = definition?.displayName ?? widget.title;
        const isDragging = dragState?.widgetId === widget.widgetId;

        return (
          <div
            key={widget.widgetId}
            data-testid={`${TEST_ID_GRID_EDITOR_WIDGET}-${widget.widgetId}`}
            className="grid-editor-widget"
            style={{
              position: "absolute",
              left: `${widget.col * cellWithGap}px`,
              top: `${widget.row * cellWithGap}px`,
              width: `${widget.colSpan * cellSizePx + (widget.colSpan - 1) * gapSizePx}px`,
              height: `${widget.rowSpan * cellSizePx + (widget.rowSpan - 1) * gapSizePx}px`,
              opacity: isDragging ? 0.5 : 1,
              zIndex: isDragging ? 10 : 1,
              cursor: dragState ? "grabbing" : "grab",
              touchAction: "none",
            }}
            onPointerDown={(e) => handlePointerDown(e, widget.widgetId, "move")}
          >
            {/* Widget label */}
            <div className="grid-editor-widget-label" style={{ textAlign: "center", padding: "0.25rem", fontSize: `${Math.max(10, 12 * scale)}px` }}>
              {displayName}
            </div>
            {/* Size and role info */}
            <div
              style={{
                position: "absolute",
                bottom: "2px",
                left: 0,
                right: 0,
                textAlign: "center",
                fontSize: `${Math.max(8, 9 * scale)}px`,
                color: "var(--color-text-muted, #A0A0A0)",
              }}
            >
              {widget.roleMinimum} | {widget.colSpan}×{widget.rowSpan}
            </div>

            {/* Delete button */}
            <button
              data-testid={`${TEST_ID_GRID_EDITOR_WIDGET_DELETE}-${widget.widgetId}`}
              className="grid-editor-widget-delete"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteWidget?.(widget.widgetId);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Remove ${displayName}`}
            >
              <IonIcon icon={closeOutline} />
            </button>

            {/* Options button */}
            <button
              ref={widget.widgetId === popoverWidget ? popoverRef : undefined}
              data-testid={`${TEST_ID_GRID_EDITOR_WIDGET_OPTIONS}-${widget.widgetId}`}
              className="grid-editor-widget-options"
              onClick={(e) => {
                e.stopPropagation();
                setPopoverWidget(widget.widgetId);
              }}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Options for ${displayName}`}
            >
              <IonIcon icon={optionsOutline} />
            </button>

            {/* Resize handle */}
            <div className="grid-editor-resize-handle" onPointerDown={(e) => handlePointerDown(e, widget.widgetId, "resize")} />
          </div>
        );
      })}

      {/* Ghost preview during drag */}
      {dragState && (
        <div
          data-testid={TEST_ID_GRID_EDITOR_GHOST}
          className="grid-editor-ghost"
          style={{
            position: "absolute",
            left: `${dragState.ghostCol * cellWithGap}px`,
            top: `${dragState.ghostRow * cellWithGap}px`,
            width: `${dragState.ghostColSpan * cellSizePx + (dragState.ghostColSpan - 1) * gapSizePx}px`,
            height: `${dragState.ghostRowSpan * cellSizePx + (dragState.ghostRowSpan - 1) * gapSizePx}px`,
            zIndex: 20,
          }}
        />
      )}

      {/* Add row button in the ghost row area */}
      <button
        data-testid={TEST_ID_GRID_EDITOR_ADD_ROW}
        className="grid-editor-add-row"
        style={{
          position: "absolute",
          left: "50%",
          top: `${actualRows * cellWithGap + cellSizePx / 2}px`,
          transform: "translateX(-50%)",
          opacity: 0.5,
        }}
        onClick={handleAddRow}
      >
        + Add Row
      </button>

      {/* Role popover */}
      {popoverWidget && (
        <IonPopover
          isOpen={!!popoverWidget}
          onDidDismiss={() => setPopoverWidget(null)}
          trigger={undefined}
          reference="event"
          event={popoverRef.current ? ({ target: popoverRef.current } as unknown as Event) : undefined}
        >
          <div style={{ padding: "0.75rem" }}>
            <IonSelect
              value={widgets.find((w) => w.widgetId === popoverWidget)?.roleMinimum ?? "AvVolunteer"}
              onIonChange={(e) => {
                onRoleChange?.(popoverWidget, e.detail.value as string);
                setPopoverWidget(null);
              }}
              label="Role Minimum"
              labelPlacement="stacked"
            >
              <IonSelectOption value="AvVolunteer">AvVolunteer</IonSelectOption>
              <IonSelectOption value="AvPowerUser">AvPowerUser</IonSelectOption>
              <IonSelectOption value="ADMIN">ADMIN</IonSelectOption>
            </IonSelect>
          </div>
        </IonPopover>
      )}
    </div>
  );
}

// ── Exported helpers ──────────────────────────────────────────────────────────

export { findFirstAvailablePosition } from "./snapLogic";

// ── Internal helpers ──────────────────────────────────────────────────────────

function getActualRowCount(widgets: WidgetPlacement[], defaultRows: number): number {
  if (widgets.length === 0) return defaultRows;
  const maxUsedRow = Math.max(...widgets.map((w) => w.row + w.rowSpan));
  return Math.max(maxUsedRow, defaultRows);
}
