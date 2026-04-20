import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useStore } from "../store";

export function ChangePasswordPage(): ReactNode {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const history = useHistory();
  const user = useStore((s) => s.user);

  const handleSubmit = async (): Promise<void> => {
    setError("");
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (!user) return;
    setPending(true);
    try {
      const response = await fetch("/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ newPassword }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setError(data.message ?? "Failed to change password");
        return;
      }
      useStore.getState().setUser({ ...user, requiresPasswordChange: false });
      history.replace("/dashboards");
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };

  return (
    <IonPage data-testid="change-password-page">
      <IonContent className="ion-padding">
        <div style={{ maxWidth: "22rem", margin: "3rem auto 0" }}>
          <form
            data-testid="change-password-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            <IonInput
              data-testid="new-password-input"
              name="new-password"
              autocomplete="new-password"
              label="New Password"
              labelPlacement="stacked"
              type="password"
              value={newPassword}
              onIonInput={(e) => setNewPassword(e.detail.value ?? "")}
              fill="outline"
            />
            <IonInput
              data-testid="confirm-password-input"
              name="confirm-password"
              autocomplete="new-password"
              label="Confirm Password"
              labelPlacement="stacked"
              type="password"
              value={confirmPassword}
              onIonInput={(e) => setConfirmPassword(e.detail.value ?? "")}
              fill="outline"
            />
            {error && (
              <IonText color="danger" data-testid="change-password-error">
                <p style={{ margin: 0, fontSize: "0.875rem" }}>{error}</p>
              </IonText>
            )}
            <div style={{ display: "flex", justifyContent: "center", marginTop: "0.5rem" }}>
              <IonButton data-testid="change-password-submit" type="submit" disabled={pending} style={{ minHeight: "2.75rem", minWidth: "10rem" }}>
                {pending ? "Changing…" : "Change Password"}
              </IonButton>
            </div>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
