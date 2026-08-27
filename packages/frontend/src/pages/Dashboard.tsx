import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { IonPage, IonContent, IonSpinner } from "@ionic/react";
import { useNavigate, useParams } from "react-router";
import type { GridManifest, GridCell, Role } from "../types";
import { useStore } from "../store";
import { renderWidget } from "../components/widgetRenderer";
import { TEST_ID_DASHBOARD_GRID, TEST_ID_DASHBOARD_LOADING, TEST_ID_DASHBOARD_REFRESHING } from "../constants/testIds";
import {
  GRID_DIMENSIONS,
  GRID_CELL_SIZE_REM,
  GRID_GAP_SIZE_REM,
  computeGridHeightRem,
  BREAKPOINT_LARGE_LANDSCAPE,
  BREAKPOINT_LARGE_PORTRAIT,
  MIN_SCALE_FLOOR,
} from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";

// ── Grid type selection based on viewport ─────────────────────────────────────

function computeGridType(): GridType {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const isLandscape = width > height;
  const isLarge = isLandscape ? width >= BREAKPOINT_LARGE_LANDSCAPE : width >= BREAKPOINT_LARGE_PORTRAIT;

  if (isLarge && isLandscape) return "large-landscape";
  if (isLarge && !isLandscape) return "large-portrait";
  if (!isLarge && isLandscape) return "small-landscape";
  return "small-portrait";
}

