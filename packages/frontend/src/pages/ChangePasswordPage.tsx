import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText, IonItem } from "@ionic/react";
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
      const response = await fetch(`/admin/users/${user.id}/change-password`, {
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
        <form
          data-testid="change-password-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <IonItem>
            <IonInput
              data-testid="new-password-input"
              label="New Password"
              labelPlacement="stacked"
              type="password"
              value={newPassword}
              onIonInput={(e) => setNewPassword(e.detail.value ?? "")}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonInput
              data-testid="confirm-password-input"
              label="Confirm Password"
              labelPlacement="stacked"
              type="password"
              value={confirmPassword}
              onIonInput={(e) => setConfirmPassword(e.detail.value ?? "")}
              clearInput
            />
          </IonItem>
          {error && (
            <IonText color="danger" data-testid="change-password-error">
              <p>{error}</p>
            </IonText>
          )}
          <IonButton data-testid="change-password-submit" expand="block" type="submit" disabled={pending}>
            {pending ? "Changing…" : "Change Password"}
          </IonButton>
        </form>
      </IonContent>
    </IonPage>
  );
}
