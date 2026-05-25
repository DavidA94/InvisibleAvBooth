import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton, IonSpinner, IonInput, IonTextarea } from "@ionic/react";
import { addOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import Select from "react-select";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { darkSelectStyles } from "../theme/selectStyles";
import {
  TEST_ID_ADMIN_TEMPLATES_PAGE,
  TEST_ID_TEMPLATE_ITEM,
  TEST_ID_TEMPLATE_FORM_NAME,
  TEST_ID_TEMPLATE_FORM_FORMAT,
  TEST_ID_TEMPLATE_FORM_ROLE,
  TEST_ID_TEMPLATE_FORM_VALIDATE,
  TEST_ID_TEMPLATE_FORM_SAVE,
  TEST_ID_TEMPLATE_FORM_ERROR,
  TEST_ID_TEMPLATE_VALIDATION_BLOCKERS,
  TEST_ID_TEMPLATE_VALIDATION_WARNINGS,
} from "../constants/testIds";
import type { Role } from "../types";

interface Template {
  id: string;
  name: string;
  category: "title" | "description" | "lower_third";
  formatString: string;
  roleMinimum: Role;
  lowerThirdType?: "Title" | "TitleSubtitle" | "Scripture" | null;
  autoDismissMs?: number | null;
}

interface ValidationResult {
  blockers: string[];
  warnings: string[];
}

interface PanelState {
  mode: "empty" | "create" | "edit";
  category?: "title" | "description" | "lower_third";
  templateId?: string;
}

type RoleOption = { value: Role; label: string };
const ROLE_OPTIONS: RoleOption[] = [
  { value: "AvVolunteer", label: "Volunteer" },
  { value: "AvPowerUser", label: "Power User" },
  { value: "ADMIN", label: "Admin" },
];
const ROLE_LABELS: Record<Role, string> = { ADMIN: "Admin", AvPowerUser: "Power User", AvVolunteer: "Volunteer" };
const roleStyles = darkSelectStyles<RoleOption>();

const isNone = (t: Template): boolean => t.name === "None" && t.category === "description";

function sortTemplates(templates: Template[]): Template[] {
  const titles = templates.filter((t) => t.category === "title").sort((a, b) => a.name.localeCompare(b.name));
  const descriptions = templates.filter((t) => t.category === "description");
  const noneTemplate = descriptions.filter(isNone);
  const otherDescriptions = descriptions.filter((t) => !isNone(t)).sort((a, b) => a.name.localeCompare(b.name));
  const lowerThirds = templates.filter((t) => t.category === "lower_third").sort((a, b) => a.name.localeCompare(b.name));
  return [...titles, ...noneTemplate, ...otherDescriptions, ...lowerThirds];
}

export function AdminTemplatesPage(): ReactNode {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<PanelState>({ mode: "empty" });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [name, setName] = useState("");
  const [formatString, setFormatString] = useState("");
  const [roleMinimum, setRoleMinimum] = useState<Role>("AvVolunteer");
  const [formError, setFormError] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);

  // Dirty check
  const initialRef = useRef({ name: "", formatString: "", roleMinimum: "AvVolunteer" as Role });
  const isDirty = name !== initialRef.current.name || formatString !== initialRef.current.formatString || roleMinimum !== initialRef.current.roleMinimum;
  const [pendingNavigation, setPendingNavigation] = useState<PanelState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    const handler = (e: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/templates", { credentials: "include" });
      if (res.ok) setTemplates((await res.json()) as Template[]);
    } catch {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const navigatePanel = (next: PanelState): void => {
    if (isDirty) {
      setPendingNavigation(next);
    } else {
      applyNavigation(next);
    }
  };

  const applyNavigation = (next: PanelState): void => {
    setPanel(next);
    if (next.mode === "create") {
      setName("");
      setFormatString("");
      setRoleMinimum("AvVolunteer");
      initialRef.current = { name: "", formatString: "", roleMinimum: "AvVolunteer" };
    } else if (next.mode === "edit" && next.templateId) {
      const t = templates.find((tpl) => tpl.id === next.templateId);
      if (t) {
        setName(t.name);
        setFormatString(t.formatString);
        setRoleMinimum(t.roleMinimum);
        initialRef.current = { name: t.name, formatString: t.formatString, roleMinimum: t.roleMinimum };
      }
    }
    setFormError("");
    setValidation(null);
    setValidated(false);
  };

  const handleValidate = async (): Promise<void> => {
    const category = panel.category ?? "title";
    try {
      const body: Record<string, unknown> = { name, formatString, category, roleMinimum };
      if (panel.mode === "edit" && panel.templateId) body.excludeId = panel.templateId;
      const res = await fetch("/api/admin/templates/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const result = (await res.json()) as ValidationResult;
      setValidation(result);
      setValidated(result.blockers.length === 0);
    } catch {
      setFormError("Validation failed");
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setFormError("");
    const category = panel.category ?? "title";
    try {
      const body = { name, formatString, category, roleMinimum };
      const isEdit = panel.mode === "edit" && panel.templateId;
      const res = await fetch(isEdit ? `/api/admin/templates/${panel.templateId}` : "/api/admin/templates", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        initialRef.current = { name, formatString, roleMinimum };
        setPanel({ mode: "empty" });
        void fetchTemplates();
      } else {
        const d = (await res.json()) as { error?: string };
        setFormError(d.error ?? "Save failed");
      }
    } catch {
      setFormError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/templates/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        setError(d.error ?? "Delete failed");
      }
      if (panel.mode === "edit" && panel.templateId === deleteTarget.id) {
        setPanel({ mode: "empty" });
      }
      void fetchTemplates();
    } catch {
      setError("Network error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleAddType = (category: "title" | "description" | "lower_third"): void => {
    setPopoverOpen(false);
    navigatePanel({ mode: "create", category });
  };

  const sorted = sortTemplates(templates);
  const selectedTemplate = panel.mode === "edit" ? templates.find((t) => t.id === panel.templateId) : undefined;
  const isDescription = (panel.mode === "create" ? panel.category : selectedTemplate?.category) === "description";
  const isLowerThird = (panel.mode === "create" ? panel.category : selectedTemplate?.category) === "lower_third";

  if (loading) {
    return (
      <IonPage data-testid={TEST_ID_ADMIN_TEMPLATES_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid={TEST_ID_ADMIN_TEMPLATES_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="admin-page-title">Template Management</h2>
        {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

        <div className="device-management-layout">
          {/* Left panel — template list */}
          <div className="device-management-list-panel">
            <div className="position-relative" ref={dropdownRef}>
              <IonButton expand="block" className="add-connection-button" onClick={() => setPopoverOpen((prev) => !prev)}>
                <IonIcon icon={addOutline} slot="start" />
                Add Template
              </IonButton>

              {popoverOpen && (
                <div className="add-device-dropdown surface-raised">
                  <button className="button-unstyled add-device-dropdown-option" type="button" onClick={() => handleAddType("title")}>
                    Title Template
                  </button>
                  <button className="button-unstyled add-device-dropdown-option" type="button" onClick={() => handleAddType("description")}>
                    Description Template
                  </button>
                  <button className="button-unstyled add-device-dropdown-option" type="button" onClick={() => handleAddType("lower_third")}>
                    Lower Third Template
                  </button>
                </div>
              )}
            </div>

            <div className="device-list-scroll">
              {sorted.map((t, i) => {
                // Group header
                const prevCategory = i > 0 ? sorted[i - 1]!.category : null;
                const showHeader = t.category !== prevCategory;

                return (
                  <div key={t.id}>
                    {showHeader && <div className="text-muted text-caption tpl-group-header">{t.category === "title" ? "Title" : t.category === "description" ? "Description" : "Lower Third"}</div>}
                    <div
                      data-testid={`${TEST_ID_TEMPLATE_ITEM}-${t.id}`}
                      className={`device-list-item surface ${panel.mode === "edit" && panel.templateId === t.id ? "device-list-item-selected" : ""}`}
                      onClick={() => !isNone(t) && navigatePanel({ mode: "edit", category: t.category, templateId: t.id })}
                      onKeyDown={(e) => e.key === "Enter" && !isNone(t) && navigatePanel({ mode: "edit", category: t.category, templateId: t.id })}
                      role={isNone(t) ? undefined : "button"}
                      tabIndex={isNone(t) ? undefined : 0}
                    >
                      <div className="fill-remaining">
                        <div className="text-bold">{t.name}</div>
                        <div className="text-muted text-caption">
                          {t.category === "title" ? "Title" : t.category === "description" ? "Description" : "Lower Third"}
                          {t.lowerThirdType && ` · ${t.lowerThirdType}`}
                          {!isNone(t) && ` · ${ROLE_LABELS[t.roleMinimum]}`}
                        </div>
                      </div>
                      {!isNone(t) && (
                        <IonButton
                          size="small"
                          fill="clear"
                          color="danger"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteTarget(t);
                          }}
                        >
                          Delete
                        </IonButton>
                      )}
                    </div>
                  </div>
                );
              })}
              {templates.length === 0 && <p className="text-muted text-center">No templates</p>}
            </div>
          </div>

          {/* Right panel — edit form */}
          <div className="device-management-detail-panel surface">
            {panel.mode === "empty" && (
              <div className="layout-centered full-height">
                <p className="text-muted">Select a template or add a new one</p>
              </div>
            )}

            {(panel.mode === "create" || panel.mode === "edit") && (
              <div>
                <h3 className="detail-header">
                  {panel.mode === "edit" ? `Edit ${selectedTemplate?.name ?? "Template"}` : `New ${isDescription ? "Description" : "Title"} Template`}
                </h3>

                <div className="tpl-form-grid">
                  <label className="tpl-form-label">Name:</label>
                  <IonInput
                    data-testid={TEST_ID_TEMPLATE_FORM_NAME}
                    fill="outline"
                    value={name}
                    onIonInput={(e) => {
                      setName(e.detail.value ?? "");
                      setValidated(false);
                    }}
                  />

                  <label className={`tpl-form-label ${isDescription ? "tpl-form-label-top" : ""}`}>Format String:</label>
                  {isDescription ? (
                    <IonTextarea
                      data-testid={TEST_ID_TEMPLATE_FORM_FORMAT}
                      fill="outline"
                      rows={4}
                      value={formatString}
                      onIonInput={(e) => {
                        setFormatString(e.detail.value ?? "");
                        setValidated(false);
                      }}
                    />
                  ) : (
                    <IonInput
                      data-testid={TEST_ID_TEMPLATE_FORM_FORMAT}
                      fill="outline"
                      value={formatString}
                      onIonInput={(e) => {
                        setFormatString(e.detail.value ?? "");
                        setValidated(false);
                      }}
                    />
                  )}
                  <span />
                  <div className="text-muted text-caption">
                    Available tokens: {"{Date}"} {"{Speaker}"} {"{Title}"} {"{Scripture}"} {"{verseText}"}
                  </div>

                  <label className="tpl-form-label">Minimum Role:</label>
                  <div data-testid={TEST_ID_TEMPLATE_FORM_ROLE}>
                    <Select<RoleOption>
                      options={ROLE_OPTIONS}
                      value={ROLE_OPTIONS.find((o) => o.value === roleMinimum) ?? null}
                      onChange={(opt) => {
                        setRoleMinimum(opt?.value ?? "AvVolunteer");
                        setValidated(false);
                      }}
                      styles={roleStyles}
                      isSearchable={false}
                      menuPortalTarget={document.body}
                    />
                  </div>
                </div>

                {validation && validation.blockers.length > 0 && (
                  <div data-testid={TEST_ID_TEMPLATE_VALIDATION_BLOCKERS} className="text-danger text-secondary margin-top-standard">
                    {validation.blockers.map((b, i) => (
                      <p key={i} className="margin-none">
                        {b}
                      </p>
                    ))}
                  </div>
                )}
                {validation && validation.warnings.length > 0 && (
                  <div data-testid={TEST_ID_TEMPLATE_VALIDATION_WARNINGS} className="text-warning text-secondary margin-top-standard">
                    {validation.warnings.map((w, i) => (
                      <p key={i} className="margin-none">
                        {w}
                      </p>
                    ))}
                  </div>
                )}
                {formError && (
                  <p data-testid={TEST_ID_TEMPLATE_FORM_ERROR} className="text-danger text-secondary margin-none margin-top-standard">
                    {formError}
                  </p>
                )}

                <div className="detail-footer">
                  {!validated ? (
                    <IonButton data-testid={TEST_ID_TEMPLATE_FORM_VALIDATE} onClick={() => void handleValidate()}>
                      Validate
                    </IonButton>
                  ) : (
                    <IonButton data-testid={TEST_ID_TEMPLATE_FORM_SAVE} disabled={saving} onClick={() => void handleSave()}>
                      {saving ? "Saving…" : "Save"}
                    </IonButton>
                  )}
                  {panel.mode === "edit" && (
                    <IonButton fill="outline" color="danger" onClick={() => selectedTemplate && setDeleteTarget(selectedTemplate)}>
                      Delete
                    </IonButton>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Unsaved changes confirmation */}
        <ConfirmationModal
          isOpen={pendingNavigation !== null}
          title="Unsaved Changes"
          body="You have unsaved changes. Are you sure you want to leave?"
          confirmLabel="Discard"
          cancelLabel="Stay"
          confirmVariant="danger"
          onConfirm={() => {
            if (pendingNavigation) applyNavigation(pendingNavigation);
            setPendingNavigation(null);
          }}
          onCancel={() => setPendingNavigation(null)}
        />

        {/* Delete confirmation */}
        <ConfirmationModal
          isOpen={deleteTarget !== null}
          title="Delete Template"
          body={`Are you sure you want to delete "${deleteTarget?.name ?? ""}"?`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          confirmVariant="danger"
          onConfirm={() => void handleDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      </IonContent>
    </IonPage>
  );
}
