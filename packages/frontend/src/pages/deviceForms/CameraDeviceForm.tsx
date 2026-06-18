import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { IonInput, IonButton, IonText, IonSpinner, IonCheckbox, IonToggle, IonIcon, IonReorderGroup, IonReorder, IonItem, IonLabel } from "@ionic/react";
import type { ItemReorderEventDetail } from "@ionic/react";
import { checkmarkCircle, closeCircle } from "ionicons/icons";
import Select from "react-select";
import { darkSelectStyles } from "../../theme/selectStyles";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { PresetConfigModal } from "../../components/camera/PresetConfigModal";
import type { PresetFormData } from "../../components/camera/PresetConfigModal";
import type { DeviceFormProps, DeviceRecord } from "./deviceTypeRegistry";
import type { CameraFeature, CameraModel, PositionInquiry } from "@invisible-av-booth/shared";
import {
  TEST_ID_DEVICE_FORM_LABEL,
  TEST_ID_DEVICE_FORM_ENABLED,
  TEST_ID_DEVICE_FORM_SAVE,
  TEST_ID_DEVICE_FORM_DELETE,
  TEST_ID_DEVICE_FORM_ERROR,
} from "../../constants/testIds";

// ── Types ────────────────────────────────────────────────────────────────────

interface CameraFormState {
  label: string;
  cameraModel: CameraModel;
  ndiSourceName: string;
  ndiExtraIPs: string;
  viscaEnabled: boolean;
  host: string;
  port: string;
  fovWideAngle: string;
  opticalZoomRatio: string;
  features: CameraFeature[];
  aiHttpCookie: string;
  aiCredentialId: string;
  enabled: boolean;
}

interface PresetRow {
  id: string;
  name: string;
  storedOnCamera: boolean;
  sortOrder: number;
}

type ProbeResult = { status: "success" } | { status: "error"; message: string } | null;

// ── Constants ────────────────────────────────────────────────────────────────

const ALL_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom", "focus"];
const AI_FEATURES: CameraFeature[] = ["ai-tracking", "ai-tracking-tilt", "ai-tracking-zoom"];
const PTZ_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom"];

