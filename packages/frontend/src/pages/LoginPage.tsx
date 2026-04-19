import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonCheckbox, IonLabel, IonItem, IonText } from "@ionic/react";
import { useHistory } from "react-router-dom";
import { useStore } from "../store";
import type { AuthUser } from "../types";

export function LoginPage(): ReactNode {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const history = useHistory();

  const handleSubmit = async (): Promise<void> => {
    setError("");
    setPending(true);
    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const data = (await response.json()) as { user?: AuthUser; message?: string };
      if (!response.ok) {
        setError(data.message ?? "Login failed");
        return;
      }
      if (data.user) {
        useStore.getState().setUser(data.user);
        if (data.user.requiresPasswordChange) {
          history.replace("/change-password");
        } else {
          history.replace("/dashboards");
        }
      }
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  };

  return (
    <IonPage data-testid="login-page">
      <IonContent className="ion-padding">
        <form
          data-testid="login-form"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
        >
          <IonItem>
            <IonInput
              data-testid="login-username"
              label="Username"
              labelPlacement="stacked"
              value={username}
              onIonInput={(e) => setUsername(e.detail.value ?? "")}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonInput
              data-testid="login-password"
              label="Password"
              labelPlacement="stacked"
              type="password"
              value={password}
              onIonInput={(e) => setPassword(e.detail.value ?? "")}
              clearInput
            />
          </IonItem>
          <IonItem>
            <IonCheckbox data-testid="login-remember" checked={rememberMe} onIonChange={(e) => setRememberMe(e.detail.checked)} />
            <IonLabel>Remember Me</IonLabel>
          </IonItem>
          {error && (
            <IonText color="danger" data-testid="login-error">
              <p>{error}</p>
            </IonText>
          )}
          <IonButton data-testid="login-submit" expand="block" type="submit" disabled={pending}>
            {pending ? "Logging in…" : "Log In"}
          </IonButton>
        </form>
      </IonContent>
    </IonPage>
  );
}
