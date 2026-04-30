import { useState, useEffect, useCallback } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonSpinner } from "@ionic/react";
import { ConfirmationModal } from "../../components/ConfirmationModal";
import {
  TEST_ID_YOUTUBE_CONFIG_PAGE,
  TEST_ID_PLATFORM_CONNECT_BUTTON,
  TEST_ID_PLATFORM_DISCONNECT_BUTTON,
  TEST_ID_PLATFORM_ACCOUNT_DISPLAY,
} from "../../constants/testIds";

interface PlatformConfig {
  platformType: string;
  accountName?: string;
  connected: boolean;
}

export function YouTubePlatformConfig(): ReactNode {
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [disconnectConfirm, setDisconnectConfirm] = useState(false);

  const fetchConfig = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/platforms/youtube", { credentials: "include" });
      if (response.ok) {
        setConfig((await response.json()) as PlatformConfig);
      } else {
        setConfig({ platformType: "youtube", connected: false });
      }
    } catch {
      setError("Failed to load configuration");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchConfig();
  }, [fetchConfig]);

  const handleConnect = async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/platforms/youtube/oauth-start", {
        method: "POST",
        credentials: "include",
      });
      if (response.ok) {
        const data = (await response.json()) as { authUrl: string };
        window.location.href = data.authUrl;
      } else {
        setError("Failed to start OAuth flow");
      }
    } catch {
      setError("Network error");
    }
  };

  const handleDisconnect = async (): Promise<void> => {
    try {
      const response = await fetch("/api/admin/platforms/youtube", {
        method: "DELETE",
        credentials: "include",
      });
      if (response.ok) {
        setConfig({ platformType: "youtube", connected: false });
      } else {
        setError("Failed to disconnect");
      }
    } catch {
      setError("Network error");
    } finally {
      setDisconnectConfirm(false);
    }
  };

  if (loading) {
    return (
      <IonPage data-testid={TEST_ID_YOUTUBE_CONFIG_PAGE}>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid={TEST_ID_YOUTUBE_CONFIG_PAGE}>
      <IonContent className="ion-padding">
        <h2 className="text-center margin-bottom-spacious">YouTube Configuration</h2>
        {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

        <div className="platform-config surface">
          {config?.connected ? (
            <>
              <div data-testid={TEST_ID_PLATFORM_ACCOUNT_DISPLAY} className="platform-account">
                <span className="text-bold">Connected Account:</span>
                <span className="margin-left-tight">{config.accountName ?? "YouTube Account"}</span>
              </div>
              <button
                data-testid={TEST_ID_PLATFORM_DISCONNECT_BUTTON}
                className="button-ghost-danger button-padding-standard margin-top-wide"
                onClick={() => setDisconnectConfirm(true)}
              >
                Disconnect
              </button>
            </>
          ) : (
            <button data-testid={TEST_ID_PLATFORM_CONNECT_BUTTON} className="button-primary button-padding-standard" onClick={() => void handleConnect()}>
              Connect YouTube Account
            </button>
          )}
        </div>

        <ConfirmationModal
          isOpen={disconnectConfirm}
          title="Disconnect YouTube"
          body="Are you sure you want to disconnect your YouTube account? Active streams will be affected."
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
