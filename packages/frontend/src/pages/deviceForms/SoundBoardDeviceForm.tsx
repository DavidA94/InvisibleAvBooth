import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IonInput, IonButton, IonText, IonSpinner, IonCheckbox, IonToggle, IonIcon, IonItem, IonLabel } from "@ionic/react";
import { checkmarkCircle, closeCircle } from "ionicons/icons";
import Select from "react-select";
import { darkSelectStyles } from "../../theme/selectStyles";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { PresetConfigModal } from "../../components/soundboard/PresetConfigModal";
import type { DeviceFormProps } from "./deviceTypeRegistry";
import type { MixerFeature, MixerModel } from "@invisible-av-booth/shared";
import {
  TEST_ID_DEVICE_FORM_LABEL,
  TEST_ID_DEVICE_FORM_HOST,
  TEST_ID_DEVICE_FORM_PORT,
  TEST_ID_DEVICE_FORM_ENABLED,
  TEST_ID_DEVICE_FORM_SAVE,
  TEST_ID_DEVICE_FORM_DELETE,
  TEST_ID_DEVICE_FORM_ERROR,
} from "../../constants/testIds";
import type { SoundBoardFormState } from "./soundBoardDeviceFormLogic";
import {
  buildInitialState,
  isFormDirty,
  validate,
  serializeMetadata,
  serializeFeatures,
  MIXER_FEATURES,
  MIXER_MODEL_OPTIONS,
} from "./soundBoardDeviceFormLogic";

type ProbeResult = { status: "success"; model?: string; firmware?: string } | { status: "error"; message: string } | null;

interface PresetRow {
  id: string;
  name: string;
  sortOrder: number;
}

