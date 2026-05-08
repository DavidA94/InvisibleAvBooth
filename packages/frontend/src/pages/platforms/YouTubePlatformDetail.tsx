import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { IonButton, IonSpinner } from "@ionic/react";
import Select from "react-select";
import { darkSelectStyles } from "../../theme/selectStyles";
import { ConfirmationModal } from "../../components/ConfirmationModal";
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
  onDisconnected: () => void;
  registerDirtyCheck: (check: DirtyCheck) => void;
}

interface PrivacyOption {
  value: string;
  label: string;
}

const PRIVACY_OPTIONS: PrivacyOption[] = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

const privacyStyles = darkSelectStyles<PrivacyOption>();

export function YouTubePlatformDetail({ config, onSaved, onDisconnected, registerDirtyCheck }: Props): ReactNode {
  const channelTitle = (config.metadata.channelTitle as string) ?? "";
  const currentPrivacy = (config.metadata.privacy as string) ?? "unlisted";
  const [privacy, setPrivacy] = useState(currentPrivacy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

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
      if (res.ok) onSaved();
      else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Save failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    try {
      await fetch("/api/admin/platforms/youtube", { method: "DELETE", credentials: "include" });
      onDisconnected();
    } catch {
      setError("Failed to disconnect");
    } finally {
      setDisconnectConfirm(false);
    }
  };

  return (
    <div>
      <h3 className="margin-none margin-bottom-wide">Edit YouTube</h3>

      <div className="platform-detail-fields">
        <div className="platform-detail-row">
          <span className="platform-detail-label">Status:</span>
          <span>
            <span className="widget-dot-healthy">●</span> Connected
          </span>
        </div>

        {channelTitle && (
          <div className="platform-detail-row">
            <span className="platform-detail-label">Channel:</span>
            <span>{channelTitle}</span>
          </div>
        )}

        {config.tokenExpiresAt && (
          <div className="platform-detail-row">
            <span className="platform-detail-label">Token expires:</span>
            <span>{new Date(config.tokenExpiresAt).toLocaleString()}</span>
          </div>
        )}

        <div className="platform-detail-row">
          <span className="platform-detail-label">Default privacy:</span>
          <div style={{ minWidth: "10rem" }}>
            <Select<PrivacyOption>
              options={PRIVACY_OPTIONS}
              value={PRIVACY_OPTIONS.find((o) => o.value === privacy) ?? null}
              onChange={(option) => setPrivacy(option?.value ?? "unlisted")}
              styles={privacyStyles}
              isSearchable={false}
              menuPortalTarget={document.body}
            />
          </div>
        </div>
      </div>

      {error && <p className="text-danger margin-bottom-tight">{error}</p>}

      <div className="layout-row gap-standard margin-top-wide">
        <IonButton disabled={!isDirty || saving} onClick={() => void handleSave()}>
          {saving ? <IonSpinner name="crescent" /> : "Save"}
        </IonButton>
        <IonButton fill="outline" color="danger" onClick={() => setDisconnectConfirm(true)}>
          Disconnect
        </IonButton>
      </div>

      <ConfirmationModal
        isOpen={disconnectConfirm}
        title="Disconnect YouTube"
        body="Are you sure? Active streams will be affected."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        confirmVariant="danger"
        onConfirm={() => void handleDisconnect()}
        onCancel={() => setDisconnectConfirm(false)}
      />
    </div>
  );
}
