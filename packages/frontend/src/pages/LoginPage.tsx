import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonCheckbox, IonText } from "@ionic/react";
import { useHistory, Redirect } from "react-router-dom";
import { useStore } from "../store";
import type { AuthUser } from "../types";

export function LoginPage(): ReactNode {
  const [username, setUsername] = useState(() => localStorage.getItem("lastUsername") ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const history = useHistory();
  const existingUser = useStore((s) => s.user);

  // Already authenticated — skip login
  if (existingUser) {
    return <Redirect to="/dashboards" />;
  }

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
      const data = (await response.json()) as { user?: { user: AuthUser; requiresPasswordChange?: boolean }; message?: string };
      if (!response.ok) {
        setError(data.message ?? "Login failed");
        return;
      }
      if (data.user) {
        localStorage.setItem("lastUsername", data.user.user.username);
        const authUser = { ...data.user.user, ...(data.user.requiresPasswordChange ? { requiresPasswordChange: true as const } : {}) };
        useStore.getState().setUser(authUser);
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
        <div
          style={{
            maxWidth: "22rem",
            margin: "3rem auto 0",
          }}
        >
          <form
            data-testid="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <IonInput
              data-testid="login-username"
              name="username"
              autocomplete="username"
              label="Username"
              labelPlacement="stacked"
              value={username}
              onIonInput={(e) => setUsername(e.detail.value ?? "")}
              fill="outline"
            />
            <IonInput
              data-testid="login-password"
              name="password"
              autocomplete="current-password"
              label="Password"
              labelPlacement="stacked"
              type="password"
              value={password}
              onIonInput={(e) => setPassword(e.detail.value ?? "")}
              fill="outline"
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.8125rem",
                color: "var(--color-text-muted)",
                padding: "0.25rem 0",
              }}
            >
              <IonCheckbox
                data-testid="login-remember"
                checked={rememberMe}
                onIonChange={(e) => setRememberMe(e.detail.checked)}
                style={{ minWidth: "1.25rem", minHeight: "1.25rem" }}
              />
              Remember Me
            </label>
            {error && (
              <IonText color="danger" data-testid="login-error">
                <p style={{ margin: 0, fontSize: "0.875rem" }}>{error}</p>
              </IonText>
            )}
            <div style={{ display: "flex", justifyContent: "center", marginTop: "0.5rem" }}>
              <IonButton data-testid="login-submit" type="submit" disabled={pending} style={{ minHeight: "2.75rem", minWidth: "10rem" }}>
                {pending ? "Logging in…" : "Log In"}
              </IonButton>
            </div>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
