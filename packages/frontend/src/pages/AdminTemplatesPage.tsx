import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonSpinner } from "@ionic/react";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { Modal } from "../components/Modal";
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

interface ValidationResult {
  blockers: string[];
  warnings: string[];
}

interface FormState {
  mode: "create" | "edit";
  category: "title" | "description";
  template: Template | undefined;
}

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Admin",
  AvPowerUser: "Power User",
  AvVolunteer: "Volunteer",
};

export function AdminTemplatesPage(): ReactNode {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formState, setFormState] = useState<FormState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Template | null>(null);

  // Form fields
  const [name, setName] = useState("");
  const [formatString, setFormatString] = useState("");
  const [roleMinimum, setRoleMinimum] = useState<Role>("AvVolunteer");
  const [formError, setFormError] = useState("");
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validated, setValidated] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchTemplates = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/templates", { credentials: "include" });
      if (response.ok) setTemplates((await response.json()) as Template[]);
    } catch {
      setError("Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchTemplates();
  }, [fetchTemplates]);

  const openForm = (mode: "create" | "edit", category: "title" | "description", template?: Template): void => {
    setFormState({ mode, category, template });
    setName(template?.name ?? "");
    setFormatString(template?.formatString ?? "");
    setRoleMinimum(template?.roleMinimum ?? "AvVolunteer");
    setFormError("");
    setValidation(null);
    setValidated(false);
  };

  const closeForm = (): void => {
    setFormState(null);
  };

  const handleValidate = async (): Promise<void> => {
    try {
      const body: Record<string, unknown> = { name, formatString, category: formState!.category, roleMinimum };
      if (formState?.mode === "edit" && formState.template) body.excludeId = formState.template.id;
      const response = await fetch("/api/admin/templates/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as ValidationResult;
      setValidation(result);
      setValidated(result.blockers.length === 0);
    } catch {
      setFormError("Validation failed");
    }
  };

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setFormError("");
    try {
      const body = { name, formatString, category: formState!.category, roleMinimum };
      const isEdit = formState?.mode === "edit" && formState.template;
      const url = isEdit ? `/api/admin/templates/${formState!.template!.id}` : "/api/admin/templates";
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (response.ok) {
        closeForm();
        void fetchTemplates();
      } else {
        const data = (await response.json()) as { error?: string };
        setFormError(data.error ?? "Save failed");
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
      const response = await fetch(`/api/admin/templates/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
      }
      void fetchTemplates();
    } catch {
      setError("Network error");
    } finally {
      setDeleteTarget(null);
    }
  };

  const titleTemplates = templates.filter((t) => t.category === "title");
  const descriptionTemplates = templates.filter((t) => t.category === "description");

  const isNoneTemplate = (template: Template): boolean => template.name === "None";

  const renderTemplateList = (category: "title" | "description", items: Template[], testId: string, addTestId: string): ReactNode => (
    <div className="template-list">
      <div className="template-list-header">
        <h3>{category === "title" ? "Title Templates" : "Description Templates"}</h3>
        <button data-testid={addTestId} className="button-primary button-padding-compact" onClick={() => openForm("create", category)}>
          Add
        </button>
      </div>
      <div data-testid={testId} className="template-list-scroll">
        {items.map((template) => (
          <div key={template.id} data-testid={`${TEST_ID_TEMPLATE_ITEM}-${template.id}`} className="template-item surface">
            <div className="fill-remaining">
              <div className="text-bold">{template.name}</div>
              {!isNoneTemplate(template) && <span className="role-badge text-caption">{ROLE_LABELS[template.roleMinimum]}</span>}
            </div>
            {!isNoneTemplate(template) && (
              <div className="template-item-actions">
                <button
                  data-testid={`${TEST_ID_TEMPLATE_EDIT_BUTTON}-${template.id}`}
                  className="button-outline button-padding-compact"
                  onClick={() => openForm("edit", category, template)}
                >
                  Edit
                </button>
                <button
                  data-testid={`${TEST_ID_TEMPLATE_DELETE_BUTTON}-${template.id}`}
                  className="button-ghost-danger button-padding-compact"
                  onClick={() => setDeleteTarget(template)}
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        ))}
        {items.length === 0 && <p className="text-muted text-center">No templates</p>}
      </div>
    </div>
  );

  if (loading) {
    return (
      <IonPage data-testid={TEST_ID_ADMIN_TEMPLATES_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  const formFooter = formState ? (
    <div className="manifest-footer">
      <button data-testid={TEST_ID_TEMPLATE_FORM_CANCEL} onClick={closeForm} className="button-outline button-padding-standard">
        Cancel
      </button>
      <span className="fill-remaining" />
      {!validated ? (
        <button data-testid={TEST_ID_TEMPLATE_FORM_VALIDATE} onClick={() => void handleValidate()} className="button-primary button-padding-standard">
          Validate
        </button>
      ) : (
        <button
          data-testid={TEST_ID_TEMPLATE_FORM_SAVE}
          onClick={() => void handleSave()}
          disabled={saving}
          className="button-primary text-bold button-padding-standard"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      )}
    </div>
  ) : null;

  return (
    <IonPage data-testid={TEST_ID_ADMIN_TEMPLATES_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="text-center margin-bottom-spacious">Template Management</h2>
        {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

        <div className="template-lists">
          {renderTemplateList("title", titleTemplates, TEST_ID_TITLE_TEMPLATE_LIST, TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)}
          {renderTemplateList("description", descriptionTemplates, TEST_ID_DESCRIPTION_TEMPLATE_LIST, TEST_ID_ADD_DESCRIPTION_TEMPLATE_BUTTON)}
        </div>

        {/* Create/Edit Modal */}
        <Modal
          isOpen={formState !== null}
          onClose={closeForm}
          size="small"
          header={formState?.mode === "edit" ? `Edit Template` : `New ${formState?.category === "title" ? "Title" : "Description"} Template`}
          footer={formFooter}
        >
          <div className="manifest-form">
            <div className="manifest-field">
              <label className="text-muted text-caption" htmlFor="template-name">
                Name
              </label>
              <input
                id="template-name"
                data-testid={TEST_ID_TEMPLATE_FORM_NAME}
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setValidated(false);
                }}
                className="manifest-input"
              />
            </div>
            <div className="manifest-field">
              <label className="text-muted text-caption" htmlFor="template-format">
                Format String
              </label>
              {formState?.category === "description" ? (
                <textarea
                  id="template-format"
                  data-testid={TEST_ID_TEMPLATE_FORM_FORMAT}
                  value={formatString}
                  onChange={(e) => {
                    setFormatString(e.target.value);
                    setValidated(false);
                  }}
                  className="manifest-textarea"
                  rows={4}
                />
              ) : (
                <input
                  id="template-format"
                  data-testid={TEST_ID_TEMPLATE_FORM_FORMAT}
                  type="text"
                  value={formatString}
                  onChange={(e) => {
                    setFormatString(e.target.value);
                    setValidated(false);
                  }}
                  className="manifest-input"
                />
              )}
            </div>
            <div className="manifest-field">
              <label className="text-muted text-caption" htmlFor="template-role">
                Minimum Role
              </label>
              <select
                id="template-role"
                data-testid={TEST_ID_TEMPLATE_FORM_ROLE}
                value={roleMinimum}
                onChange={(e) => {
                  setRoleMinimum(e.target.value as Role);
                  setValidated(false);
                }}
                className="manifest-select"
              >
                <option value="AvVolunteer">Volunteer</option>
                <option value="AvPowerUser">Power User</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            {validation && validation.blockers.length > 0 && (
              <div data-testid={TEST_ID_TEMPLATE_VALIDATION_BLOCKERS} className="text-danger text-secondary">
                {validation.blockers.map((b, i) => (
                  <p key={i} className="margin-none">
                    {b}
                  </p>
                ))}
              </div>
            )}
            {validation && validation.warnings.length > 0 && (
              <div data-testid={TEST_ID_TEMPLATE_VALIDATION_WARNINGS} className="text-warning text-secondary">
                {validation.warnings.map((w, i) => (
                  <p key={i} className="margin-none">
                    {w}
                  </p>
                ))}
              </div>
            )}
            {formError && (
              <p data-testid={TEST_ID_TEMPLATE_FORM_ERROR} className="text-danger text-secondary margin-none">
                {formError}
              </p>
            )}
          </div>
        </Modal>

        {/* Delete Confirmation */}
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
