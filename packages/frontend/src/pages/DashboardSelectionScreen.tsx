import { useState, useEffect } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonText, IonSpinner } from "@ionic/react";
import { useNavigate } from "react-router";
import { STORAGE_KEY_DASHBOARD_ID, STORAGE_KEY_DASHBOARD_NAME } from "../constants/storageKeys";

interface DashboardSummary {
  id: string;
  name: string;
  description: string;
}

export function DashboardSelectionScreen(): ReactNode {
  const [dashboards, setDashboards] = useState<DashboardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const isInitialAuth = sessionStorage.getItem("initialAuth") === "true";
    sessionStorage.removeItem("initialAuth");

    // Flow 6: cached dashboard ID — go straight to it
    if (isInitialAuth) {
      const cachedId = localStorage.getItem(STORAGE_KEY_DASHBOARD_ID);
      if (cachedId) {
        navigate(`/dashboard/${cachedId}`, { replace: true });
        return;
      }
    }

    const load = async (): Promise<void> => {
      try {
        const response = await fetch("/api/dashboards", { credentials: "include" });
        if (response.ok) {
          const data = (await response.json()) as DashboardSummary[];
          setDashboards(data);
          // Flow 7: exactly one dashboard on initial auth — auto-select
          if (data.length === 1 && isInitialAuth && data[0]) {
            selectDashboard(data[0]);
            return;
          }
        }
      } catch {
        // Fetch failed — show empty state
      } finally {
        setLoading(false);
      }
    };
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectDashboard = (dashboard: DashboardSummary): void => {
    localStorage.setItem(STORAGE_KEY_DASHBOARD_ID, dashboard.id);
    localStorage.setItem(STORAGE_KEY_DASHBOARD_NAME, dashboard.name);
    navigate(`/dashboard/${dashboard.id}`);
  };

  if (loading) {
    return (
      <IonPage>
        <IonContent className="ion-padding ion-text-center">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  if (dashboards.length === 0) {
    return (
      <IonPage data-testid="no-dashboards-screen">
        <IonContent className="ion-padding">
          <div className="centered-page text-center">
            <div>
              <h2>No Dashboards</h2>
              <IonText color="medium">
                <p>Please contact the administrator</p>
              </IonText>
            </div>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage data-testid="dashboard-selection-screen">
      <IonContent className="ion-padding">
        <div className="centered-page">
          <div className="selection-container">
            <h2 className="text-center margin-bottom-spacious">Select Dashboard</h2>
            {dashboards.map((d) => (
              <div
                key={d.id}
                data-testid="dashboard-option"
                role="button"
                tabIndex={0}
                onClick={() => selectDashboard(d)}
                onKeyDown={(e) => e.key === "Enter" && selectDashboard(d)}
                className="dashboard-option"
              >
                <strong>{d.name}</strong>
                <p className="text-muted margin-top-tight margin-none">{d.description}</p>
              </div>
            ))}
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
}