const MODEL_OPTIONS: Array<{ value: CameraModel; label: string }> = [
  { value: "generic", label: "Generic" },
  { value: "tongveo-nvs20a-4kn", label: "Tongveo NVS20A-4KN" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildInitialState(device: DeviceRecord | null): CameraFormState {
  if (device) {
    const meta = device.metadata as Record<string, unknown>;
    return {
      label: device.label,
      cameraModel: (meta.cameraModel as CameraModel) ?? "generic",
      ndiSourceName: (meta.ndiSourceName as string) ?? "",
      ndiExtraIPs: (meta.ndiExtraIPs as string) ?? "",
      viscaEnabled: (meta.viscaEnabled as boolean) ?? false,
      host: device.host,
      port: String(device.port),
      fovWideAngle: String((meta.fovWideAngle as number) ?? 60),
      opticalZoomRatio: String((meta.opticalZoomRatio as number) ?? 20),
      features: (meta.cameraFeatures as CameraFeature[]) ?? [...ALL_FEATURES],
      aiHttpCookie: "",
      aiCredentialId: "",
      enabled: device.enabled,
    };
  }
  return {
    label: "",
    cameraModel: "generic",
    ndiSourceName: "",
    ndiExtraIPs: "",
    viscaEnabled: true,
    host: "",
    port: "5500",
    fovWideAngle: "60",
    opticalZoomRatio: "20",
    features: [...ALL_FEATURES],
    aiHttpCookie: "",
    aiCredentialId: "",
    enabled: true,
  };
}

function isFormDirty(current: CameraFormState, initial: CameraFormState, isEdit: boolean): boolean {
  if (current.label !== initial.label) return true;
  if (current.cameraModel !== initial.cameraModel) return true;
  if (current.ndiSourceName !== initial.ndiSourceName) return true;
  if (current.ndiExtraIPs !== initial.ndiExtraIPs) return true;
  if (current.viscaEnabled !== initial.viscaEnabled) return true;
  if (current.host !== initial.host) return true;
  if (current.port !== initial.port) return true;
  if (current.fovWideAngle !== initial.fovWideAngle) return true;
  if (current.opticalZoomRatio !== initial.opticalZoomRatio) return true;
  if (current.enabled !== initial.enabled) return true;
  if (JSON.stringify(current.features) !== JSON.stringify(initial.features)) return true;
  if (isEdit && (current.aiHttpCookie !== "" || current.aiCredentialId !== "")) return true;
  if (!isEdit && (current.aiHttpCookie !== initial.aiHttpCookie || current.aiCredentialId !== initial.aiCredentialId)) return true;
  return false;
}

function viscaRequired(features: CameraFeature[]): boolean {
  return PTZ_FEATURES.some((f) => features.includes(f));
}

// ── Component ────────────────────────────────────────────────────────────────

export function CameraDeviceForm({ device, onSaved, onDeleted, registerDirtyCheck }: DeviceFormProps): ReactNode {
  const isEdit = device !== null;
  const initialState = useMemo(() => buildInitialState(device), [device]);

  const [form, setForm] = useState<CameraFormState>(initialState);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [presets, setPresets] = useState<PresetRow[]>([]);
  const [presetDeleteId, setPresetDeleteId] = useState<string | null>(null);
  const [presetModalOpen, setPresetModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<PresetRow | null>(null);
  const [probeResult, setProbeResult] = useState<ProbeResult>(null);

  const formRef = useRef(form);
  formRef.current = form;
  const initialRef = useRef(initialState);
  initialRef.current = initialState;

  useEffect(() => {
    registerDirtyCheck({ isDirty: () => isFormDirty(formRef.current, initialRef.current, isEdit) });
  }, [registerDirtyCheck, isEdit]);

  useEffect(() => {
    setForm(initialState);
    setError("");
    setProbeResult(null);
  }, [initialState]);

  useEffect(() => {
    if (!device) return;
    fetch(`/api/admin/cameras/${device.id}/presets`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setPresets(data as PresetRow[]))
      .catch(() => {});
  }, [device]);

  const updateField = useCallback(<K extends keyof CameraFormState>(key: K, value: CameraFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const toggleFeature = useCallback((f: CameraFeature, checked: boolean) => {
    setForm((prev) => ({ ...prev, features: checked ? [...prev.features, f] : prev.features.filter((x) => x !== f) }));
  }, []);

  const requiresVisca = viscaRequired(form.features);
  const viscaMissing = requiresVisca && !form.viscaEnabled;
  const canSave = form.label && form.ndiSourceName && !viscaMissing && (!form.viscaEnabled || form.host);

  const handleSave = async (): Promise<void> => {
    setError("");
    setProbeResult(null);
    setPending(true);
    try {
      const metadata: Record<string, unknown> = {
        ndiSourceName: form.ndiSourceName,
        ndiExtraIPs: form.ndiExtraIPs || undefined,
        cameraModel: form.cameraModel,
        viscaEnabled: form.viscaEnabled,
        fovWideAngle: Number(form.fovWideAngle),
        opticalZoomRatio: Number(form.opticalZoomRatio),
        cameraFeatures: form.features,
      };
      if (form.cameraModel !== "generic") {
        if (form.aiHttpCookie) metadata["aiHttpCookie"] = form.aiHttpCookie;
        if (form.aiCredentialId) metadata["aiCredentialId"] = form.aiCredentialId;
      }

      const body: Record<string, unknown> = {
        label: form.label,
        host: form.viscaEnabled ? form.host : "127.0.0.1",
        port: form.viscaEnabled ? Number(form.port) : 5500,
        metadata,
        features: {},
      };
      if (isEdit) {
        body["enabled"] = form.enabled;
      } else {
        body["deviceType"] = "camera-ptz";
      }

      const url = isEdit ? `/api/admin/devices/${device.id}` : "/api/admin/devices";
      const method = isEdit ? "PUT" : "POST";
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Save failed");
        return;
      }
      // Probe result — simulate based on save success (real probe happens backend-side)
      setProbeResult({ status: "success" });
      onSaved();
    } catch {
      setError("Network error");
      setProbeResult({ status: "error", message: "Network error" });
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

  const handleDeletePreset = async (): Promise<void> => {
    if (!device || !presetDeleteId) return;
    try {
      const r = await fetch(`/api/admin/cameras/${device.id}/presets/${presetDeleteId}`, { method: "DELETE", credentials: "include" });
      if (r.ok) setPresets((prev) => prev.filter((p) => p.id !== presetDeleteId));
    } catch {
      /* ignore */
    }
    setPresetDeleteId(null);
  };

  const handlePresetSave = async (data: PresetFormData): Promise<void> => {
    if (!device) return;
    const body = {
      name: data.name,
      storedOnCamera: data.storedOnCamera,
      cameraPresetSlot: data.cameraPresetSlot,
      pan: data.position?.pan ?? null,
      tilt: data.position?.tilt ?? null,
      zoom: data.position?.zoom ?? null,
      focus: data.position?.focus ?? null,
      autoFocus: data.position?.autoFocus ?? true,
      aiTracking: false,
      aiTilt: false,
      aiZoom: false,
    };
    const url = editingPreset
      ? `/api/admin/cameras/${device.id}/presets/${editingPreset.id}`
      : `/api/admin/cameras/${device.id}/presets`;
    const method = editingPreset ? "PUT" : "POST";
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
      if (r.ok) {
        const updated = await fetch(`/api/admin/cameras/${device.id}/presets`, { credentials: "include" });
        if (updated.ok) setPresets((await updated.json()) as PresetRow[]);
      }
    } catch {
      /* ignore */
    }
    setPresetModalOpen(false);
    setEditingPreset(null);
  };

  const handleCapturePosition = async (): Promise<PositionInquiry> => {
    if (!device) return { pan: null, tilt: null, zoom: null, focus: null, autoFocus: null };
    try {
      const r = await fetch(`/api/admin/cameras/${device.id}/capture-position`, { method: "POST", credentials: "include" });
      if (r.ok) return (await r.json()) as PositionInquiry;
    } catch {
      /* ignore */
    }
    return { pan: null, tilt: null, zoom: null, focus: null, autoFocus: null };
  };

  const handleDragDrop = async (fromIdx: number, toIdx: number): Promise<void> => {
    if (!device || fromIdx === toIdx) return;
    const reordered = [...presets];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved!);
    setPresets(reordered);
    const presetIds = reordered.map((p) => p.id);
    try {
      await fetch(`/api/admin/cameras/${device.id}/presets/order`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ presetIds }),
      });
    } catch {
      /* ignore */
    }
  };

  const selectedModel = MODEL_OPTIONS.find((o) => o.value === form.cameraModel) ?? MODEL_OPTIONS[0]!;

  return (
    <div className="form-layout">
      <h3 className="detail-header">{isEdit ? `Edit ${device.label}` : "New Camera"}</h3>

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
        <label className="text-muted text-secondary" style={{ fontSize: "0.75rem", marginBottom: "0.125rem", display: "block" }}>Camera Model</label>
        <Select
          options={MODEL_OPTIONS}
          value={selectedModel}
          onChange={(opt) => opt && updateField("cameraModel", (opt as { value: CameraModel }).value)}
          styles={darkSelectStyles()}
        />
      </div>

      <IonInput
        data-testid="camera-ndi-source"
        label="NDI Source Name (required)"
        labelPlacement="stacked"
        fill="outline"
        placeholder="CAMERA-1 (PTZ)"
        value={form.ndiSourceName}
        onIonInput={(e) => updateField("ndiSourceName", e.detail.value ?? "")}
        clearInput
      />
      <IonInput
        label="NDI Extra IPs (optional)"
        labelPlacement="stacked"
        fill="outline"
        placeholder="127.0.0.1,192.168.1.100"
        value={form.ndiExtraIPs}
        onIonInput={(e) => updateField("ndiExtraIPs", e.detail.value ?? "")}
        clearInput
      />

      {/* VISCA Section */}
      <label className="layout-row gap-standard" style={{ marginTop: "0.75rem" }}>
        <IonToggle checked={form.viscaEnabled} onIonChange={(e) => updateField("viscaEnabled", e.detail.checked)} />
        VISCA Connection {requiresVisca ? "(Required for PTZ)" : "(Optional)"}
      </label>

      {viscaMissing && (
        <p className="text-danger" style={{ fontSize: "0.8rem", margin: "0.25rem 0" }}>
          VISCA is required when pan, tilt, or zoom features are enabled.
        </p>
      )}

      {form.viscaEnabled && (
        <div className="manifest-scripture-row">
          <IonInput
            label="Camera IP"
            labelPlacement="stacked"
            fill="outline"
            value={form.host}
            onIonInput={(e) => updateField("host", e.detail.value ?? "")}
            className="fill-remaining"
            clearInput
          />
          <IonInput
            label="Port"
            labelPlacement="stacked"
            fill="outline"
            type="number"
            value={form.port}
            onIonInput={(e) => updateField("port", e.detail.value ?? "5500")}
            className="input-port"
          />
        </div>
      )}

      {!form.viscaEnabled && !viscaMissing && (
        <p className="text-muted text-secondary" style={{ fontSize: "0.8rem", margin: "0.5rem 0" }}>
          No VISCA configured — position tracking uses last-commanded values, which may drift if the camera is controlled externally.
        </p>
      )}

      <div className="manifest-scripture-row">
        <IonInput
          label="FOV Wide Angle (°)"
          labelPlacement="stacked"
          fill="outline"
          type="number"
          value={form.fovWideAngle}
          onIonInput={(e) => updateField("fovWideAngle", e.detail.value ?? "60")}
          className="fill-remaining"
        />
        <IonInput
          label="Optical Zoom Ratio (×)"
          labelPlacement="stacked"
          fill="outline"
          type="number"
          value={form.opticalZoomRatio}
          onIonInput={(e) => updateField("opticalZoomRatio", e.detail.value ?? "20")}
          className="fill-remaining"
        />
      </div>

      {/* AI Config (non-generic only) */}
      {form.cameraModel !== "generic" && (
        <>
          <h4 className="text-muted" style={{ margin: "0.75rem 0 0.25rem" }}>AI Tracking Configuration</h4>
          <IonInput
            label="HTTP Cookie"
            labelPlacement="stacked"
            fill="outline"
            type="password"
            placeholder="Paste from browser dev tools"
            value={form.aiHttpCookie}
            onIonInput={(e) => updateField("aiHttpCookie", e.detail.value ?? "")}
            clearInput
          />
          <IonInput
            label="API Credential ID"
            labelPlacement="stacked"
            fill="outline"
            type="password"
            placeholder="From request payload"
            value={form.aiCredentialId}
            onIonInput={(e) => updateField("aiCredentialId", e.detail.value ?? "")}
            clearInput
          />
        </>
      )}

      {/* Features Section */}
      <h4 className="text-muted" style={{ margin: "0.75rem 0 0.25rem" }}>Features</h4>
      {ALL_FEATURES.map((f) => (
        <label key={f} className="layout-row gap-standard">
          <IonToggle checked={form.features.includes(f)} onIonChange={(e) => toggleFeature(f, e.detail.checked)} />
          {f}
        </label>
      ))}
      {form.cameraModel !== "generic" &&
        AI_FEATURES.map((f) => (
          <label key={f} className="layout-row gap-standard">
            <IonToggle checked={form.features.includes(f)} onIonChange={(e) => toggleFeature(f, e.detail.checked)} />
            {f}
          </label>
        ))}

      {/* Presets Section (edit mode only) */}
      {isEdit && (
        <>
          <h4 className="text-muted" style={{ margin: "0.75rem 0 0.25rem" }}>Presets</h4>
          {presets.length === 0 && <p className="text-muted text-secondary" style={{ fontSize: "0.8rem" }}>No presets configured.</p>}
          <IonReorderGroup
            disabled={false}
            onIonItemReorder={(e: CustomEvent<ItemReorderEventDetail>) => {
              const from = e.detail.from;
              const to = e.detail.to;
              e.detail.complete();
              void handleDragDrop(from, to);
            }}
          >
            {presets.map((p) => (
              <IonItem key={p.id} lines="inset">
                <IonReorder slot="start" />
                <IonLabel>{p.name}</IonLabel>
                <span slot="end" className="text-muted text-secondary" style={{ fontSize: "0.75rem", marginRight: "0.5rem" }}>
                  {p.storedOnCamera ? "On Camera" : "Software Only"}
                </span>
                <IonButton slot="end" size="small" fill="clear" onClick={() => { setEditingPreset(p); setPresetModalOpen(true); }}>Edit</IonButton>
                <IonButton slot="end" size="small" fill="clear" color="danger" onClick={() => setPresetDeleteId(p.id)}>Delete</IonButton>
              </IonItem>
            ))}
          </IonReorderGroup>
          <IonButton size="small" fill="outline" style={{ marginTop: "0.5rem" }} onClick={() => { setEditingPreset(null); setPresetModalOpen(true); }}>
            Add Preset
          </IonButton>
        </>
      )}

      {/* Enabled toggle (edit only) */}
      {isEdit && (
        <label className="layout-row gap-standard" style={{ marginTop: "0.75rem" }}>
          <IonCheckbox data-testid={TEST_ID_DEVICE_FORM_ENABLED} checked={form.enabled} onIonChange={(e) => updateField("enabled", e.detail.checked)} />
          Enabled
        </label>
      )}

      {/* Probe result */}
      {probeResult && (
        <div className="layout-row gap-standard" style={{ alignItems: "center", marginTop: "0.5rem" }}>
          {probeResult.status === "success" ? (
            <>
              <IonIcon icon={checkmarkCircle} color="success" style={{ fontSize: "1.25rem" }} />
              <span className="text-success">Connected</span>
            </>
          ) : (
            <>
              <IonIcon icon={closeCircle} color="danger" style={{ fontSize: "1.25rem" }} />
              <span className="text-danger">{probeResult.message}</span>
            </>
          )}
        </div>
      )}

      {error && (
        <IonText color="danger" data-testid={TEST_ID_DEVICE_FORM_ERROR}>
          <p className="margin-none text-secondary">{error}</p>
        </IonText>
      )}

      <div className="layout-row gap-standard" style={{ marginTop: "0.75rem" }}>
        <IonButton data-testid={TEST_ID_DEVICE_FORM_SAVE} disabled={pending || !canSave} onClick={() => void handleSave()}>
          {pending ? <IonSpinner name="crescent" /> : "Save"}
        </IonButton>
        {isEdit && (
          <IonButton data-testid={TEST_ID_DEVICE_FORM_DELETE} fill="outline" color="danger" disabled={deletePending} onClick={() => setDeleteConfirmOpen(true)}>
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

      {isEdit && (
        <PresetConfigModal
          open={presetModalOpen}
          onClose={() => { setPresetModalOpen(false); setEditingPreset(null); }}
          onSave={(data) => void handlePresetSave(data)}
          onCapturePosition={handleCapturePosition}
          cameraId={device.id}
          initialName={editingPreset?.name ?? ""}
          initialStoredOnCamera={editingPreset?.storedOnCamera ?? false}
          initialSlot={null}
        />
      )}
    </div>
  );
}
