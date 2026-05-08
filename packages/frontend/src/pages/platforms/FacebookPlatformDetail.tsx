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
}

interface PageOption {
  id: string;
  name: string;
}

interface Props {
  config: PlatformConfig;
  onSaved: () => void;
  onRefresh: () => void;
  registerDirtyCheck: (check: DirtyCheck) => void;
}

export function FacebookPlatformDetail({ config, onSaved, onRefresh, registerDirtyCheck }: Props): ReactNode {
  const targetType = config.metadata.targetType as string | undefined;
  const pageName = config.metadata.pageName as string | undefined;
  const userName = config.metadata.userName as string | undefined;
  const pages = (config.metadata.pages as PageOption[] | undefined) ?? [];
  const currentPrivacy = (config.metadata.privacy as string) ?? "SELF";
  const needsPageSelection = targetType === "pending";

  const [privacy, setPrivacy] = useState(currentPrivacy);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

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

  const handlePageSelect = async (pageId: string): Promise<void> => {
    try {
      const res = await fetch("/api/admin/platforms/facebook/select-page", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageId }),
      });
      if (res.ok) {
        onRefresh();
      } else {
        setError("Failed to select target");
      }
    } catch {
      setError("Network error");
    }
  };

  if (needsPageSelection) {
    return (
      <div>
        <h3 style={{ marginTop: 0 }}>Facebook</h3>
        <p>Select where to stream:</p>
        <IonSelect placeholder="Choose a target" onIonChange={(e) => void handlePageSelect(e.detail.value as string)} interface="popover">
          <IonSelectOption value="user">My Profile ({userName ?? "User"})</IonSelectOption>
          {pages.map((page) => (
            <IonSelectOption key={page.id} value={page.id}>
              {page.name} (Page)
            </IonSelectOption>
          ))}
        </IonSelect>
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Facebook</h3>

      <div className="layout-row gap-standard margin-bottom-tight">
        <span className="text-muted">Status:</span>
        <span className="widget-dot-healthy">●</span>
        <span>Connected</span>
      </div>

      <div className="layout-row gap-standard margin-bottom-tight">
        <span className="text-muted">Target:</span>
        <span>{targetType === "page" ? (pageName ?? "Page") : (userName ?? "My Profile")}</span>
        <span className="text-muted">({targetType === "page" ? "Page" : "Profile"})</span>
      </div>

      {targetType === "user" ? (
        <div className="layout-row gap-standard margin-bottom-spacious" style={{ alignItems: "center" }}>
          <span className="text-muted">Default privacy:</span>
          <IonSelect value={privacy} onIonChange={(e) => setPrivacy(e.detail.value as string)} interface="popover">
            <IonSelectOption value="EVERYONE">Public</IonSelectOption>
            <IonSelectOption value="ALL_FRIENDS">Friends</IonSelectOption>
            <IonSelectOption value="SELF">Only Me</IonSelectOption>
          </IonSelect>
        </div>
      ) : (
        <div className="layout-row gap-standard margin-bottom-spacious">
          <span className="text-muted">Privacy:</span>
          <span>Public (Pages are always public)</span>
        </div>
      )}

      {error && <p className="text-danger margin-bottom-tight">{error}</p>}

      {targetType === "user" && (
        <IonButton disabled={!isDirty || saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save"}
        </IonButton>
      )}
    </div>
  );
}
