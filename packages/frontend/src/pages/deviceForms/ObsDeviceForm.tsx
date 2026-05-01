import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { IonInput, IonButton, IonText, IonSpinner, IonCheckbox } from "@ionic/react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import type { DeviceFormProps, DeviceRecord } from "./deviceTypeRegistry";
import {
  TEST_ID_DEVICE_FORM_LABEL, TEST_ID_DEVICE_FORM_HOST, TEST_ID_DEVICE_FORM_PORT,
  TEST_ID_DEVICE_FORM_PASSWORD,
  TEST_ID_DEVICE_FORM_ENABLED, TEST_ID_DEVICE_FORM_SAVE, TEST_ID_DEVICE_FORM_DELETE,
  TEST_ID_DEVICE_FORM_ERROR,
} from "../../constants/testIds";

const DEFAULT_PORT = "4455";

interface ObsFormState {
  label: string;
  host: string;
  port: string;
  password: string;
  enabled: boolean;
}

function buildInitialState(device: DeviceRecord | null): ObsFormState {
  if (device) {
    return {
      label: device.label,
      host: device.host,
      port: String(device.port),
      password: "",
      enabled: device.enabled,
    };
  }
  return { label: "", host: "", port: DEFAULT_PORT, password: "", enabled: true };
}

/**
 * Compare current form state to the initial snapshot.
 * Password is excluded from dirty-check when editing (blank = "keep existing").
 */
function isFormDirty(current: ObsFormState, initial: ObsFormState, isEdit: boolean): boolean {
  if (current.label !== initial.label) return true;
  if (current.host !== initial.host) return true;
  if (current.port !== initial.port) return true;
  if (current.enabled !== initial.enabled) return true;
  if (!isEdit && current.password !== initial.password) return true;
  if (isEdit && current.password !== "") return true;
  return false;
}

export function ObsDeviceForm({ device, onSaved, onDeleted, registerDirtyCheck }: DeviceFormProps): ReactNode {
  const isEdit = device !== null;
  const initialState = useMemo(() => buildInitialState(device), [device]);

  const [form, setForm] = useState<ObsFormState>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);

  // Keep a ref to current form state so the dirty check closure always reads the latest value.
  const formRef = useRef(form);
  formRef.current = form;
  const initialRef = useRef(initialState);
  initialRef.current = initialState;

  useEffect(() => {
    registerDirtyCheck({ isDirty: () => isFormDirty(formRef.current, initialRef.current, isEdit) });
  }, [registerDirtyCheck, isEdit]);

  // Reset form when device changes (switching between devices in the list).
  useEffect(() => {
    setForm(initialState);
    setError("");
  }, [initialState]);

  const updateField = useCallback(<K extends keyof ObsFormState>(key: K, value: ObsFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = async (): Promise<void> => {
    setError("");
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        label: form.label,
        host: form.host,
        port: Number(form.port),
      };
      if (isEdit) {
        body["enabled"] = form.enabled;
        if (form.password) body["password"] = form.password;
      } else {
        body["deviceType"] = "obs";
        if (form.password) body["password"] = form.password;
      }

      const url = isEdit ? `/api/admin/devices/${device.id}` : "/api/admin/devices";
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Save failed");
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!device) return;
    setDeletePending(true);
    try {
      const response = await fetch(`/api/admin/devices/${device.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
        setDeleteConfirmOpen(false);
        return;
      }
      setDeleteConfirmOpen(false);
      onDeleted();
    } catch {
      setError("Network error");
    } finally {
      setDeletePending(false);
    }
  };

  return (
    <div className="form-layout">
      <h3 className="margin-none margin-bottom-wide">{isEdit ? `Edit ${device.label}` : "New OBS Connection"}</h3>

      <IonInput
        data-testid={TEST_ID_DEVICE_FORM_LABEL}
        label="Label"
        labelPlacement="stacked"
        fill="outline"
        value={form.label}
        onIonInput={(e) => updateField("label", e.detail.value ?? "")}
        clearInput
      />
      <div className="manifest-scripture-row">
        <IonInput
          data-testid={TEST_ID_DEVICE_FORM_HOST}
          label="Host"
          labelPlacement="stacked"
          fill="outline"
          value={form.host}
          onIonInput={(e) => updateField("host", e.detail.value ?? "")}
          className="fill-remaining"
          clearInput
        />
        <IonInput
          data-testid={TEST_ID_DEVICE_FORM_PORT}
          label="Port"
          labelPlacement="stacked"
          fill="outline"
          type="number"
          value={form.port}
          onIonInput={(e) => updateField("port", e.detail.value ?? DEFAULT_PORT)}
          style={{ maxWidth: "6rem" }}
        />
      </div>
      <IonInput
        data-testid={TEST_ID_DEVICE_FORM_PASSWORD}
        label={isEdit ? "New Password (leave blank to keep)" : "Password"}
        labelPlacement="stacked"
        fill="outline"
        type="password"
        value={form.password}
        onIonInput={(e) => updateField("password", e.detail.value ?? "")}
        clearInput
      />

      {isEdit && (
        <label className="layout-row gap-standard">
          <IonCheckbox
            data-testid={TEST_ID_DEVICE_FORM_ENABLED}
            checked={form.enabled}
            onIonChange={(e) => updateField("enabled", e.detail.checked)}
          />
          Enabled
        </label>
      )}

      {error && (
        <IonText color="danger" data-testid={TEST_ID_DEVICE_FORM_ERROR}>
          <p className="margin-none text-secondary">{error}</p>
        </IonText>
      )}

      <div className="layout-row gap-standard">
        <IonButton
          data-testid={TEST_ID_DEVICE_FORM_SAVE}
          disabled={pending || !form.label || !form.host}
          onClick={() => void handleSave()}
        >
          {pending ? <IonSpinner name="crescent" /> : "Save"}
        </IonButton>
        {isEdit && (
          <IonButton
            data-testid={TEST_ID_DEVICE_FORM_DELETE}
            fill="outline"
            color="danger"
            disabled={deletePending}
            onClick={() => setDeleteConfirmOpen(true)}
          >
            {deletePending ? <IonSpinner name="crescent" /> : "Delete"}
          </IonButton>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Delete Device"
        body={`Are you sure you want to delete "${device?.label ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
