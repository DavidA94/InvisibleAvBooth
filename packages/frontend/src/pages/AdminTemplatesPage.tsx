import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonSpinner, IonInput, IonTextarea } from "@ionic/react";
import Select from "react-select";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { Modal } from "../components/Modal";
import { darkSelectStyles } from "../theme/selectStyles";
import {
  TEST_ID_ADMIN_TEMPLATES_PAGE,
  TEST_ID_TITLE_TEMPLATE_LIST,
  TEST_ID_DESCRIPTION_TEMPLATE_LIST,
  TEST_ID_TEMPLATE_ITEM,
  TEST_ID_TEMPLATE_EDIT_BUTTON,
  TEST_ID_TEMPLATE_DELETE_BUTTON,
  TEST_ID_ADD_TITLE_TEMPLATE_BUTTON,
  TEST_ID_ADD_DESCRIPTION_TEMPLATE_BUTTON,
  TEST_ID_TEMPLATE_FORM_NAME,
  TEST_ID_TEMPLATE_FORM_FORMAT,
  TEST_ID_TEMPLATE_FORM_ROLE,
  TEST_ID_TEMPLATE_FORM_VALIDATE,
  TEST_ID_TEMPLATE_FORM_SAVE,
  TEST_ID_TEMPLATE_FORM_CANCEL,
  TEST_ID_TEMPLATE_FORM_ERROR,
  TEST_ID_TEMPLATE_VALIDATION_BLOCKERS,
  TEST_ID_TEMPLATE_VALIDATION_WARNINGS,
} from "../constants/testIds";
import type { Role } from "../types";

interface Template {
  id: string;
  name: string;
  category: "title" | "description";
  formatString: string;
  roleMinimum: Role;
}

interface ValidationResult { blockers: string[]; warnings: string[] }
interface FormState { mode: "create" | "edit"; category: "title" | "description"; template: Template | undefined }

type RoleOption = { value: Role; label: string };
const ROLE_OPTIONS: RoleOption[] = [
  { value: "AvVolunteer", label: "Volunteer" },
  { value: "AvPowerUser", label: "Power User" },
  { value: "ADMIN", label: "Admin" },
];
const ROLE_LABELS: Record<Role, string> = { ADMIN: "Admin", AvPowerUser: "Power User", AvVolunteer: "Volunteer" };

