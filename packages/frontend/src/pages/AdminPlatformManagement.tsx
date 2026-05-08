import { useState, useEffect, useCallback, useRef } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonButton, IonSpinner } from "@ionic/react";
import { addOutline } from "ionicons/icons";
import { IonIcon } from "@ionic/react";
import { ConfirmationModal } from "../components/ConfirmationModal";
import { YouTubePlatformDetail } from "./platforms/YouTubePlatformDetail";
import { FacebookPlatformDetail } from "./platforms/FacebookPlatformDetail";
import type { DirtyCheck } from "./deviceForms/deviceTypeRegistry";

interface PlatformConfig {
  id: string;
  platformType: string;
  label: string;
  enabled: boolean;
  hasToken: boolean;
  metadata: Record<string, unknown>;
  tokenExpiresAt?: string | null;
}

interface PanelState {
  mode: "empty" | "edit";
  platformType?: string;
}

const PRETTY_NAMES: Record<string, string> = { youtube: "YouTube", facebook: "Facebook" };

function getSubtitle(config: PlatformConfig): string {
  const meta = config.metadata;
  if (config.platformType === "youtube") return (meta.channelTitle as string) ?? "Connected";
  if (meta.targetType === "page") return (meta.pageName as string) ?? "Page";
  if (meta.targetType === "user") return (meta.userName as string) ?? "My Profile";
  if (meta.targetType === "pending") return "Needs page selection";
  return "Connected";
}

