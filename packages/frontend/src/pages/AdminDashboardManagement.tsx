import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton, IonSpinner, IonSegment, IonSegmentButton, IonLabel, IonIcon } from "@ionic/react";
import {
  addOutline,
  tabletLandscapeOutline,
  phoneLandscapeOutline,
  tabletPortraitOutline,
  phonePortraitOutline,
  checkmarkDoneCircleOutline,
  warningOutline,
} from "ionicons/icons";
import Select from "react-select";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { GridEditor } from "../components/grid-editor/GridEditor";
import { findFirstAvailablePosition } from "../components/grid-editor/snapLogic";
import type { WidgetPlacement } from "../components/grid-editor/snapLogic";
import { GRID_TYPES, WIDGET_TYPE_REGISTRY, WIDGET_TYPE_IDS } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";
import { darkSelectStyles } from "../theme/selectStyles";
import {
  TEST_ID_ADMIN_DASHBOARDS_PAGE,
  TEST_ID_DASHBOARD_LIST,
  TEST_ID_DASHBOARD_LIST_ITEM,
  TEST_ID_ADD_DASHBOARD_BUTTON,
  TEST_ID_DASHBOARD_FORM_NAME,
  TEST_ID_DASHBOARD_FORM_SLUG,
  TEST_ID_DASHBOARD_FORM_DESCRIPTION,
  TEST_ID_DASHBOARD_FORM_ROLES,
  TEST_ID_DASHBOARD_FORM_SAVE,
  TEST_ID_DASHBOARD_FORM_DELETE,
  TEST_ID_DASHBOARD_FORM_ERROR,
  TEST_ID_DASHBOARD_GRID_TAB,
  TEST_ID_DASHBOARD_DETAIL_PANEL,
  TEST_ID_DASHBOARD_DETAIL_EMPTY,
  TEST_ID_DASHBOARD_SLUG_ERROR,
  TEST_ID_GRID_EDITOR_ADD_WIDGET,
} from "../constants/testIds";

// ── Types ─────────────────────────────────────────────────────────────────────

interface DashboardSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  allowedRoles: string[];
  isComplete: boolean;
}

interface DashboardDetail extends DashboardSummary {
  grids: Record<string, WidgetPlacement[]>;
}

type GridLayouts = Record<GridType, WidgetPlacement[]>;

interface RoleOption {
  value: string;
  label: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { value: "AvVolunteer", label: "AV Volunteer" },
  { value: "AvPowerUser", label: "AV Power User" },
  { value: "ADMIN", label: "Admin" },
];

