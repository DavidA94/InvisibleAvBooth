import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { IonButton, IonSelect, IonSelectOption } from "@ionic/react";
import type { DirtyCheck } from "../deviceForms/deviceTypeRegistry";

interface PlatformConfig {
  id: string;
  platformType: string;
  label: string;
  enabled: boolean;
  hasToken: boolean;
  metadata: Record<string, unknown>;
  tokenExpiresAt?: string | null;
}

interface Props {
  config: PlatformConfig;
  onSaved: () => void;
  registerDirtyCheck: (check: DirtyCheck) => void;
}

export function YouTubePlatformDetail({ config, onSaved, registerDirtyCheck }: Props): ReactNode {
  const channelTitle = (config.metadata.channelTitle as string) ?? "";
  const currentPrivacy = (config.metadata.privacy as string) ?? "unlisted";
  const [privacy, setPrivacy] = useState(currentPrivacy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isDirty = privacy !== currentPrivacy;

  useEffect(() => {
    registerDirtyCheck({ isDirty: () => privacy !== currentPrivacy });
  }, [privacy, currentPrivacy, registerDirtyCheck]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/platforms/youtube/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy }),
      });
      if (res.ok) {
        onSaved();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Save failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>YouTube</h3>

      <div className="layout-row gap-standard margin-bottom-tight">
        <span className="text-muted">Status:</span>
        <span className="widget-dot-healthy">●</span>
        <span>Connected</span>
      </div>

      {channelTitle && (
        <div className="layout-row gap-standard margin-bottom-tight">
          <span className="text-muted">Channel:</span>
          <span>{channelTitle}</span>
        </div>
      )}

      {config.tokenExpiresAt && (
        <div className="layout-row gap-standard margin-bottom-tight">
          <span className="text-muted">Token expires:</span>
          <span>{new Date(config.tokenExpiresAt).toLocaleString()}</span>
        </div>
      )}

      <div className="layout-row gap-standard margin-bottom-spacious" style={{ alignItems: "center" }}>
        <span className="text-muted">Default privacy:</span>
        <IonSelect value={privacy} onIonChange={(e) => setPrivacy(e.detail.value as string)} interface="popover">
          <IonSelectOption value="public">Public</IonSelectOption>
          <IonSelectOption value="unlisted">Unlisted</IonSelectOption>
          <IonSelectOption value="private">Private</IonSelectOption>
        </IonSelect>
      </div>

      {error && <p className="text-danger margin-bottom-tight">{error}</p>}

      <IonButton disabled={!isDirty || saving} onClick={() => void handleSave()}>
        {saving ? "Saving…" : "Save"}
      </IonButton>
    </div>
  );
}