export function AdminPlatformManagement(): ReactNode {
  const [platforms, setPlatforms] = useState<PlatformConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [panel, setPanel] = useState<PanelState>({ mode: "empty" });
  const [popoverOpen, setPopoverOpen] = useState(false);

  // Unsaved changes guard
  const dirtyCheckRef = useRef<DirtyCheck>({ isDirty: () => false });
  const [pendingNavigation, setPendingNavigation] = useState<PanelState | null>(null);
  const [deleteConfirmPlatform, setDeleteConfirmPlatform] = useState<PlatformConfig | null>(null);

  const registerDirtyCheck = useCallback((check: DirtyCheck) => {
    dirtyCheckRef.current = check;
  }, []);

  const navigatePanel = useCallback((next: PanelState): void => {
    if (dirtyCheckRef.current.isDirty()) {
      setPendingNavigation(next);
    } else {
      setPanel(next);
      dirtyCheckRef.current = { isDirty: () => false };
    }
  }, []);

  const confirmNavigation = useCallback((): void => {
    if (pendingNavigation) {
      setPanel(pendingNavigation);
      setPendingNavigation(null);
      dirtyCheckRef.current = { isDirty: () => false };
    }
  }, [pendingNavigation]);

  const cancelNavigation = useCallback((): void => {
    setPendingNavigation(null);
  }, []);

  const fetchPlatforms = useCallback(async (): Promise<void> => {
    try {
      const res = await fetch("/api/admin/platforms", { credentials: "include" });
      if (res.ok) setPlatforms((await res.json()) as PlatformConfig[]);
    } catch {
      setError("Failed to load platforms");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchPlatforms();
  }, [fetchPlatforms]);

  const handleSaved = useCallback((): void => {
    dirtyCheckRef.current = { isDirty: () => false };
    void fetchPlatforms();
  }, [fetchPlatforms]);

  const handleDisconnected = useCallback((): void => {
    dirtyCheckRef.current = { isDirty: () => false };
    setPanel({ mode: "empty" });
    void fetchPlatforms();
  }, [fetchPlatforms]);

  const handleDelete = async (platform: PlatformConfig): Promise<void> => {
    try {
      await fetch(`/api/admin/platforms/${platform.platformType}`, { method: "DELETE", credentials: "include" });
      if (panel.mode === "edit" && panel.platformType === platform.platformType) {
        dirtyCheckRef.current = { isDirty: () => false };
        setPanel({ mode: "empty" });
      }
      void fetchPlatforms();
    } catch {
      setError("Failed to delete");
    } finally {
      setDeleteConfirmPlatform(null);
    }
  };

  const handleAddPlatform = (type: string): void => {
    setPopoverOpen(false);
    // Start OAuth flow
    if (type === "youtube") {
      void startOAuth("youtube");
    } else if (type === "facebook-page") {
      void startOAuth("facebook", "page");
    } else if (type === "facebook-profile") {
      void startOAuth("facebook", "profile");
    }
  };

  const startOAuth = async (platformType: string, target?: string): Promise<void> => {
    setError("");
    try {
      const res = await fetch(`/api/admin/platforms/${platformType}/oauth-start`, {
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

  const handleSelectPlatform = (platform: PlatformConfig): void => {
    navigatePanel({ mode: "edit", platformType: platform.platformType });
  };

  const selectedPlatform = panel.mode === "edit" ? (platforms.find((p) => p.platformType === panel.platformType) ?? null) : null;

  // Determine which add options are available (can't add duplicates)
  const hasYouTube = platforms.some((p) => p.platformType === "youtube");
  const hasFacebook = platforms.some((p) => p.platformType === "facebook");

  if (loading) {
    return (
      <IonPage>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonContent className="ion-padding">
        <h2 className="admin-page-title">Streaming Platforms</h2>

        {error && <p className="text-danger text-secondary text-center margin-bottom-wide">{error}</p>}

        <div className="device-management-layout">
          {/* Left panel — platform list */}
          <div className="device-management-list-panel">
            <div className="position-relative">
              <IonButton expand="block" style={{ minHeight: "3rem" }} onClick={() => setPopoverOpen((prev) => !prev)}>
                <IonIcon icon={addOutline} slot="start" />
                Add Connection
              </IonButton>

              {popoverOpen && (
                <div className="add-device-dropdown surface-raised">
                  <button
                    className="button-unstyled add-device-dropdown-option"
                    type="button"
                    disabled={hasYouTube}
                    onClick={() => !hasYouTube && handleAddPlatform("youtube")}
                  >
                    <span style={{ flex: 1 }}>YouTube</span>
                    {hasYouTube && (
                      <span className="text-muted" style={{ fontStyle: "italic" }}>
                        Already Added
                      </span>
                    )}
                  </button>
                  <button
                    className="button-unstyled add-device-dropdown-option"
                    type="button"
                    disabled={hasFacebook}
                    onClick={() => !hasFacebook && handleAddPlatform("facebook-page")}
                  >
                    <span style={{ flex: 1 }}>Facebook Page</span>
                    {hasFacebook && (
                      <span className="text-muted" style={{ fontStyle: "italic" }}>
                        Already Added
                      </span>
                    )}
                  </button>
                  <button
                    className="button-unstyled add-device-dropdown-option"
                    type="button"
                    disabled={hasFacebook}
                    onClick={() => !hasFacebook && handleAddPlatform("facebook-profile")}
                  >
                    <span style={{ flex: 1 }}>Facebook Profile</span>
                    {hasFacebook && (
                      <span className="text-muted" style={{ fontStyle: "italic" }}>
                        Already Added
                      </span>
                    )}
                  </button>
                </div>
              )}
            </div>

            <div className="device-list-scroll">
              {platforms.map((platform) => (
                <div
                  key={platform.platformType}
                  className={`device-list-item surface ${panel.mode === "edit" && panel.platformType === platform.platformType ? "device-list-item-selected" : ""}`}
                  onClick={() => handleSelectPlatform(platform)}
                  onKeyDown={(e) => e.key === "Enter" && handleSelectPlatform(platform)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="fill-remaining">
                    <div className="text-bold">{PRETTY_NAMES[platform.platformType] ?? platform.platformType}</div>
                    <div className="text-muted text-caption text-ellipsis">{getSubtitle(platform)}</div>
                  </div>
                  <IonButton
                    size="small"
                    fill="clear"
                    color="danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmPlatform(platform);
                    }}
                  >
                    Disconnect
                  </IonButton>
                </div>
              ))}
              {platforms.length === 0 && <p className="text-muted text-center">No platforms configured</p>}
            </div>
          </div>

          {/* Right panel — detail */}
          <div className="device-management-detail-panel surface">
            {panel.mode === "empty" && (
              <div className="layout-centered full-height">
                <p className="text-muted">Select a platform or add a new connection</p>
              </div>
            )}
            {panel.mode === "edit" && selectedPlatform?.platformType === "youtube" && (
              <YouTubePlatformDetail
                key={selectedPlatform.id}
                config={selectedPlatform}
                onSaved={handleSaved}
                onDisconnected={handleDisconnected}
                registerDirtyCheck={registerDirtyCheck}
              />
            )}
            {panel.mode === "edit" && selectedPlatform?.platformType === "facebook" && (
              <FacebookPlatformDetail
                key={selectedPlatform.id}
                config={selectedPlatform}
                onSaved={handleSaved}
                onRefresh={fetchPlatforms}
                onDisconnected={handleDisconnected}
                registerDirtyCheck={registerDirtyCheck}
              />
            )}
          </div>
        </div>

        {/* Unsaved changes confirmation */}
        <ConfirmationModal
          isOpen={pendingNavigation !== null}
          title="Unsaved Changes"
          body="You have unsaved changes. Are you sure you want to leave?"
          confirmLabel="Discard"
          cancelLabel="Stay"
          confirmVariant="danger"
          onConfirm={confirmNavigation}
          onCancel={cancelNavigation}
        />

        {/* Disconnect confirmation */}
        <ConfirmationModal
          isOpen={deleteConfirmPlatform !== null}
          title="Disconnect Platform"
          body={`Disconnect ${PRETTY_NAMES[deleteConfirmPlatform?.platformType ?? ""] ?? "this platform"}? Active streams will be affected.`}
          confirmLabel="Disconnect"
          cancelLabel="Cancel"
          confirmVariant="danger"
          onConfirm={() => deleteConfirmPlatform && void handleDelete(deleteConfirmPlatform)}
          onCancel={() => setDeleteConfirmPlatform(null)}
        />
      </IonContent>
    </IonPage>
  );
}