const GRID_TABS: Array<{ gridType: GridType; icon: string; label: string; ariaLabel: string }> = [
  { gridType: "large-landscape", icon: tabletLandscapeOutline, label: "Large", ariaLabel: "Large Landscape" },
  { gridType: "small-landscape", icon: phoneLandscapeOutline, label: "Small", ariaLabel: "Small Landscape" },
  { gridType: "large-portrait", icon: tabletPortraitOutline, label: "Large", ariaLabel: "Large Portrait" },
  { gridType: "small-portrait", icon: phonePortraitOutline, label: "Small", ariaLabel: "Small Portrait" },
];

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const EMPTY_GRIDS: GridLayouts = {
  "large-landscape": [],
  "large-portrait": [],
  "small-landscape": [],
  "small-portrait": [],
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AdminDashboardManagement(): ReactNode {
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<RoleOption[]>([]);
  const [grids, setGrids] = useState<GridLayouts>({ ...EMPTY_GRIDS });
  const [activeTab, setActiveTab] = useState<GridType>("large-landscape");
  const [formError, setFormError] = useState("");
  const [slugError, setSlugError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  // Dirty check
  const initialStateRef = useRef<string>(JSON.stringify({ name: "", slug: "", description: "", selectedRoles: [] as RoleOption[], grids: EMPTY_GRIDS }));
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<DashboardSummary | null>(null);

  const isDirty = (): boolean => {
    const current = JSON.stringify({ name, slug, description, selectedRoles, grids });
    return current !== initialStateRef.current;
  };

  const captureInitialState = (): void => {
    initialStateRef.current = JSON.stringify({ name, slug, description, selectedRoles, grids });
  };

  // ── Load dashboard list ───────────────────────────────────────────────────

  const loadDashboards = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/dashboards", { credentials: "include" });
      if (response.ok) {
        setDashboards((await response.json()) as DashboardSummary[]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboards();
  }, [loadDashboards]);

  // ── Load dashboard detail ─────────────────────────────────────────────────

  const loadDetail = useCallback(async (id: string): Promise<void> => {
    const response = await fetch(`/api/admin/dashboards/${id}`, { credentials: "include" });
    if (!response.ok) return;
    const detail = (await response.json()) as DashboardDetail;
    setName(detail.name);
    setSlug(detail.slug);
    setDescription(detail.description);
    setSelectedRoles(ROLE_OPTIONS.filter((o) => detail.allowedRoles.includes(o.value)));
    const loadedGrids: GridLayouts = { ...EMPTY_GRIDS };
    for (const gridType of GRID_TYPES) {
      loadedGrids[gridType] = (detail.grids[gridType] as WidgetPlacement[]) ?? [];
    }
    setGrids(loadedGrids);
    setTimeout(captureInitialState, 0);
  }, []);

  // ── Navigation with dirty check ──────────────────────────────────────────

  const navigateTo = (action: () => void): void => {
    if (isDirty()) {
      setPendingNavigation(() => action);
    } else {
      action();
    }
  };

  const selectDashboard = (id: string): void => {
    navigateTo(() => {
      setSelectedId(id);
      setIsCreating(false);
      setFormError("");
      setSlugError("");
      void loadDetail(id);
    });
  };

  const startCreate = (): void => {
    navigateTo(() => {
      setSelectedId(null);
      setIsCreating(true);
      setName("");
      setSlug("");
      setDescription("");
      setSelectedRoles([]);
      setGrids({ ...EMPTY_GRIDS });
      setFormError("");
      setSlugError("");
      setTimeout(captureInitialState, 0);
    });
  };

  // ── Slug validation ───────────────────────────────────────────────────────

  const validateSlugField = (value: string): void => {
    if (!value) {
      setSlugError("");
      return;
    }
    if (value.length > 64) {
      setSlugError("Slug must be at most 64 characters");
    } else if (!SLUG_REGEX.test(value)) {
      setSlugError("Lowercase letters, digits, and hyphens only (no leading/trailing/consecutive hyphens)");
    } else {
      setSlugError("");
    }
  };

  // ── Widget management (synchronized across all grids) ─────────────────────

  const addWidget = (widgetId: string): void => {
    setGrids((previous) => {
      const updated = { ...previous };
      const definition = WIDGET_TYPE_REGISTRY[widgetId];
      if (!definition) return previous;
      for (const gridType of GRID_TYPES) {
        const position = findFirstAvailablePosition(widgetId, updated[gridType], gridType);
        updated[gridType] = [
          ...updated[gridType],
          {
            widgetId,
            title: definition.displayName,
            col: position.col,
            row: position.row,
            colSpan: definition.minColSpan,
            rowSpan: definition.minRowSpan,
            roleMinimum: "AvVolunteer",
          },
        ];
      }
      return updated;
    });
  };

  const removeWidget = (widgetId: string): void => {
    setGrids((previous) => {
      const updated = { ...previous };
      for (const gridType of GRID_TYPES) {
        updated[gridType] = updated[gridType].filter((w) => w.widgetId !== widgetId);
      }
      return updated;
    });
  };

  const changeWidgetRole = (widgetId: string, role: string): void => {
    setGrids((previous) => {
      const updated = { ...previous };
      for (const gridType of GRID_TYPES) {
        updated[gridType] = updated[gridType].map((w) => (w.widgetId === widgetId ? { ...w, roleMinimum: role } : w));
      }
      return updated;
    });
  };

  // ── Remove widget confirmation ────────────────────────────────────────────

  const [removeConfirmWidget, setRemoveConfirmWidget] = useState<string | null>(null);

  // ── Save ──────────────────────────────────────────────────────────────────

  const saveDashboard = async (): Promise<void> => {
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name,
        slug,
        description,
        allowedRoles: selectedRoles.map((r) => r.value),
        grids,
      };

      const url = isCreating ? "/api/admin/dashboards" : `/api/admin/dashboards/${selectedId}`;
      const method = isCreating ? "POST" : "PUT";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as { error?: string; errors?: string[] };
        setFormError(errorBody.error ?? errorBody.errors?.join("; ") ?? "Failed to save");
        return;
      }

      const result = (await response.json()) as DashboardDetail;

      if (result.isComplete) {
        setToastMessage("Dashboard saved successfully.");
      } else {
        setToastMessage("Dashboard saved, but it is incomplete and not visible to users.");
      }

      // Update state
      if (isCreating) {
        setSelectedId(result.id);
        setIsCreating(false);
      }
      captureInitialState();
      void loadDashboards();

      // Clear toast after 4 seconds
      setTimeout(() => setToastMessage(""), 4000);
    } finally {
      setSaving(false);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteDashboard = async (dashboard: DashboardSummary): Promise<void> => {
    await fetch(`/api/admin/dashboards/${dashboard.id}`, { method: "DELETE", credentials: "include" });
    setDeleteConfirm(null);
    if (selectedId === dashboard.id) {
      setSelectedId(null);
      setIsCreating(false);
    }
    void loadDashboards();
  };

  // ── Available widgets for "Add Widget" ────────────────────────────────────

  const placedWidgetIds = new Set(grids[activeTab].map((w) => w.widgetId));
  const availableWidgets = WIDGET_TYPE_IDS.filter((id) => !placedWidgetIds.has(id));

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <IonPage data-testid={TEST_ID_ADMIN_DASHBOARDS_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  const hasPanel = selectedId !== null || isCreating;

  return (
    <IonPage data-testid={TEST_ID_ADMIN_DASHBOARDS_PAGE}>
      <IonContent>
        <div className="admin-split-layout">
          {/* Left panel: dashboard list */}
          <div className="admin-list-panel">
            <h2 className="admin-page-title">Dashboards</h2>
            <IonButton data-testid={TEST_ID_ADD_DASHBOARD_BUTTON} expand="block" fill="outline" onClick={startCreate} className="margin-bottom-standard">
              <IonIcon icon={addOutline} slot="start" />
              Add Dashboard
            </IonButton>
            <div data-testid={TEST_ID_DASHBOARD_LIST} className="admin-list">
              {dashboards.map((d) => (
                <div
                  key={d.id}
                  data-testid={`${TEST_ID_DASHBOARD_LIST_ITEM}-${d.id}`}
                  className={`admin-list-item ${selectedId === d.id ? "active" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectDashboard(d.id)}
                  onKeyDown={(e) => e.key === "Enter" && selectDashboard(d.id)}
                >
                  <div className="admin-list-item-content">
                    <strong>{d.name}</strong>
                    <span className="text-muted text-small">/{d.slug}</span>
                  </div>
                  {!d.isComplete && <IonIcon icon={warningOutline} className="text-warning" />}
                </div>
              ))}
            </div>
          </div>

          {/* Right panel: detail/edit form */}
          <div className="admin-detail-panel">
            {!hasPanel ? (
              <div data-testid={TEST_ID_DASHBOARD_DETAIL_EMPTY} className="admin-detail-empty">
                <p className="text-muted">Select a dashboard or create a new one</p>
              </div>
            ) : (
              <div data-testid={TEST_ID_DASHBOARD_DETAIL_PANEL} className="admin-detail-form">
                {/* Toast */}
                {toastMessage && (
                  <div className="toast-message" role="status">
                    {toastMessage}
                  </div>
                )}

                {/* Form error */}
                {formError && (
                  <div data-testid={TEST_ID_DASHBOARD_FORM_ERROR} className="form-error">
                    {formError}
                  </div>
                )}

                {/* Name */}
                <label className="form-field">
                  <span className="form-label">Name</span>
                  <input data-testid={TEST_ID_DASHBOARD_FORM_NAME} type="text" value={name} onChange={(e) => setName(e.target.value)} className="form-input" />
                </label>

                {/* Slug */}
                <label className="form-field">
                  <span className="form-label">Slug</span>
                  <input
                    data-testid={TEST_ID_DASHBOARD_FORM_SLUG}
                    type="text"
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      validateSlugField(e.target.value);
                    }}
                    className="form-input"
                  />
                  {slugError && (
                    <span data-testid={TEST_ID_DASHBOARD_SLUG_ERROR} className="form-field-error">
                      {slugError}
                    </span>
                  )}
                </label>

                {/* Description */}
                <label className="form-field">
                  <span className="form-label">Description</span>
                  <input
                    data-testid={TEST_ID_DASHBOARD_FORM_DESCRIPTION}
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="form-input"
                  />
                </label>

                {/* Allowed Roles */}
                <div className="form-field">
                  <span className="form-label">Allowed Roles</span>
                  <div data-testid={TEST_ID_DASHBOARD_FORM_ROLES}>
                    <Select
                      isMulti
                      options={ROLE_OPTIONS}
                      value={selectedRoles}
                      onChange={(selected) => setSelectedRoles([...selected])}
                      styles={darkSelectStyles<RoleOption, true>()}
                      placeholder="Select roles..."
                    />
                  </div>
                </div>

                {/* Grid tabs */}
                <div className="form-field">
                  <span className="form-label">Grid Layouts</span>
                  <IonSegment value={activeTab} onIonChange={(e) => setActiveTab(e.detail.value as GridType)}>
                    {GRID_TABS.map((tab) => (
                      <IonSegmentButton
                        key={tab.gridType}
                        value={tab.gridType}
                        data-testid={`${TEST_ID_DASHBOARD_GRID_TAB}-${tab.gridType}`}
                        aria-label={tab.ariaLabel}
                      >
                        <IonIcon icon={tab.icon} />
                        <IonLabel>{tab.label}</IonLabel>
                        <IonIcon
                          icon={grids[tab.gridType].length > 0 ? checkmarkDoneCircleOutline : warningOutline}
                          className={grids[tab.gridType].length > 0 ? "tab-icon-complete" : "tab-icon-warning"}
                        />
                      </IonSegmentButton>
                    ))}
                  </IonSegment>
                </div>

                {/* Add widget */}
                {availableWidgets.length > 0 && (
                  <div className="form-field">
                    <select
                      data-testid={TEST_ID_GRID_EDITOR_ADD_WIDGET}
                      onChange={(e) => {
                        if (e.target.value) {
                          addWidget(e.target.value);
                          e.target.value = "";
                        }
                      }}
                      className="form-input"
                      defaultValue=""
                    >
                      <option value="" disabled>
                        + Add Widget...
                      </option>
                      {availableWidgets.map((id) => (
                        <option key={id} value={id}>
                          {WIDGET_TYPE_REGISTRY[id]?.displayName ?? id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Grid editor */}
                <GridEditor
                  gridType={activeTab}
                  widgets={grids[activeTab]}
                  onWidgetsChange={(updated) => setGrids((prev) => ({ ...prev, [activeTab]: updated }))}
                  onDeleteWidget={(widgetId) => setRemoveConfirmWidget(widgetId)}
                  onRoleChange={changeWidgetRole}
                />

                {/* Action buttons */}
                <div className="form-actions">
                  <IonButton data-testid={TEST_ID_DASHBOARD_FORM_SAVE} expand="block" onClick={() => void saveDashboard()} disabled={saving || !!slugError}>
                    {saving ? <IonSpinner name="crescent" /> : "Save"}
                  </IonButton>
                  {!isCreating && (
                    <IonButton
                      data-testid={TEST_ID_DASHBOARD_FORM_DELETE}
                      expand="block"
                      fill="outline"
                      color="danger"
                      onClick={() => {
                        const d = dashboards.find((dash) => dash.id === selectedId);
                        if (d) setDeleteConfirm(d);
                      }}
                    >
                      Delete
                    </IonButton>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Unsaved changes confirmation */}
        {pendingNavigation && (
          <ConfirmationModal
            isOpen={true}
            title="Unsaved Changes"
            body="You have unsaved changes. Discard them?"
            confirmLabel="Discard"
            cancelLabel="Cancel"
            onConfirm={() => {
              const action = pendingNavigation;
              setPendingNavigation(null);
              action();
            }}
            onCancel={() => setPendingNavigation(null)}
          />
        )}

        {/* Delete dashboard confirmation */}
        {deleteConfirm && (
          <ConfirmationModal
            isOpen={true}
            title="Delete Dashboard"
            body={`Are you sure you want to delete "${deleteConfirm.name}"? This cannot be undone.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            confirmVariant="danger"
            onConfirm={() => void deleteDashboard(deleteConfirm)}
            onCancel={() => setDeleteConfirm(null)}
          />
        )}

        {/* Remove widget confirmation */}
        {removeConfirmWidget && (
          <ConfirmationModal
            isOpen={true}
            title="Remove Widget"
            body={`Remove ${WIDGET_TYPE_REGISTRY[removeConfirmWidget]?.displayName ?? removeConfirmWidget} from all four grid layouts?`}
            confirmLabel="Remove"
            cancelLabel="Cancel"
            confirmVariant="danger"
            onConfirm={() => {
              removeWidget(removeConfirmWidget);
              setRemoveConfirmWidget(null);
            }}
            onCancel={() => setRemoveConfirmWidget(null)}
          />
        )}
      </IonContent>
    </IonPage>
  );
}
