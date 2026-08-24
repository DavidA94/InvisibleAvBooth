import { Router } from "express";
import type { Request, Response } from "express";
import type { Database } from "better-sqlite3";
import type { AuthService, Role } from "../services/authService.js";
import { GRID_TYPES } from "@invisible-av-booth/shared";
import { isDashboardComplete } from "../validation/dashboardValidation.js";
import type { WidgetPlacement } from "../validation/dashboardValidation.js";

interface DashboardRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  allowedRoles: string;
  createdAt: string;
}

interface WidgetRow {
  id: string;
  dashboardId: string;
  widgetId: string;
  gridType: string;
  title: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  roleMinimum: string;
  createdAt: string;
}

const ROLE_LEVEL: Record<Role, number> = { ADMIN: 3, AvPowerUser: 2, AvVolunteer: 1 };

export function createDashboardRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  void authService;

  // GET /api/dashboards — returns dashboards accessible to the authenticated user's role.
  // ADMIN sees all dashboards (including incomplete, with isComplete flag).
  // Other roles see only complete dashboards where their role is in allowedRoles.
  router.get("/", (request: Request, response: Response): void => {
    const { role } = request.jwtPayload!;
    const rows = database.prepare("SELECT * FROM dashboards ORDER BY createdAt").all() as DashboardRow[];

    const results: Array<{ slug: string; name: string; description: string; isComplete?: boolean }> = [];

    for (const row of rows) {
      const allowedRoles = JSON.parse(row.allowedRoles) as Role[];
      const grids = getGridsForDashboard(database, row.id);
      const isComplete = isDashboardComplete({ name: row.name, slug: row.slug, allowedRoles }, grids);

      if (role === "ADMIN") {
        results.push({ slug: row.slug, name: row.name, description: row.description, isComplete });
      } else {
        // Non-admins only see complete dashboards with matching roles
        if (isComplete && allowedRoles.includes(role)) {
          results.push({ slug: row.slug, name: row.name, description: row.description });
        }
      }
    }

    response.json(results);
  });

  // GET /api/dashboards/:slug/layout — returns all four grid layouts for a dashboard.
  router.get("/:slug/layout", (request: Request, response: Response): void => {
    const dashboard = database.prepare("SELECT * FROM dashboards WHERE slug = ?").get(request.params["slug"]) as DashboardRow | undefined;
    if (!dashboard) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }

    // Enforce role access — ADMIN always passes, others check allowedRoles.
    const { role } = request.jwtPayload!;
    if (role !== "ADMIN") {
      const allowed = JSON.parse(dashboard.allowedRoles) as Role[];
      if (!allowed.includes(role)) {
        response.status(403).json({ error: "Forbidden" });
        return;
      }
    }

    const widgets = database.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ? ORDER BY row, col").all(dashboard.id) as WidgetRow[];

    // Build four-grid response with role-based cell filtering
    const userLevel = ROLE_LEVEL[role];
    const grids: Record<
      string,
      Array<{ widgetId: string; title: string; col: number; row: number; colSpan: number; rowSpan: number; roleMinimum: string }>
    > = {};
    for (const gridType of GRID_TYPES) {
      grids[gridType] = [];
    }

    for (const widget of widgets) {
      // Filter cells by roleMinimum for non-admin users
      const widgetLevel = ROLE_LEVEL[widget.roleMinimum as Role] ?? 0;
      if (userLevel >= widgetLevel) {
        if (!grids[widget.gridType]) grids[widget.gridType] = [];
        grids[widget.gridType]!.push({
          widgetId: widget.widgetId,
          title: widget.title,
          col: widget.col,
          row: widget.row,
          colSpan: widget.colSpan,
          rowSpan: widget.rowSpan,
          roleMinimum: widget.roleMinimum,
        });
      }
    }

    response.json({ grids });
  });

  return router;
}

function getGridsForDashboard(database: Database, dashboardId: string): Record<string, WidgetPlacement[]> {
  const widgets = database.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ? ORDER BY row, col").all(dashboardId) as WidgetRow[];
  const grids: Record<string, WidgetPlacement[]> = {};
  for (const gridType of GRID_TYPES) {
    grids[gridType] = [];
  }
  for (const widget of widgets) {
    if (!grids[widget.gridType]) grids[widget.gridType] = [];
    grids[widget.gridType]!.push({
      widgetId: widget.widgetId,
      title: widget.title,
      col: widget.col,
      row: widget.row,
      colSpan: widget.colSpan,
      rowSpan: widget.rowSpan,
      roleMinimum: widget.roleMinimum,
    });
  }
  return grids;
}