export function AdminTemplatesPage(): ReactNode {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formState, setFormState] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  const [name, setName] = useState("");
  const [formatString, setFormatString] = useState("");
  const [roleMinimum, setRoleMinimum] = useState<Role>("AvVolunteer");
  const [formError, setFormError] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/templates", { credentials: "include" });
      if (res.ok) setTemplates((await res.json()) as Template[]);
    } catch { setError("Failed to load templates"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchTemplates(); }, [fetchTemplates]);

  const openForm = (mode: "create" | "edit", category: "title" | "description", template?: Template): void => {
    setFormState({ mode, category, template });
    setName(template?.name ?? "");
    setFormatString(template?.formatString ?? "");
    setRoleMinimum(template?.roleMinimum ?? "AvVolunteer");
    setFormError(""); setValidation(null); setValidated(false);
  };
  const closeForm = (): void => setFormState(null);

  const handleValidate = async (): Promise<void> => {
    try {
      const body: Record<string, unknown> = { name, formatString, category: formState!.category, roleMinimum };
      if (formState?.mode === "edit" && formState.template) body.excludeId = formState.template.id;
      const res = await fetch("/api/admin/templates/validate", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      const result = (await res.json()) as ValidationResult;
      setValidation(result);
      setValidated(result.blockers.length === 0);
    } catch { setFormError("Validation failed"); }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true); setFormError("");
    try {
      const body = { name, formatString, category: formState!.category, roleMinimum };
      const isEdit = formState?.mode === "edit" && formState.template;
      const res = await fetch(isEdit ? `/api/admin/templates/${formState!.template!.id}` : "/api/admin/templates", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (res.ok) { closeForm(); void fetchTemplates(); }
      else { const d = (await res.json()) as { error?: string }; setFormError(d.error ?? "Save failed"); }
    } catch { setFormError("Network error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/admin/templates/${deleteTarget.id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) { const d = (await res.json()) as { error?: string }; setError(d.error ?? "Delete failed"); }
      void fetchTemplates();
    } catch { setError("Network error"); }
    finally { setDeleteTarget(null); }
  };

  const titleTemplates = templates.filter((t) => t.category === "title");
  const descriptionTemplates = templates.filter((t) => t.category === "description");
  const isNone = (t: Template): boolean => t.name === "None";

  const renderList = (category: "title" | "description", items: Template[], testId: string, addTestId: string): ReactNode => (
    <div className="tpl-column">
      <div className="tpl-column-header">
        <h3 className="margin-none">{category === "title" ? "Title Templates" : "Description Templates"}</h3>
        <button data-testid={addTestId} className="button-primary button-padding-compact" onClick={() => openForm("create", category)}>Add</button>
      </div>
      <div data-testid={testId} className="tpl-column-list">
        {items.map((t) => (
          <div key={t.id} data-testid={`${TEST_ID_TEMPLATE_ITEM}-${t.id}`} className="tpl-item">
            <div className="fill-remaining">
              <div className="text-bold">{t.name}</div>
              {!isNone(t) && <div className="text-muted text-caption">{ROLE_LABELS[t.roleMinimum]}</div>}
            </div>
            {!isNone(t) && (
              <div className="layout-row gap-tight">
                <button data-testid={`${TEST_ID_TEMPLATE_EDIT_BUTTON}-${t.id}`} className="button-outline button-padding-compact" onClick={() => openForm("edit", category, t)}>Edit</button>
                <button data-testid={`${TEST_ID_TEMPLATE_DELETE_BUTTON}-${t.id}`} className="button-ghost-danger button-padding-compact" onClick={() => setDeleteTarget(t)}>Delete</button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-muted text-center">No templates</p>}
      </div>
    </div>
  );

  if (loading) return <IonPage data-testid={TEST_ID_ADMIN_TEMPLATES_PAGE}><IonContent className="ion-padding ion-text-center"><IonSpinner /></IonContent></IonPage>;

  const isDescription = formState?.category === "description";

  const formFooter = formState ? (
    <div className="confirmation-footer">
      <span className="fill-remaining" />
      <button data-testid={TEST_ID_TEMPLATE_FORM_CANCEL} onClick={closeForm} className="button-outline button-padding-standard">Cancel</button>
      {!validated ? (
        <button data-testid={TEST_ID_TEMPLATE_FORM_VALIDATE} onClick={() => void handleValidate()} className="button-primary button-padding-standard">Validate</button>
      ) : (
        <button data-testid={TEST_ID_TEMPLATE_FORM_SAVE} onClick={() => void handleSave()} disabled={saving} className="button-primary text-bold button-padding-standard">{saving ? "Saving…" : "Save"}</button>
      )}
    </div>
  ) : null;

  return (
    <IonPage data-testid={TEST_ID_ADMIN_TEMPLATES_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="admin-page-title">Template Management</h2>
        {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}
        <div className="tpl-two-column">
          {renderList("title", titleTemplates, TEST_ID_TITLE_TEMPLATE_LIST, TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)}
          {renderList("description", descriptionTemplates, TEST_ID_DESCRIPTION_TEMPLATE_LIST, TEST_ID_ADD_DESCRIPTION_TEMPLATE_BUTTON)}
        </div>

        <Modal isOpen={formState !== null} onClose={closeForm} size="small" header={formState?.mode === "edit" ? "Edit Template" : `New ${isDescription ? "Description" : "Title"} Template`} footer={formFooter}>
          <div className="tpl-form-grid">
            <label className="tpl-form-label">Name:</label>
            <IonInput data-testid={TEST_ID_TEMPLATE_FORM_NAME} fill="outline" value={name} onIonInput={(e) => { setName(e.detail.value ?? ""); setValidated(false); }} />

            <label className="tpl-form-label" style={{ alignSelf: isDescription ? "start" : "center", paddingTop: isDescription ? "0.5rem" : undefined }}>Format String:</label>
            {isDescription ? (
              <IonTextarea data-testid={TEST_ID_TEMPLATE_FORM_FORMAT} fill="outline" rows={4} value={formatString} onIonInput={(e) => { setFormatString(e.detail.value ?? ""); setValidated(false); }} />
            ) : (
              <IonInput data-testid={TEST_ID_TEMPLATE_FORM_FORMAT} fill="outline" value={formatString} onIonInput={(e) => { setFormatString(e.detail.value ?? ""); setValidated(false); }} />
            )}

            <label className="tpl-form-label">Minimum Role:</label>
            <div data-testid={TEST_ID_TEMPLATE_FORM_ROLE}>
              <Select<RoleOption> options={ROLE_OPTIONS} value={ROLE_OPTIONS.find((o) => o.value === roleMinimum)} onChange={(opt) => { setRoleMinimum(opt?.value ?? "AvVolunteer"); setValidated(false); }} styles={darkSelectStyles<RoleOption>()} />
            </div>
          </div>

          {validation && validation.blockers.length > 0 && (
            <div data-testid={TEST_ID_TEMPLATE_VALIDATION_BLOCKERS} className="text-danger text-secondary margin-top-standard">
              {validation.blockers.map((b, i) => <p key={i} className="margin-none">{b}</p>)}
            </div>
          )}
          {validation && validation.warnings.length > 0 && (
            <div data-testid={TEST_ID_TEMPLATE_VALIDATION_WARNINGS} className="text-warning text-secondary margin-top-standard">
              {validation.warnings.map((w, i) => <p key={i} className="margin-none">{w}</p>)}
            </div>
          )}
          {formError && <p data-testid={TEST_ID_TEMPLATE_FORM_ERROR} className="text-danger text-secondary margin-none margin-top-standard">{formError}</p>}
        </Modal>

        <ConfirmationModal isOpen={deleteTarget !== null} title="Delete Template" body={`Are you sure you want to delete "${deleteTarget?.name ?? ""}"?`} confirmLabel="Delete" cancelLabel="Cancel" confirmVariant="danger" onConfirm={() => void handleDelete()} onCancel={() => setDeleteTarget(null)} />
      </IonContent>
    </IonPage>
  );
}
