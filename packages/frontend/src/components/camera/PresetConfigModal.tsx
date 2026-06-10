import { useState } from "react";
import type { ReactNode } from "react";
import { IonToggle, IonInput } from "@ionic/react";
import type { PositionInquiry } from "@invisible-av-booth/shared";

interface PresetConfigModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: PresetFormData) => void;
  onCapturePosition: () => Promise<PositionInquiry>;
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
  initialName = "",
  initialStoredOnCamera = false,
  initialSlot = null,
}: PresetConfigModalProps): ReactNode {
  const [name, setName] = useState(initialName);
  const [storedOnCamera, setStoredOnCamera] = useState(initialStoredOnCamera);
  const [slot, setSlot] = useState<number | null>(initialSlot);
  const [position, setPosition] = useState<PositionInquiry | null>(null);

  if (!open) return null;

  const handleCapture = async () => {
    const pos = await onCapturePosition();
    setPosition(pos);
  };

  const handleSave = () => {
    onSave({ name, storedOnCamera, cameraPresetSlot: storedOnCamera ? slot : null, position });
  };

  return (
    <div data-testid="preset-config-modal" className="preview-modal-backdrop">
      <div className="preview-modal-content" onClick={(e) => e.stopPropagation()}>
        <h3>Configure Preset</h3>
        <div>
          <IonInput data-testid="preset-name-input" label="Name" value={name} onIonInput={(e) => setName(e.detail.value ?? "")} />
        </div>
        <div>
          <IonToggle data-testid="store-on-camera-toggle" checked={storedOnCamera} onIonChange={(e) => setStoredOnCamera(e.detail.checked)}>
            Store on Camera
          </IonToggle>
          {storedOnCamera && (
            <IonInput data-testid="preset-slot-input" type="number" value={String(slot ?? "")} onIonInput={(e) => setSlot(Number(e.detail.value))} />
          )}
        </div>
        <button type="button" data-testid="capture-position-btn" onClick={handleCapture}>
          Capture Position
        </button>
        {position && (
          <div data-testid="position-summary">
            <span>Pan: {position.pan ?? "N/A"}</span>
            <span>Tilt: {position.tilt ?? "N/A"}</span>
            <span>Zoom: {position.zoom ?? "N/A"}</span>
            <span>Focus: {position.focus ?? "N/A"}</span>
          </div>
        )}
        <div>
          <button type="button" data-testid="preset-save-btn" onClick={handleSave}>
            Save
          </button>
          <button type="button" data-testid="preset-cancel-btn" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
