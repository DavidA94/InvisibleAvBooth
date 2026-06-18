import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { IonToggle, IonInput, IonButton, IonSpinner } from "@ionic/react";
import type { PositionInquiry } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
import { CameraControls } from "./CameraControls";
import { usePreviewStream } from "../../hooks/usePreviewStream";

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

  const { videoRef, status } = usePreviewStream(cameraId ? `/preview/camera/${cameraId}` : "", open && !!cameraId);

  const handleCapture = async (): Promise<void> => {
    setCapturing(true);
    const pos = await onCapturePosition();
    setPosition(pos);
    setCapturing(false);
  };

  const handleSave = (): void => {
    onSave({ name, storedOnCamera, cameraPresetSlot: storedOnCamera ? slot : null, position });
  };

  const title = initialName ? `Edit Preset: ${initialName}` : "Create Preset";

  const footer = (
    <div className="layout-row gap-standard">
      <IonButton data-testid="preset-save-btn" disabled={!name || capturing} onClick={() => void handleCapture().then(handleSave)}>
        {capturing ? <IonSpinner name="crescent" /> : "Capture Position and Save"}
      </IonButton>
      <IonButton data-testid="preset-cancel-btn" fill="outline" onClick={onClose}>Cancel</IonButton>
    </div>
  );

  return (
    <Modal isOpen={open} onClose={onClose} size="large" header={title} footer={footer}>
      <IonInput
        data-testid="preset-name-input"
        label="Preset Name"
        labelPlacement="stacked"
        fill="outline"
        value={name}
        onIonInput={(e) => setName(e.detail.value ?? "")}
        clearInput
      />

      <div style={{ marginTop: "0.75rem" }}>
        <CameraControls
          videoRef={videoRef}
          previewStatus={status}
          connected={true}
          features={["pan", "tilt", "zoom", "focus"]}
          aiConfigured={false}
          isAdmin={true}
          zoom={0.5}
          focus={0.5}
          autoFocus={true}
          aiTracking={false}
          aiTilt={false}
          aiZoom={false}
          presets={[]}
          activePresetId={null}
          onZoomChange={() => {}}
          onFocusChange={() => {}}
          onAutoFocusChange={() => {}}
          onAiTrackingChange={() => {}}
          onAiTiltChange={() => {}}
          onAiZoomChange={() => {}}
          onJoystickStart={() => {}}
          onJoystickMove={() => {}}
          onJoystickStop={() => {}}
          onPresetActivate={() => {}}
        />
      </div>

      <label className="layout-row gap-standard" style={{ margin: "0.75rem 0 0.5rem" }}>
        <IonToggle data-testid="store-on-camera-toggle" checked={storedOnCamera} onIonChange={(e) => setStoredOnCamera(e.detail.checked)} />
        Store on Camera
      </label>
      {storedOnCamera && (
        <IonInput
          data-testid="preset-slot-input"
          label="Camera Slot Number"
          labelPlacement="stacked"
          fill="outline"
          type="number"
          value={slot !== null ? String(slot) : ""}
          onIonInput={(e) => setSlot(e.detail.value ? Number(e.detail.value) : null)}
        />
      )}

      {position && (
        <div data-testid="position-summary" className="text-muted text-secondary" style={{ fontSize: "0.8rem", margin: "0.5rem 0" }}>
          Pan: {position.pan?.toFixed(2) ?? "N/A"} &nbsp; Tilt: {position.tilt?.toFixed(2) ?? "N/A"} &nbsp;
          Zoom: {position.zoom?.toFixed(2) ?? "N/A"} &nbsp; Focus: {position.focus?.toFixed(2) ?? "N/A"}
        </div>
      )}
    </Modal>
  );
}
