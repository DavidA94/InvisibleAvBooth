import { useState } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonInput, IonButton, IonCheckbox, IonText } from "@ionic/react";
import { useNavigate, Navigate } from "react-router";
import { useStore } from "../store";
import type { AuthUser } from "../types";

export function LoginPage(): ReactNode {
  const [username, setUsername] = useState(() => localStorage.getItem("lastUsername") ?? "");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();
  const existingUser = useStore((s) => s.user);

  // Already authenticated — skip login
  if (existingUser) {
    return <Navigate to="/dashboards" replace />;
  }

  const handleSubmit = async (): Promise<void> => {
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/auth/login", {
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
          navigate("/change-password", { replace: true });
        } else {
          sessionStorage.setItem("initialAuth", "true");
          navigate("/dashboards", { replace: true });
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
        <div className="form-container">
          <form
            data-testid="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              void handleSubmit();
            }}
            className="form-layout"
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
            <label className="remember-me-label">
              <IonCheckbox
                data-testid="login-remember"
                checked={rememberMe}
                onIonChange={(e) => setRememberMe(e.detail.checked)}
                className="checkbox-touch-target"
              />
              Remember Me
            </label>
            {error && (
              <IonText color="danger" data-testid="login-error">
                <p className="margin-none text-secondary">{error}</p>
              </IonText>
            )}
            <div className="form-actions">
              <IonButton data-testid="login-submit" type="submit" disabled={pending} className="button-touch-target">
                {pending ? "Logging in…" : "Log In"}
              </IonButton>
            </div>
          </form>
        </div>
      </IonContent>
    </IonPage>
  );
}