export function SoundBoardDeviceForm({ device, onSaved, onDeleted, registerDirtyCheck }: DeviceFormProps): ReactNode {
  const isEdit = device !== null;
  const initialState = useMemo(() => buildInitialState(device), [device]);
  const [form, setForm] = useState<SoundBoardFormState>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [probeResult, setProbeResult] = useState<ProbeResult>(null);
  const [probing, setProbing] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<{ id: string; name: string } | null>(null);
  const [presetDeleteId, setPresetDeleteId] = useState<string | null>(null);

  const formRef = useRef(form);
  formRef.current = form;
  const initialRef = useRef(initialState);
  initialRef.current = initialState;

  useEffect(() => {
    registerDirtyCheck({ isDirty: () => isFormDirty(formRef.current, initialRef.current) });
  }, [registerDirtyCheck]);

  useEffect(() => {
    setForm(initialState);
    setError("");
    setProbeResult(null);
  }, [initialState]);

  useEffect(() => {
    if (!device) return;
    fetch(`/api/admin/mixers/${device.id}/presets`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPresets(data as PresetRow[]))
      .catch(() => {});
  }, [device]);

  const updateField = useCallback(<K extends keyof SoundBoardFormState>(key: K, value: SoundBoardFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFeature = useCallback((feature: MixerFeature, checked: boolean) => {
    setForm((prev) => ({ ...prev, features: { ...prev.features, [feature]: checked } }));
  }, []);

  const handleProbe = async (): Promise<void> => {
    setProbing(true);
    setProbeResult(null);
    try {
      const response = await fetch("/api/admin/mixers/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ host: form.host, port: Number(form.port) }),
      });
      const data = (await response.json()) as { ok: boolean; model?: string; firmware?: string; reason?: string };
      if (data.ok) {
        const result: ProbeResult = { status: "success" };
        if (data.model !== undefined) result.model = data.model;
        if (data.firmware !== undefined) result.firmware = data.firmware;
        setProbeResult(result);
      } else {
        setProbeResult({ status: "error", message: data.reason ?? "No response from mixer" });
      }
    } catch {
      setProbeResult({ status: "error", message: "Network error" });
    } finally {
      setProbing(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    const validationError = validate(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setPending(true);
    try {
      const body: Record<string, unknown> = {
        label: form.label,
        host: form.host,
        port: Number(form.port),
        metadata: serializeMetadata(form),
        features: serializeFeatures(form),
      };
      if (isEdit) body["enabled"] = form.enabled;
      else body["deviceType"] = "soundboard";

      const url = isEdit ? `/api/admin/devices/${device.id}` : "/api/admin/devices";
      const response = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
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
    try {
      const response = await fetch(`/api/admin/devices/${device.id}`, { method: "DELETE", credentials: "include" });
      if (response.ok) {
        setDeleteConfirmOpen(false);
        onDeleted();
        return;
      }
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Delete failed");
    } catch {
      setError("Network error");
    }
    setDeleteConfirmOpen(false);
  };

  const reloadPresets = useCallback(async (): Promise<void> => {
    if (!device) return;
    const r = await fetch(`/api/admin/mixers/${device.id}/presets`, { credentials: "include" });
    if (r.ok) setPresets((await r.json()) as PresetRow[]);
  }, [device]);

  const handleDeletePreset = useCallback(async (): Promise<void> => {
    if (!device || !presetDeleteId) return;
    try {
      const r = await fetch(`/api/admin/mixers/${device.id}/presets/${presetDeleteId}`, { method: "DELETE", credentials: "include" });
      if (r.ok) setPresets((prev) => prev.filter((p) => p.id !== presetDeleteId));
    } catch {
      /* ignore */
    }
    setPresetDeleteId(null);
  }, [device, presetDeleteId]);

  const selectedModel = MIXER_MODEL_OPTIONS.find((o) => o.value === form.model) ?? MIXER_MODEL_OPTIONS[0]!;
  const canSave = !!form.label && !!form.host;

  return (
    <div className="form-layout">
      <h3 className="detail-header">{isEdit ? `Edit ${device.label}` : "New Sound Board"}</h3>

      <IonInput
        data-testid={TEST_ID_DEVICE_FORM_LABEL}
        label="Label"
        labelPlacement="stacked"
        fill="outline"
        value={form.label}
        onIonInput={(e) => updateField("label", e.detail.value ?? "")}
        clearInput
      />

      <div>
        <label className="text-muted text-secondary form-label">Model</label>
        <Select
          options={MIXER_MODEL_OPTIONS}
          value={selectedModel}
          onChange={(opt) => opt && updateField("model", (opt as { value: MixerModel }).value)}
          styles={darkSelectStyles()}
          isSearchable={false}
        />
      </div>

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
          onIonInput={(e) => updateField("port", e.detail.value ?? "10024")}
          className="input-port"
        />
      </div>

      <IonInput
        label="Number of Channels"
        labelPlacement="stacked"
        fill="outline"
        type="number"
        value={form.channelCount}
        onIonInput={(e) => updateField("channelCount", e.detail.value ?? "8")}
      />

      <IonButton size="small" fill="outline" disabled={probing || !form.host} onClick={() => void handleProbe()}>
        {probing ? <IonSpinner name="crescent" /> : "Test Connection"}
      </IonButton>
      {probeResult && (
        <div className="layout-row gap-standard">
          {probeResult.status === "success" ? (
            <>
              <IonIcon icon={checkmarkCircle} color="success" />
              <span className="text-success">Connected{probeResult.model ? ` — ${probeResult.model} ${probeResult.firmware ?? ""}` : ""}</span>
            </>
          ) : (
            <>
              <IonIcon icon={closeCircle} color="danger" />
              <span className="text-danger">{probeResult.message}</span>
            </>
          )}
        </div>
      )}

      <h4 className="text-muted section-heading-margin">Features</h4>
      {MIXER_FEATURES.map((feature) => (
        <label key={feature} className="layout-row gap-standard">
          <IonToggle checked={form.features[feature]} onIonChange={(e) => toggleFeature(feature, e.detail.checked)} />
          {feature}
        </label>
      ))}

      {isEdit && (
        <>
          <h4 className="text-muted section-heading-margin">Presets</h4>
          {presets.length === 0 && <p className="text-muted text-secondary text-small">No presets configured.</p>}
          {presets.map((preset) => (
            <IonItem key={preset.id} lines="inset">
              <IonLabel>{preset.name}</IonLabel>
              <IonButton
                slot="end"
                size="small"
                fill="clear"
                onClick={() => {
                  setEditingPreset({ id: preset.id, name: preset.name });
                  setPresetModalOpen(true);
                }}
              >
                Edit
              </IonButton>
              <IonButton slot="end" size="small" fill="clear" color="danger" onClick={() => setPresetDeleteId(preset.id)}>
                Delete
              </IonButton>
            </IonItem>
          ))}
          <IonButton
            size="small"
            fill="outline"
            onClick={() => {
              setEditingPreset(null);
              setPresetModalOpen(true);
            }}
          >
            Add Preset
          </IonButton>
        </>
      )}

      {isEdit && (
        <label className="layout-row gap-standard margin-top-standard">
          <IonCheckbox data-testid={TEST_ID_DEVICE_FORM_ENABLED} checked={form.enabled} onIonChange={(e) => updateField("enabled", e.detail.checked)} />
          Enabled
        </label>
      )}

      {error && (
        <IonText color="danger" data-testid={TEST_ID_DEVICE_FORM_ERROR}>
          <p className="margin-none text-secondary">{error}</p>
        </IonText>
      )}

      <div className="layout-row gap-standard margin-top-standard">
        <IonButton data-testid={TEST_ID_DEVICE_FORM_SAVE} disabled={pending || !canSave} onClick={() => void handleSave()}>
          {pending ? <IonSpinner name="crescent" /> : "Save"}
        </IonButton>
        {isEdit && (
          <IonButton data-testid={TEST_ID_DEVICE_FORM_DELETE} fill="outline" color="danger" onClick={() => setDeleteConfirmOpen(true)}>
            Delete
          </IonButton>
        )}
      </div>

      <ConfirmationModal
        isOpen={deleteConfirmOpen}
        title="Delete Device"
        body={`Delete "${device?.label ?? ""}"? This also removes its presets. This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />

      {isEdit && (
        <PresetConfigModal
          open={presetModalOpen}
          mixerId={device.id}
          editingPreset={editingPreset}
          onClose={() => {
            setPresetModalOpen(false);
            setEditingPreset(null);
          }}
          onSaved={() => {
            setPresetModalOpen(false);
            setEditingPreset(null);
            void reloadPresets();
          }}
        />
      )}

      <ConfirmationModal
        isOpen={!!presetDeleteId}
        title="Delete Preset"
        body={`Delete preset "${presets.find((p) => p.id === presetDeleteId)?.name ?? ""}"? This cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => void handleDeletePreset()}
        onCancel={() => setPresetDeleteId(null)}
      />
    </div>
  );
}
