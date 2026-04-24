import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText } from "@ionic/react";
import { useNavigate } from "react-router";
import { useStore } from "../store";

export function ChangePasswordPage(): ReactNode {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
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
      const response = await fetch("/api/auth/change-password", {
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
      navigate("/dashboards", { replace: true, state: { initialAuth: true } });
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };

  return (
    <IonPage data-testid="change-password-page">
      <IonContent className="ion-padding">
        <div className="form-container">
          <form
            data-testid="change-password-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="form-layout"
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
                <p className="margin-none text-secondary">{error}</p>
              </IonText>
            )}
            <div className="form-actions">
              <IonButton data-testid="change-password-submit" type="submit" disabled={pending} className="button-touch-target">
                {pending ? "Changing…" : "Change Password"}
              </IonButton>
            </div>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