function useGridType(): GridType {
  const [gridType, setGridType] = useState<GridType>(computeGridType());

  useEffect(() => {
    const handler = (): void => setGridType(computeGridType());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return gridType;
}

// ── Viewport scaling ──────────────────────────────────────────────────────────

const BASE_FONT_SIZE = 16;

/**
 * Scales the entire page by setting a CSS custom property that the
 * `html:has(.dashboard-page)` rule reads for font-size.
 *
 * The CSS `:has()` selector ensures scaling only applies when the dashboard
 * component is mounted. When navigating to admin pages (no `.dashboard-page`
 * in DOM), the rule doesn't match and html falls back to 16px automatically.
 *
 * The hook still removes the property on unmount as a safety measure,
 * but even if that fails, the :has() rule stops matching.
 */
function useGridScale(gridType: GridType): void {
  useEffect(() => {
    const gridDimensions = GRID_DIMENSIONS[gridType];
    const nativeWidth = gridDimensions.totalWidthRem * BASE_FONT_SIZE;
    const nativeHeight = computeGridHeightRem(gridDimensions.defaultRows) * BASE_FONT_SIZE;

    const computeScale = (): void => {
      const factor = Math.min(window.innerWidth / nativeWidth, window.innerHeight / nativeHeight, 1.0);
      const clamped = Math.max(factor, MIN_SCALE_FLOOR);
      document.documentElement.style.setProperty("--dashboard-scale-font-size", `${BASE_FONT_SIZE * clamped}px`);
    };

    computeScale();
    window.addEventListener("resize", computeScale);

    return () => {
      document.documentElement.style.removeProperty("--dashboard-scale-font-size");
      window.removeEventListener("resize", computeScale);
    };
  }, [gridType]);
}

// ── Cache validation ──────────────────────────────────────────────────────────

function isValidGridManifest(data: unknown): data is GridManifest {
  return typeof data === "object" && data !== null && "grids" in data && typeof (data as Record<string, unknown>).grids === "object";
}

/**
 * Normalizes API responses to the new GridManifest format.
 * During the transition period, the API may still return the old
 * { version: 1, cells: [] } format. This converts it to the new format
 * by placing all cells into the large-landscape grid.
 */
function normalizeManifest(raw: unknown): GridManifest | null {
  if (isValidGridManifest(raw)) return raw;

  // Handle old format: { version: 1, cells: [...] }
  if (typeof raw === "object" && raw !== null && "version" in raw && "cells" in raw) {
    const legacy = raw as { version: number; cells: GridCell[] };
    if (legacy.version !== 1) return null;
    return {
      grids: {
        "large-landscape": legacy.cells,
        "large-portrait": legacy.cells,
        "small-landscape": legacy.cells,
        "small-portrait": legacy.cells,
      },
    };
  }

  return null;
}

// ── Structural change detection ───────────────────────────────────────────────

function isStructuralChange(cached: GridCell[], fresh: GridCell[]): boolean {
  if (cached.length !== fresh.length) return true;
  const key = (c: GridCell): string => `${c.widgetId}:${c.col}:${c.row}:${c.colSpan}:${c.rowSpan}`;
  const cachedKeys = new Set(cached.map(key));
  return fresh.some((c) => !cachedKeys.has(key(c)));
}

// ── Default fallback manifest ─────────────────────────────────────────────────

const DEFAULT_GRID_MANIFEST: GridManifest = {
  grids: {
    "large-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "large-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "small-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "small-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
  },
};

// ── Dashboard component ───────────────────────────────────────────────────────

export function Dashboard(): ReactNode {
  const [manifest, setManifest] = useState<GridManifest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();
  const { slug } = useParams<{ slug: string }>();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const userRole = useStore((s) => s.user?.role) as Role | undefined;
  const gridType = useGridType();

  useGridScale(gridType);

  useEffect(() => {
    if (!slug) {
      navigateRef.current("/dashboards", { replace: true });
      return;
    }

    // Load cached manifest from localStorage
    let cached: GridManifest | null = null;
    try {
      const raw = localStorage.getItem(`dashboardLayout:${slug}`);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isValidGridManifest(parsed)) {
          cached = parsed;
        } else {
          // Old format or corrupted — discard
          localStorage.removeItem(`dashboardLayout:${slug}`);
        }
      }
    } catch {
      localStorage.removeItem(`dashboardLayout:${slug}`);
    }
    if (cached) setManifest(cached);

    const fetchLayout = async (): Promise<void> => {
      try {
        const response = await fetch(`/api/dashboards/${slug}/layout`, { credentials: "include" });
        if (!response.ok) {
          if (response.status === 404 || response.status === 403) {
            navigateRef.current("/dashboards", { replace: true });
            return;
          }
          if (!cached) setManifest(DEFAULT_GRID_MANIFEST);
          return;
        }
        const rawJson: unknown = await response.json();
        const fresh = normalizeManifest(rawJson);
        if (!fresh) {
          if (!cached) setManifest(DEFAULT_GRID_MANIFEST);
          return;
        }
        localStorage.setItem(`dashboardLayout:${slug}`, JSON.stringify(fresh));

        const freshCells = fresh.grids[gridType] ?? [];
        const cachedCells = cached?.grids[gridType] ?? [];
        if (cached && isStructuralChange(cachedCells, freshCells)) {
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
  }, [slug, gridType]);

  if (!manifest) {
    return (
      <IonPage>
        <IonContent className="ion-padding ion-text-center">
          <div data-testid={TEST_ID_DASHBOARD_LOADING}>
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
          <div data-testid={TEST_ID_DASHBOARD_REFRESHING}>
            <IonSpinner />
            <p>Refreshing Dashboard</p>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  const ROLE_LEVEL: Record<Role, number> = { ADMIN: 3, AvPowerUser: 2, AvVolunteer: 1 };
  const userLevel = userRole ? ROLE_LEVEL[userRole] : 0;
  const cells = manifest.grids[gridType] ?? [];
  const visibleCells = cells.filter((c) => userLevel >= ROLE_LEVEL[c.roleMinimum]);

  const gridDimensions = GRID_DIMENSIONS[gridType];
  const actualRows = visibleCells.length > 0 ? Math.max(...visibleCells.map((cell) => cell.row + cell.rowSpan)) : 1;

  return (
    <IonPage>
      <IonContent>
        <div
          data-testid={TEST_ID_DASHBOARD_GRID}
          className="dashboard-page dashboard-grid"
          style={{
            width: `${gridDimensions.totalWidthRem}rem`,
            gridTemplateColumns: `repeat(${gridDimensions.columns}, ${GRID_CELL_SIZE_REM}rem)`,
            gridTemplateRows: `repeat(${actualRows}, ${GRID_CELL_SIZE_REM}rem)`,
            gap: `${GRID_GAP_SIZE_REM}rem`,
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
              {renderWidget(cell)}
            </div>
          ))}
        </div>
      </IonContent>
    </IonPage>
  );
}
