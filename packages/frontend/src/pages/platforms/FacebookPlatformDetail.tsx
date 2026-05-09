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
}

interface PageOption {
  value: string;
  label: string;
}

interface PrivacyOption {
  value: string;
  label: string;
}

interface Props {
  config: PlatformConfig;
  onSaved: () => void;
  onRefresh: () => void;
  onDisconnected: () => void;
  registerDirtyCheck: (check: DirtyCheck) => void;
}

const PRIVACY_OPTIONS: PrivacyOption[] = [
  { value: "EVERYONE", label: "Public" },
  { value: "ALL_FRIENDS", label: "Friends" },
  { value: "SELF", label: "Only Me" },
];

const privacyStyles = darkSelectStyles<PrivacyOption>();
const pageStyles = darkSelectStyles<PageOption>();

export function FacebookPlatformDetail({ config, onSaved, onRefresh, onDisconnected, registerDirtyCheck }: Props): ReactNode {
  const targetType = config.metadata.targetType as string | undefined;
  const pageName = config.metadata.pageName as string | undefined;
  const userName = config.metadata.userName as string | undefined;
  const pages = (config.metadata.pages as Array<{ id: string; name: string }> | undefined) ?? [];
  const currentPrivacy = (config.metadata.privacy as string) ?? "SELF";
  const needsPageSelection = targetType === "pending";

  const [privacy, setPrivacy] = useState(currentPrivacy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  const isDirty = targetType === "user" && privacy !== currentPrivacy;

  useEffect(() => {
    registerDirtyCheck({ isDirty: () => targetType === "user" && privacy !== currentPrivacy });
  }, [privacy, currentPrivacy, targetType, registerDirtyCheck]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/platforms/facebook/settings", {
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

  const handlePageSelect = async (pageId: string): Promise<void> => {
    try {
      const res = await fetch("/api/admin/platforms/facebook/select-page", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      if (res.ok) onRefresh();
      else setError("Failed to select target");
    } catch {
      setError("Network error");
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    try {
      await fetch("/api/admin/platforms/facebook", { method: "DELETE", credentials: "include" });
      onDisconnected();
    } catch {
      setError("Failed to disconnect");
    } finally {
      setDisconnectConfirm(false);
    }
  };

  const pageOptions: PageOption[] = [
    { value: "user", label: `My Profile (${userName ?? "User"})` },
    ...pages.map((p) => ({ value: p.id, label: `${p.name} (Page)` })),
  ];

  if (needsPageSelection) {
    return (
      <div>
        <h3 className="detail-header">Edit Facebook</h3>
        <p>Select where to stream:</p>
        <div className="select-container-wide">
          <Select<PageOption>
            options={pageOptions}
            onChange={(option) => option && void handlePageSelect(option.value)}
            styles={pageStyles}
            isSearchable={false}
            placeholder="Choose a target…"
            menuPortalTarget={document.body}
          />
        </div>
        {error && <p className="text-danger margin-top-tight">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <h3 className="detail-header">Edit Facebook</h3>

      <div className="platform-detail-fields">
        <div className="platform-detail-row">
          <span className="platform-detail-label">Status:</span>
          <span>
            <span className="widget-dot-healthy">●</span> Connected
          </span>
        </div>

        <div className="platform-detail-row">
          <span className="platform-detail-label">Target:</span>
          <span>
            {targetType === "page" ? (pageName ?? "Page") : (userName ?? "My Profile")} ({targetType === "page" ? "Page" : "Profile"})
          </span>
        </div>

        {targetType === "user" ? (
          <div className="platform-detail-row">
            <span className="platform-detail-label">Default privacy:</span>
            <div className="select-container-narrow">
              <Select<PrivacyOption>
                options={PRIVACY_OPTIONS}
                value={PRIVACY_OPTIONS.find((o) => o.value === privacy) ?? null}
                onChange={(option) => setPrivacy(option?.value ?? "SELF")}
                styles={privacyStyles}
                isSearchable={false}
                menuPortalTarget={document.body}
              />
            </div>
          </div>
        ) : (
          <div className="platform-detail-row">
            <span className="platform-detail-label">Privacy:</span>
            <span>Public (Pages are always public)</span>
          </div>
        )}
      </div>

      {error && <p className="text-danger margin-bottom-tight">{error}</p>}

      <div className="detail-footer">
        {targetType === "user" && (
          <IonButton disabled={!isDirty || saving} onClick={() => void handleSave()}>
            {saving ? <IonSpinner name="crescent" /> : "Save"}
          </IonButton>
        )}
        <IonButton fill="outline" color="danger" onClick={() => setDisconnectConfirm(true)}>
          Disconnect
        </IonButton>
      </div>

      <ConfirmationModal
        isOpen={disconnectConfirm}
        title="Disconnect Facebook"
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
