import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton, IonSpinner, IonSelect, IonSelectOption } from "@ionic/react";
import { useSearchParams } from "react-router";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import {
  TEST_ID_FACEBOOK_CONFIG_PAGE,
  TEST_ID_PLATFORM_CONNECT_BUTTON,
  TEST_ID_PLATFORM_DISCONNECT_BUTTON,
  TEST_ID_PLATFORM_ACCOUNT_DISPLAY,
} from "../../constants/testIds";

interface PlatformConfig {
  platformType: string;
  hasToken?: boolean;
  enabled?: boolean;
  metadata?: Record<string, unknown>;
}

interface PageOption {
  id: string;
  name: string;
}

export function FacebookPlatformConfig(): ReactNode {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const err = searchParams.get("error");
    const connected = searchParams.get("connected");
    if (err) {
      setError(`Connection failed: ${err.replace(/_/g, " ")}`);
      setSearchParams({}, { replace: true });
    }
    if (connected) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const fetchConfig = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/platforms/facebook", { credentials: "include" });
      if (res.ok) setConfig((await res.json()) as PlatformConfig);
      else setConfig(null);
    } catch {
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleConnect = async (target: "profile" | "page"): Promise<void> => {
    setError("");
    try {
      const res = await fetch("/api/admin/platforms/facebook/oauth-start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      if (res.ok) {
        const data = (await res.json()) as { authUrl: string };
        window.location.href = data.authUrl;
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to start OAuth flow");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    try {
      await fetch("/api/admin/platforms/facebook", { method: "DELETE", credentials: "include" });
      setConfig(null);
    } catch {
      setError("Failed to disconnect");
    } finally {
      setDisconnectConfirm(false);
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
        setConfig((await res.json()) as PlatformConfig);
      } else {
        setError("Failed to select page");
      }
    } catch {
      setError("Failed to select page");
    }
  };

  if (loading)
    return (
      <IonPage data-testid={TEST_ID_FACEBOOK_CONFIG_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );

  const connected = config?.hasToken;
  const targetType = config?.metadata?.targetType as string | undefined;
  const pageId = config?.metadata?.pageId as string | undefined;
  const pageName = config?.metadata?.pageName as string | undefined;
  const userName = config?.metadata?.userName as string | undefined;
  const privacy = (config?.metadata?.privacy as string) ?? "SELF";
  const pages = (config?.metadata?.pages as PageOption[] | undefined) ?? [];
  const needsPageSelection = connected && targetType === "pending";
  const isConfigured = connected && (targetType === "page" || targetType === "user");

  const handlePrivacyChange = async (value: string): Promise<void> => {
    try {
      const res = await fetch("/api/platforms/facebook/settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privacy: value }),
      });
      if (res.ok) setConfig((await res.json()) as PlatformConfig);
    } catch {
      setError("Failed to update privacy");
    }
  };

  return (
    <IonPage data-testid={TEST_ID_FACEBOOK_CONFIG_PAGE}>
      <IonContent className="ion-padding">
        <div className="platform-config-wrapper">
          <h2 className="admin-page-title">Facebook Configuration</h2>
          {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

          <div className="text-center margin-bottom-spacious">
            {connected ? (
              <IonButton data-testid={TEST_ID_PLATFORM_DISCONNECT_BUTTON} color="danger" onClick={() => setDisconnectConfirm(true)}>
                Disconnect Facebook
              </IonButton>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", alignItems: "center" }}>
                <IonButton data-testid={TEST_ID_PLATFORM_CONNECT_BUTTON} onClick={() => void handleConnect("page")}>
                  Connect Facebook Page
                </IonButton>
                <IonButton fill="outline" onClick={() => void handleConnect("profile")}>
                  Connect My Profile
                </IonButton>
              </div>
            )}
          </div>

          <div className="platform-status-box">
            {needsPageSelection ? (
              <div>
                <p className="text-center margin-bottom-tight">Select where to stream:</p>
                <IonSelect placeholder="Choose a target" onIonChange={(e) => void handlePageSelect(e.detail.value as string)} interface="popover">
                  <IonSelectOption value="user">My Profile ({userName ?? "User"})</IonSelectOption>
                  {pages.map((page) => (
                    <IonSelectOption key={page.id} value={page.id}>
                      {page.name} (Page)
                    </IonSelectOption>
                  ))}
                </IonSelect>
              </div>
            ) : isConfigured ? (
              <div data-testid={TEST_ID_PLATFORM_ACCOUNT_DISPLAY}>
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
                  <div className="layout-row gap-standard margin-bottom-tight" style={{ alignItems: "center" }}>
                    <span className="text-muted">Default privacy:</span>
                    <IonSelect value={privacy} onIonChange={(e) => void handlePrivacyChange(e.detail.value as string)} interface="popover">
                      <IonSelectOption value="EVERYONE">Public</IonSelectOption>
                      <IonSelectOption value="ALL_FRIENDS">Friends</IonSelectOption>
                      <IonSelectOption value="SELF">Only Me</IonSelectOption>
                    </IonSelect>
                  </div>
                ) : (
                  <div className="layout-row gap-standard">
                    <span className="text-muted">Privacy:</span>
                    <span>Public (Pages are always public)</span>
                  </div>
                )}
              </div>
            ) : connected ? (
              <div data-testid={TEST_ID_PLATFORM_ACCOUNT_DISPLAY}>
                <div className="layout-row gap-standard margin-bottom-tight">
                  <span className="text-muted">Status:</span>
                  <span className="widget-dot-healthy">●</span>
                  <span>Connected</span>
                </div>
              </div>
            ) : (
              <p className="text-muted text-center margin-none" style={{ fontStyle: "italic" }}>
                Facebook is not configured. Click the button above to connect your Page via OAuth.
              </p>
            )}
          </div>
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
      </IonContent>
    </IonPage>
  );
}
