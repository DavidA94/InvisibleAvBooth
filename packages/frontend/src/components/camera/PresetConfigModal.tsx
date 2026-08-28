import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { IonToggle, IonInput, IonButton, IonSpinner } from "@ionic/react";
import type { PositionInquiry } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
import { CameraWidget } from "./CameraWidget";
import {
  TEST_ID_PRESET_SAVE_BUTTON,
  TEST_ID_PRESET_CANCEL_BUTTON,
  TEST_ID_PRESET_NAME_INPUT,
  TEST_ID_PRESET_STORE_ON_CAMERA_TOGGLE,
  TEST_ID_PRESET_SLOT_INPUT,
  TEST_ID_PRESET_POSITION_SUMMARY,
} from "../../constants/testIds";

interface PresetConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: PresetFormData) => void;
  onCapturePosition: () => Promise<PositionInquiry>;
  cameraId?: string;
  initialName?: string;
  initialStoredOnCamera?: boolean;
  initialSlot?: number | null;
}

export interface PresetFormData {
  name: string;
  storedOnCamera: boolean;
  cameraPresetSlot: number | null;
  position: PositionInquiry | null;
}

export function PresetConfigModal({
  open,
  onClose,
  onSave,
  onCapturePosition,
  cameraId,
  initialName = "",
  initialStoredOnCamera = false,
  initialSlot = null,
}: PresetConfigModalProps): ReactNode {
  const [name, setName] = useState(initialName);
  const [storedOnCamera, setStoredOnCamera] = useState(initialStoredOnCamera);
  const [slot, setSlot] = useState<number | null>(initialSlot);
  const [position, setPosition] = useState<PositionInquiry | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setStoredOnCamera(initialStoredOnCamera);
      setSlot(initialSlot);
      setPosition(null);
    }
  }, [open, initialName, initialStoredOnCamera, initialSlot]);

  const handleCaptureAndSave = async (): Promise<void> => {
    setCapturing(true);
    const pos = await onCapturePosition();
    setPosition(pos);
    setCapturing(false);
    onSave({ name, storedOnCamera, cameraPresetSlot: storedOnCamera ? slot : null, position: pos });
  };

  const title = initialName ? `Edit Preset: ${initialName}` : "Create Preset";

  const footer = (
    <div className="layout-row gap-standard">
      <IonButton data-testid={TEST_ID_PRESET_SAVE_BUTTON} disabled={!name || capturing} onClick={() => void handleCaptureAndSave()}>
        {capturing ? <IonSpinner name="crescent" /> : "Capture Position and Save"}
      </IonButton>
      <IonButton data-testid={TEST_ID_PRESET_CANCEL_BUTTON} fill="outline" onClick={onClose}>
        Cancel
      </IonButton>
    </div>
  );

  return (
    <Modal isOpen={open} onClose={onClose} size="large" header={title} footer={footer}>
      <IonInput
        data-testid={TEST_ID_PRESET_NAME_INPUT}
        label="Preset Name"
        labelPlacement="stacked"
        fill="outline"
        value={name}
        onIonInput={(e) => setName(e.detail.value ?? "")}
        clearInput
      />

      {/* Full camera widget — preview, joystick, zoom, all connected via socket */}
      <div style={{ marginTop: "0.75rem", height: "24rem" }}>
        <CameraWidget enabled={open} {...(cameraId ? { forceSelectedId: cameraId } : {})} />
      </div>

      <div className="layout-row gap-standard" style={{ margin: "1rem 0 0.5rem", alignItems: "center" }}>
        <label className="layout-row gap-standard" style={{ alignItems: "center", cursor: "pointer" }} onClick={() => setStoredOnCamera(!storedOnCamera)}>
          <IonToggle data-testid={TEST_ID_PRESET_STORE_ON_CAMERA_TOGGLE} checked={storedOnCamera} onIonChange={(e) => setStoredOnCamera(e.detail.checked)} />
          Store on Camera
        </label>
        <IonInput
          data-testid={TEST_ID_PRESET_SLOT_INPUT}
          label="Slot #"
          labelPlacement="stacked"
          fill="outline"
          type="number"
          value={slot !== null ? String(slot) : ""}
          onIonInput={(e) => setSlot(e.detail.value ? Number(e.detail.value) : null)}
          disabled={!storedOnCamera}
          style={{ width: "10rem" }}
        />
      </div>

      {position && (
        <div data-testid={TEST_ID_PRESET_POSITION_SUMMARY} className="text-muted text-secondary text-small margin-block-standard">
          Pan: {position.pan ?? "N/A"} &nbsp; Tilt: {position.tilt ?? "N/A"} &nbsp; Zoom: {position.zoom ?? "N/A"} &nbsp; Focus: {position.focus ?? "N/A"}
        </div>
      )}
    </Modal>
  );
}
