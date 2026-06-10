import { useState } from "react";
import type { ReactNode } from "react";
import Select from "react-select";
import { IonToggle, IonInput } from "@ionic/react";
import type { CameraModel, CameraFeature } from "@invisible-av-booth/shared";

interface CameraAdminPanelProps {
  initialModel?: CameraModel;
  initialViscaEnabled?: boolean;
  initialFeatures?: CameraFeature[];
  onSave?: (data: CameraAdminData) => void;
}

export interface CameraAdminData {
  cameraModel: CameraModel;
  ndiSourceName: string;
  viscaEnabled: boolean;
  host: string;
  port: number;
  fovWideAngle: number;
  opticalZoomRatio: number;
  features: CameraFeature[];
  aiHttpCookie?: string | undefined;
  aiCredentialId?: string | undefined;
}

const ALL_FEATURES: CameraFeature[] = ["pan", "tilt", "zoom", "focus"];
const AI_FEATURES: CameraFeature[] = ["ai-tracking", "ai-tracking-tilt", "ai-tracking-zoom"];

const MODEL_OPTIONS = [
  { value: "generic", label: "Generic" },
  { value: "tongveo-nvs20a-4kn", label: "Tongveo NVS20A-4KN" },
];

export function CameraAdminPanel({
  initialModel = "generic",
  initialViscaEnabled = false,
  initialFeatures = ALL_FEATURES,
  onSave,
}: CameraAdminPanelProps): ReactNode {
  const [model, setModel] = useState<CameraModel>(initialModel);
  const [ndiSourceName, setNdiSourceName] = useState("");
  const [viscaEnabled, setViscaEnabled] = useState(initialViscaEnabled);
  const [host, setHost] = useState("127.0.0.1");
  const [port, setPort] = useState(5500);
  const [fovWideAngle, setFovWideAngle] = useState(60);
  const [opticalZoomRatio, setOpticalZoomRatio] = useState(20);
  const [features, setFeatures] = useState<CameraFeature[]>(initialFeatures);
  const [aiCookie, setAiCookie] = useState("");
  const [aiCredential, setAiCredential] = useState("");

  const toggleFeature = (f: CameraFeature, checked: boolean) => {
    setFeatures((prev) => (checked ? [...prev, f] : prev.filter((x) => x !== f)));
  };

  const handleSave = () => {
    onSave?.({
      cameraModel: model,
      ndiSourceName,
      viscaEnabled,
      host: viscaEnabled ? host : "127.0.0.1",
      port: viscaEnabled ? port : 5500,
      fovWideAngle,
      opticalZoomRatio,
      features,
      aiHttpCookie: model !== "generic" ? aiCookie : undefined,
      aiCredentialId: model !== "generic" ? aiCredential : undefined,
    });
  };

  const selectedModel = MODEL_OPTIONS.find((o) => o.value === model) ?? MODEL_OPTIONS[0]!;

  return (
    <div data-testid="camera-admin-panel">
      <div data-testid="model-section">
        <Select
          data-testid="camera-model-select"
          options={MODEL_OPTIONS}
          value={selectedModel}
          onChange={(opt) => opt && setModel(opt.value as CameraModel)}
          placeholder="Camera Model"
        />
      </div>

      <div>
        <IonInput label="NDI Source Name" data-testid="ndi-source-input" value={ndiSourceName} onIonInput={(e) => setNdiSourceName(e.detail.value ?? "")} />
      </div>

      <div data-testid="visca-section">
        <IonToggle data-testid="visca-toggle" checked={viscaEnabled} onIonChange={(e) => setViscaEnabled(e.detail.checked)}>
          Enable VISCA
        </IonToggle>
        {viscaEnabled && (
          <div data-testid="visca-fields">
            <IonInput data-testid="visca-host" value={host} onIonInput={(e) => setHost(e.detail.value ?? "")} />
            <IonInput data-testid="visca-port" type="number" value={String(port)} onIonInput={(e) => setPort(Number(e.detail.value))} />
          </div>
        )}
        {!viscaEnabled && <p data-testid="no-visca-note">Position state will be based on commanded values only.</p>}
      </div>

      <div>
        <IonInput data-testid="fov-input" type="number" value={String(fovWideAngle)} onIonInput={(e) => setFovWideAngle(Number(e.detail.value))} />
        <IonInput
          data-testid="zoom-ratio-input"
          type="number"
          value={String(opticalZoomRatio)}
          onIonInput={(e) => setOpticalZoomRatio(Number(e.detail.value))}
        />
      </div>

      {model !== "generic" && (
        <div data-testid="ai-config-section">
          <IonInput data-testid="ai-cookie-input" value={aiCookie} onIonInput={(e) => setAiCookie(e.detail.value ?? "")} placeholder="AI HTTP Cookie" />
          <IonInput
            data-testid="ai-credential-input"
            value={aiCredential}
            onIonInput={(e) => setAiCredential(e.detail.value ?? "")}
            placeholder="AI Credential ID"
          />
        </div>
      )}

      <div data-testid="features-section">
        {ALL_FEATURES.map((f) => (
          <IonToggle key={f} data-testid={`feature-${f}`} checked={features.includes(f)} onIonChange={(e) => toggleFeature(f, e.detail.checked)}>
            {f}
          </IonToggle>
        ))}
        {model !== "generic" &&
          AI_FEATURES.map((f) => (
            <IonToggle key={f} data-testid={`feature-${f}`} checked={features.includes(f)} onIonChange={(e) => toggleFeature(f, e.detail.checked)}>
              {f}
            </IonToggle>
          ))}
      </div>

      <button type="button" data-testid="admin-save-btn" onClick={handleSave}>
        Save
      </button>
    </div>
  );
}
