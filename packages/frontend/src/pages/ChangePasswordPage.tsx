import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonText } from "@ionic/react";
import { useNavigate } from "react-router";
import { useStore } from "../store";
import {
  TEST_ID_CHANGE_PASSWORD_PAGE, TEST_ID_CHANGE_PASSWORD_FORM, TEST_ID_NEW_PASSWORD_INPUT,
  TEST_ID_CONFIRM_PASSWORD_INPUT, TEST_ID_CHANGE_PASSWORD_SUBMIT, TEST_ID_CHANGE_PASSWORD_ERROR,
} from "../constants/testIds";

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
      sessionStorage.setItem("initialAuth", "true");
      navigate("/dashboards", { replace: true });
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };

  return (
    <IonPage data-testid={TEST_ID_CHANGE_PASSWORD_PAGE}>
      <IonContent className="ion-padding">
        <div className="form-container">
          <form
            data-testid={TEST_ID_CHANGE_PASSWORD_FORM}
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="form-layout"
          >
            <IonInput
              data-testid={TEST_ID_NEW_PASSWORD_INPUT}
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
              data-testid={TEST_ID_CONFIRM_PASSWORD_INPUT}
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
              <IonText color="danger" data-testid={TEST_ID_CHANGE_PASSWORD_ERROR}>
                <p className="margin-none text-secondary">{error}</p>
              </IonText>
            )}
            <div className="form-actions">
              <IonButton data-testid={TEST_ID_CHANGE_PASSWORD_SUBMIT} type="submit" disabled={pending} className="button-touch-target">
                {pending ? "Changing…" : "Change Password"}
              </IonButton>
            </div>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
