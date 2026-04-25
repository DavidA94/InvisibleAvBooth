import { apiFetch } from "../api/client";
import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonSpinner } from "@ionic/react";
import { useNavigate, useParams } from "react-router";
import type { GridManifest, GridCell, Role } from "../types";
import { useStore } from "../store";
import { ObsWidget } from "../components/obs/ObsWidget";

function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(window.innerHeight > window.innerWidth);
  useEffect(() => {
    const handler = (): void => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return portrait;
}

const DEFAULT_GRID_MANIFEST: GridManifest = {
  version: 1,
  cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
};

function isStructuralChange(cached: GridCell[], fresh: GridCell[]): boolean {
  if (cached.length !== fresh.length) return true;
  const key = (c: GridCell): string => `${c.widgetId}:${c.col}:${c.row}:${c.colSpan}:${c.rowSpan}`;
  const cachedKeys = new Set(cached.map(key));
  return fresh.some((c) => !cachedKeys.has(key(c)));
}

function WidgetPlaceholder({ cell }: { cell: GridCell }): ReactNode {
  if (cell.widgetId === "obs") {
    return <ObsWidget />;
  }
  return (
    <div data-testid={`widget-${cell.widgetId}`} className="surface layout-centered full-height">
      {cell.title}
    </div>
  );
}

export function Dashboard(): ReactNode {
  const [manifest, setManifest] = useState<GridManifest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { id: dashboardId } = useParams<{ id: string }>();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userRole = useStore((s) => s.user?.role) as Role | undefined;
  const portrait = useIsPortrait();

  useEffect(() => {
    if (!dashboardId) {
      navigateRef.current("/dashboards", { replace: true });
      return;
    }

    // Load cached manifest from localStorage
    let cached: GridManifest | null = null;
    try {
      const raw = localStorage.getItem(`dashboardLayout:${dashboardId}`);
      if (raw) cached = JSON.parse(raw) as GridManifest;
    } catch {
      // Unparseable — ignore
    }
    if (cached) setManifest(cached);

    const fetchLayout = async (): Promise<void> => {
      try {
        const response = await apiFetch(`/api/dashboards/${dashboardId}/layout`);
        if (!response.ok) {
          if (response.status === 404 || response.status === 403) {
            navigateRef.current("/dashboards", { replace: true });
            return;
          }
          if (!cached) setManifest(DEFAULT_GRID_MANIFEST);
          return;
        }
        const fresh = (await response.json()) as GridManifest;
        if (fresh.version !== 1) {
          if (!cached) setManifest(DEFAULT_GRID_MANIFEST);
          return;
        }
        localStorage.setItem(`dashboardLayout:${dashboardId}`, JSON.stringify(fresh));
        if (cached && isStructuralChange(cached.cells, fresh.cells)) {
          setRefreshing(true);
          setTimeout(() => {
            setManifest(fresh);
            setRefreshing(false);
          }, 300);
        } else {
          setManifest(fresh);
        }
      } catch {
        if (!cached) setManifest(DEFAULT_GRID_MANIFEST);
      }
    };
    void fetchLayout();
  }, [dashboardId]);

  if (!manifest) {
    return (
      <IonPage>
        <IonContent className="ion-padding ion-text-center">
          <div data-testid="dashboard-loading">
            <IonSpinner />
            <p>Loading Dashboard</p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (refreshing) {
    return (
      <IonPage>
        <IonContent className="ion-padding ion-text-center">
          <div data-testid="dashboard-refreshing">
            <IonSpinner />
            <p>Refreshing Dashboard</p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const ROLE_LEVEL: Record<Role, number> = { ADMIN: 3, AvPowerUser: 2, AvVolunteer: 1 };
  const userLevel = userRole ? ROLE_LEVEL[userRole] : 0;
  const visibleCells = manifest.cells.filter((c) => userLevel >= ROLE_LEVEL[c.roleMinimum]);
  const cols = portrait ? 6 : 10;
  const rows = portrait ? 10 : 6;

  return (
    <IonPage>
      <IonContent>
        <div
          data-testid="dashboard-grid"
          className="dashboard-grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {visibleCells.map((cell) => (
            <div
              key={cell.widgetId}
              style={{
                gridColumn: `${cell.col + 1} / span ${cell.colSpan}`,
                gridRow: `${cell.row + 1} / span ${cell.rowSpan}`,
              }}
            >
              <WidgetPlaceholder cell={cell} />
            </div>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
}
