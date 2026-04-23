import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText, IonSpinner, IonCheckbox } from "@ionic/react";
import { interpolateStreamTitle } from "@invisible-av-booth/shared";
import { useStore } from "../store";

interface DeviceRecord {
  id: string;
  deviceType: string;
  label: string;
  host: string;
  port: number;
  metadata: Record<string, string>;
  features: Record<string, boolean>;
  enabled: boolean;
  createdAt: string;
}

const DEFAULT_TEMPLATE = "{Date} – {Speaker} – {Title}";

export function AdminDeviceManagement(): ReactNode {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Create form
  const [createLabel, setCreateLabel] = useState("");
  const [createHost, setCreateHost] = useState("");
  const [createPort, setCreatePort] = useState("4455");
  const [createPassword, setCreatePassword] = useState("");
  const [createTemplate, setCreateTemplate] = useState(DEFAULT_TEMPLATE);
  const [createPending, setCreatePending] = useState(false);
  const [createError, setCreateError] = useState("");

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editHost, setEditHost] = useState("");
  const [editPort, setEditPort] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [editEnabled, setEditEnabled] = useState(true);
  const [editPending, setEditPending] = useState(false);
  const [editError, setEditError] = useState("");

  const [deletePendingId, setDeletePendingId] = useState<string | null>(null);

  const manifest = useStore((s) => s.manifest);

  const fetchDevices = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/devices", { credentials: "include" });
      if (response.ok) {
        setDevices((await response.json()) as DeviceRecord[]);
      }
    } catch {
      setError("Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDevices();
  }, [fetchDevices]);

  const createPreview = useMemo(() => interpolateStreamTitle(manifest, createTemplate), [manifest, createTemplate]);
  const editPreview = useMemo(() => interpolateStreamTitle(manifest, editTemplate), [manifest, editTemplate]);

  const handleCreate = async (): Promise<void> => {
    setCreateError("");
    setCreatePending(true);
    try {
      const response = await fetch("/api/admin/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          deviceType: "obs",
          label: createLabel,
          host: createHost,
          port: Number(createPort),
          password: createPassword || undefined,
          metadata: { streamTitleTemplate: createTemplate },
        }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setCreateError(data.error ?? "Create failed");
        return;
      }
      setCreateLabel("");
      setCreateHost("");
      setCreatePort("4455");
      setCreatePassword("");
      setCreateTemplate(DEFAULT_TEMPLATE);
      void fetchDevices();
    } catch {
      setCreateError("Network error");
    } finally {
      setCreatePending(false);
    }
  };

  const startEdit = (device: DeviceRecord): void => {
    setEditingId(device.id);
    setEditLabel(device.label);
    setEditHost(device.host);
    setEditPort(String(device.port));
    setEditPassword("");
    setEditTemplate(device.metadata["streamTitleTemplate"] ?? DEFAULT_TEMPLATE);
    setEditEnabled(device.enabled);
    setEditError("");
  };

  const cancelEdit = (): void => {
    setEditingId(null);
    setEditError("");
  };

  const handleEdit = async (): Promise<void> => {
    if (!editingId) return;
    setEditError("");
    setEditPending(true);
    try {
      const body: Record<string, unknown> = {
        label: editLabel,
        host: editHost,
        port: Number(editPort),
        enabled: editEnabled,
        metadata: { streamTitleTemplate: editTemplate },
      };
      if (editPassword) body["password"] = editPassword;
      const response = await fetch(`/api/admin/devices/${editingId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setEditError(data.error ?? "Update failed");
        return;
      }
      setEditingId(null);
      void fetchDevices();
    } catch {
      setEditError("Network error");
    } finally {
      setEditPending(false);
    }
  };

  const handleDelete = async (deviceId: string): Promise<void> => {
    setDeletePendingId(deviceId);
    try {
      const response = await fetch(`/api/admin/devices/${deviceId}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
      }
      void fetchDevices();
    } catch {
      setError("Network error");
    } finally {
      setDeletePendingId(null);
    }
  };

  if (loading) {
    return (
      <IonPage data-testid="admin-devices-page">
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid="admin-devices-page">
      <IonContent className="ion-padding">
        <div className="form-container" style={{ maxWidth: "40rem" }}>
          <h2 className="text-center margin-bottom-spacious">Device Management</h2>

          {error && (
            <IonText color="danger">
              <p className="margin-none text-secondary margin-bottom-wide">{error}</p>
            </IonText>
          )}

          {/* Create device form */}
          <div data-testid="create-device-form" className="surface" style={{ padding: "1rem", marginBottom: "1.5rem" }}>
            <h3 className="margin-none margin-bottom-wide">Add OBS Connection</h3>
            <div className="form-layout">
              <IonInput
                data-testid="create-device-label"
                label="Label"
                labelPlacement="stacked"
                fill="outline"
                value={createLabel}
                onIonInput={(e) => setCreateLabel(e.detail.value ?? "")}
                clearInput
              />
              <div className="manifest-scripture-row">
                <IonInput
                  data-testid="create-device-host"
                  label="Host"
                  labelPlacement="stacked"
                  fill="outline"
                  value={createHost}
                  onIonInput={(e) => setCreateHost(e.detail.value ?? "")}
                  className="fill-remaining"
                  clearInput
                />
                <IonInput
                  data-testid="create-device-port"
                  label="Port"
                  labelPlacement="stacked"
                  fill="outline"
                  type="number"
                  value={createPort}
                  onIonInput={(e) => setCreatePort(e.detail.value ?? "4455")}
                  style={{ maxWidth: "6rem" }}
                />
              </div>
              <IonInput
                data-testid="create-device-password"
                label="Password"
                labelPlacement="stacked"
                fill="outline"
                type="password"
                value={createPassword}
                onIonInput={(e) => setCreatePassword(e.detail.value ?? "")}
                clearInput
              />
              <IonInput
                data-testid="create-device-template"
                label="Stream Title Template"
                labelPlacement="stacked"
                fill="outline"
                value={createTemplate}
                onIonInput={(e) => setCreateTemplate(e.detail.value ?? DEFAULT_TEMPLATE)}
                clearInput
              />
              <div data-testid="create-template-preview" className="manifest-preview">
                <span className="text-muted">Preview</span>
                <p className="text-bold margin-top-tight margin-none">{createPreview}</p>
              </div>
              {createError && (
                <IonText color="danger" data-testid="create-device-error">
                  <p className="margin-none text-secondary">{createError}</p>
                </IonText>
              )}
              <IonButton
                data-testid="create-device-submit"
                expand="block"
                disabled={createPending || !createLabel || !createHost}
                onClick={() => void handleCreate()}
              >
                {createPending ? <IonSpinner name="crescent" /> : "Add Device"}
              </IonButton>
            </div>
          </div>

          {/* Device list */}
          <div data-testid="device-list">
            {devices.map((device) => (
              <div key={device.id} data-testid={`device-row-${device.id}`} className="surface" style={{ padding: "0.75rem", marginBottom: "0.5rem" }}>
                {editingId === device.id ? (
                  <div className="form-layout">
                    <IonInput
                      data-testid="edit-device-label"
                      label="Label"
                      labelPlacement="stacked"
                      fill="outline"
                      value={editLabel}
                      onIonInput={(e) => setEditLabel(e.detail.value ?? "")}
                      clearInput
                    />
                    <div className="manifest-scripture-row">
                      <IonInput
                        data-testid="edit-device-host"
                        label="Host"
                        labelPlacement="stacked"
                        fill="outline"
                        value={editHost}
                        onIonInput={(e) => setEditHost(e.detail.value ?? "")}
                        className="fill-remaining"
                        clearInput
                      />
                      <IonInput
                        data-testid="edit-device-port"
                        label="Port"
                        labelPlacement="stacked"
                        fill="outline"
                        type="number"
                        value={editPort}
                        onIonInput={(e) => setEditPort(e.detail.value ?? "")}
                        style={{ maxWidth: "6rem" }}
                      />
                    </div>
                    <IonInput
                      data-testid="edit-device-password"
                      label="New Password (leave blank to keep)"
                      labelPlacement="stacked"
                      fill="outline"
                      type="password"
                      value={editPassword}
                      onIonInput={(e) => setEditPassword(e.detail.value ?? "")}
                      clearInput
                    />
                    <IonInput
                      data-testid="edit-device-template"
                      label="Stream Title Template"
                      labelPlacement="stacked"
                      fill="outline"
                      value={editTemplate}
                      onIonInput={(e) => setEditTemplate(e.detail.value ?? DEFAULT_TEMPLATE)}
                      clearInput
                    />
                    <div data-testid="edit-template-preview" className="manifest-preview">
                      <span className="text-muted">Preview</span>
                      <p className="text-bold margin-top-tight margin-none">{editPreview}</p>
                    </div>
                    <label className="layout-row gap-standard">
                      <IonCheckbox
                        data-testid="edit-device-enabled"
                        checked={editEnabled}
                        onIonChange={(e) => setEditEnabled(e.detail.checked)}
                      />
                      Enabled
                    </label>
                    {editError && (
                      <IonText color="danger" data-testid="edit-device-error">
                        <p className="margin-none text-secondary">{editError}</p>
                      </IonText>
                    )}
                    <div className="layout-row gap-standard">
                      <IonButton data-testid="edit-device-save" size="small" disabled={editPending} onClick={() => void handleEdit()}>
                        {editPending ? <IonSpinner name="crescent" /> : "Save"}
                      </IonButton>
                      <IonButton data-testid="edit-device-cancel" size="small" fill="outline" onClick={cancelEdit}>
                        Cancel
                      </IonButton>
                    </div>
                  </div>
                ) : (
                  <div className="layout-row gap-standard">
                    <strong>{device.label}</strong>
                    <span className="text-muted text-secondary">{device.host}:{device.port}</span>
                    <span className="text-muted text-secondary">({device.deviceType})</span>
                    {!device.enabled && <span className="text-danger text-secondary">Disabled</span>}
                    <span className="fill-remaining" />
                    <IonButton data-testid={`edit-device-btn-${device.id}`} size="small" fill="clear" onClick={() => startEdit(device)}>
                      Edit
                    </IonButton>
                    <IonButton
                      data-testid={`delete-device-btn-${device.id}`}
                      size="small"
                      fill="clear"
                      color="danger"
                      disabled={deletePendingId === device.id}
                      onClick={() => void handleDelete(device.id)}
                    >
                      {deletePendingId === device.id ? <IonSpinner name="crescent" /> : "Delete"}
                    </IonButton>
                  </div>
                )}
              </div>
            ))}
            {devices.length === 0 && <p className="text-muted text-center">No devices configured</p>}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
