import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton, IonSpinner } from "@ionic/react";
import { addOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import { ConfirmationModal } from "../components/ConfirmationModal";
import {
  DEVICE_TYPE_REGISTRY, DEVICE_TYPE_KEYS, getDeviceTypeDisplayName,
} from "./deviceForms/deviceTypeRegistry";
import type { DeviceRecord, DirtyCheck } from "./deviceForms/deviceTypeRegistry";
import {
  TEST_ID_ADMIN_DEVICES_PAGE, TEST_ID_DEVICE_LIST, TEST_ID_DEVICE_LIST_ITEM,
  TEST_ID_ADD_DEVICE_BUTTON, TEST_ID_ADD_DEVICE_POPOVER, TEST_ID_ADD_DEVICE_TYPE_OPTION,
  TEST_ID_DEVICE_DETAIL_PANEL, TEST_ID_DEVICE_DETAIL_EMPTY, TEST_ID_DEVICE_LIST_DELETE_BUTTON,
} from "../constants/testIds";

interface PanelState {
  mode: "empty" | "create" | "edit";
  deviceType?: string;
  deviceId?: string;
}

export function AdminDeviceManagement(): ReactNode {
  const [devices, setDevices] = useState<DeviceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<PanelState>({ mode: "empty" });
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Unsaved changes guard
  const dirtyCheckRef = useRef<DirtyCheck>({ isDirty: () => false });
  const [pendingNavigation, setPendingNavigation] = useState<PanelState | null>(null);
  const [deleteConfirmDevice, setDeleteConfirmDevice] = useState<DeviceRecord | null>(null);

  const registerDirtyCheck = useCallback((check: DirtyCheck) => {
    dirtyCheckRef.current = check;
  }, []);

  const navigatePanel = useCallback((next: PanelState): void => {
    if (dirtyCheckRef.current.isDirty()) {
      setPendingNavigation(next);
    } else {
      setPanel(next);
      dirtyCheckRef.current = { isDirty: () => false };
    }
  }, []);

  const confirmNavigation = useCallback((): void => {
    if (pendingNavigation) {
      setPanel(pendingNavigation);
      setPendingNavigation(null);
      dirtyCheckRef.current = { isDirty: () => false };
    }
  }, [pendingNavigation]);

  const cancelNavigation = useCallback((): void => {
    setPendingNavigation(null);
  }, []);

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

  const handleSaved = useCallback((): void => {
    dirtyCheckRef.current = { isDirty: () => false };
    setPanel({ mode: "empty" });
    void fetchDevices();
  }, [fetchDevices]);

  const handleDeleted = useCallback((): void => {
    dirtyCheckRef.current = { isDirty: () => false };
    setPanel({ mode: "empty" });
    void fetchDevices();
  }, [fetchDevices]);

  const handleListDelete = async (device: DeviceRecord): Promise<void> => {
    try {
      const response = await fetch(`/api/admin/devices/${device.id}`, { method: "DELETE", credentials: "include" });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        setError(data.error ?? "Delete failed");
      }
      if (panel.mode === "edit" && panel.deviceId === device.id) {
        dirtyCheckRef.current = { isDirty: () => false };
        setPanel({ mode: "empty" });
      }
      void fetchDevices();
    } catch {
      setError("Network error");
    } finally {
      setDeleteConfirmDevice(null);
    }
  };

  const handleAddDeviceType = (deviceType: string): void => {
    setPopoverOpen(false);
    navigatePanel({ mode: "create", deviceType });
  };

  const handleSelectDevice = (device: DeviceRecord): void => {
    navigatePanel({ mode: "edit", deviceId: device.id, deviceType: device.deviceType });
  };

  // Sort devices by device type, then by label
  const sortedDevices = [...devices].sort((a, b) => {
    const typeCompare = a.deviceType.localeCompare(b.deviceType);
    if (typeCompare !== 0) return typeCompare;
    return a.label.localeCompare(b.label);
  });

  const selectedDevice = panel.mode === "edit" ? devices.find((d) => d.id === panel.deviceId) ?? null : null;
  const FormComponent = panel.deviceType ? DEVICE_TYPE_REGISTRY[panel.deviceType]?.formComponent : undefined;

  if (loading) {
    return (
      <IonPage data-testid={TEST_ID_ADMIN_DEVICES_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid={TEST_ID_ADMIN_DEVICES_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="admin-page-title">Device Management</h2>

        {error && (
          <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>
        )}

        <div className="device-management-layout">
          {/* Left panel — device list */}
          <div className="device-management-list-panel">
            <div className="position-relative">
              <IonButton
                data-testid={TEST_ID_ADD_DEVICE_BUTTON}
                expand="block"
                style={{ minHeight: "3rem" }}
                onClick={() => setPopoverOpen((prev) => !prev)}
              >
                <IonIcon icon={addOutline} slot="start" />
                Add Device
              </IonButton>

              {popoverOpen && (
                <div data-testid={TEST_ID_ADD_DEVICE_POPOVER} className="add-device-dropdown surface-raised">
                  {DEVICE_TYPE_KEYS.map((key) => (
                    <button
                      key={key}
                      data-testid={`${TEST_ID_ADD_DEVICE_TYPE_OPTION}-${key}`}
                      className="button-unstyled add-device-dropdown-option"
                      type="button"
                      onClick={() => handleAddDeviceType(key)}
                    >
                      {DEVICE_TYPE_REGISTRY[key]!.displayName}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div data-testid={TEST_ID_DEVICE_LIST} className="device-list-scroll">
              {sortedDevices.map((device) => (
                <div
                  key={device.id}
                  data-testid={`${TEST_ID_DEVICE_LIST_ITEM}-${device.id}`}
                  className={`device-list-item surface ${panel.mode === "edit" && panel.deviceId === device.id ? "device-list-item-selected" : ""}`}
                  onClick={() => handleSelectDevice(device)}
                  onKeyDown={(e) => e.key === "Enter" && handleSelectDevice(device)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="fill-remaining">
                    <div className="text-bold">{device.label}</div>
                    <div className="text-muted text-caption">
                      {getDeviceTypeDisplayName(device.deviceType)}
                      {!device.enabled && <span className="text-danger margin-left-tight"> · Disabled</span>}
                    </div>
                  </div>
                  <IonButton
                    data-testid={`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-${device.id}`}
                    size="small"
                    fill="clear"
                    color="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmDevice(device);
                    }}
                  >
                    Delete
                  </IonButton>
                </div>
              ))}
              {devices.length === 0 && <p className="text-muted text-center">No devices configured</p>}
            </div>
          </div>

          {/* Right panel — form */}
          <div data-testid={TEST_ID_DEVICE_DETAIL_PANEL} className="device-management-detail-panel surface">
            {panel.mode === "empty" && (
              <div data-testid={TEST_ID_DEVICE_DETAIL_EMPTY} className="layout-centered full-height">
                <p className="text-muted">Select a device or add a new one</p>
              </div>
            )}
            {panel.mode === "create" && FormComponent && (
              <FormComponent
                key={`create-${panel.deviceType}`}
                device={null}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                registerDirtyCheck={registerDirtyCheck}
              />
            )}
            {panel.mode === "edit" && FormComponent && selectedDevice && (
              <FormComponent
                key={`edit-${selectedDevice.id}`}
                device={selectedDevice}
                onSaved={handleSaved}
                onDeleted={handleDeleted}
                registerDirtyCheck={registerDirtyCheck}
              />
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
          onConfirm={confirmNavigation}
          onCancel={cancelNavigation}
        />

        {/* List delete confirmation */}
        <ConfirmationModal
          isOpen={deleteConfirmDevice !== null}
          title="Delete Device"
          body={`Are you sure you want to delete "${deleteConfirmDevice?.label ?? ""}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          confirmVariant="danger"
          onConfirm={() => deleteConfirmDevice && void handleListDelete(deleteConfirmDevice)}
          onCancel={() => setDeleteConfirmDevice(null)}
        />
      </IonContent>
    </IonPage>
  );
}
