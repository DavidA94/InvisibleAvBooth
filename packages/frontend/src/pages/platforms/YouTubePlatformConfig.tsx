import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton, IonSpinner } from "@ionic/react";
import { useSearchParams } from "react-router";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import { TEST_ID_YOUTUBE_CONFIG_PAGE, TEST_ID_PLATFORM_CONNECT_BUTTON, TEST_ID_PLATFORM_DISCONNECT_BUTTON, TEST_ID_PLATFORM_ACCOUNT_DISPLAY } from "../../constants/testIds";

interface PlatformConfig { platformType: string; hasToken?: boolean; enabled?: boolean; metadata?: Record<string, unknown> }

export function YouTubePlatformConfig(): ReactNode {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Handle OAuth redirect results
  useEffect(() => {
    const err = searchParams.get("error");
    const connected = searchParams.get("connected");
    if (err) { setError(`Connection failed: ${err.replace(/_/g, " ")}`); setSearchParams({}, { replace: true }); }
    if (connected) { setSearchParams({}, { replace: true }); }
  }, [searchParams, setSearchParams]);

  const fetchConfig = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/platforms/youtube", { credentials: "include" });
      if (res.ok) setConfig((await res.json()) as PlatformConfig);
      else setConfig(null);
    } catch { setError("Failed to load configuration"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void fetchConfig(); }, [fetchConfig]);

  const handleConnect = async (): Promise<void> => {
    setError("");
    try {
      const res = await fetch("/api/admin/platforms/youtube/oauth-start", { method: "POST", credentials: "include" });
      if (res.ok) {
        const data = (await res.json()) as { authUrl: string };
        window.location.href = data.authUrl;
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? "Failed to start OAuth flow");
      }
    } catch { setError("Network error"); }
  };

  const handleDisconnect = async (): Promise<void> => {
    try {
      await fetch("/api/admin/platforms/youtube", { method: "DELETE", credentials: "include" });
      setConfig(null);
    } catch { setError("Failed to disconnect"); }
    finally { setDisconnectConfirm(false); }
  };

  if (loading) return <IonPage data-testid={TEST_ID_YOUTUBE_CONFIG_PAGE}><IonContent className="ion-padding ion-text-center"><IonSpinner /></IonContent></IonPage>;

  const connected = config?.hasToken;

  return (
    <IonPage data-testid={TEST_ID_YOUTUBE_CONFIG_PAGE}>
      <IonContent className="ion-padding">
        <div className="platform-config-wrapper">
          <h2 className="admin-page-title">YouTube Configuration</h2>
          {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

          <div className="text-center margin-bottom-spacious">
            {connected ? (
              <IonButton data-testid={TEST_ID_PLATFORM_DISCONNECT_BUTTON} color="danger" onClick={() => setDisconnectConfirm(true)}>
                Disconnect YouTube
              </IonButton>
            ) : (
              <IonButton data-testid={TEST_ID_PLATFORM_CONNECT_BUTTON} onClick={() => void handleConnect()}>
                Connect YouTube Account
              </IonButton>
            )}
          </div>

          <div className="platform-status-box">
            {connected ? (
              <div data-testid={TEST_ID_PLATFORM_ACCOUNT_DISPLAY}>
                <div className="layout-row gap-standard margin-bottom-tight">
                  <span className="text-muted">Status:</span>
                  <span className="widget-dot-healthy">●</span>
                  <span>Connected</span>
                </div>
                {config?.metadata?.privacy && (
                  <div className="layout-row gap-standard">
                    <span className="text-muted">Privacy:</span>
                    <span>{String(config.metadata.privacy)}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-muted text-center margin-none" style={{ fontStyle: "italic" }}>
                YouTube is not configured. Click the button above to connect your account via OAuth.
              </p>
            )}
          </div>
        </div>

        <ConfirmationModal isOpen={disconnectConfirm} title="Disconnect YouTube" body="Are you sure? Active streams will be affected." confirmLabel="Disconnect" cancelLabel="Cancel" confirmVariant="danger" onConfirm={() => void handleDisconnect()} onCancel={() => setDisconnectConfirm(false)} />
      </IonContent>
    </IonPage>
  );
}
