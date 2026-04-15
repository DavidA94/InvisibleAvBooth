import { Router } from "express";
import type { Request, Response } from "express";
import type { Database } from "better-sqlite3";
import type { AuthService, Role } from "../services/authService.js";
import { authenticate } from "../middleware/auth.js";

interface DashboardRow {
  id: string;
  name: string;
  description: string;
  allowedRoles: string;
  createdAt: string;
}

interface WidgetRow {
  id: string;
  dashboardId: string;
  widgetId: string;
  title: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  roleMinimum: string;
  createdAt: string;
}

export function createDashboardRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);

  // GET /api/dashboards — returns dashboards accessible to the authenticated user's role.
  // ADMIN sees all dashboards; other roles see only dashboards where their role is in allowedRoles.
  router.get("/", auth, (request: Request, response: Response): void => {
    const { role } = request.jwtPayload!;
    const rows = database.prepare("SELECT * FROM dashboards ORDER BY createdAt").all() as DashboardRow[];

    const accessible = rows.filter((r) => {
      if (role === "ADMIN") return true;
      const allowed = JSON.parse(r.allowedRoles) as Role[];
      return allowed.includes(role);
    });

    response.json(
      accessible.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        allowedRoles: JSON.parse(r.allowedRoles) as Role[],
      })),
    );
  });

  // GET /api/dashboards/:id/layout — returns the GridManifest for a dashboard.
  router.get("/:id/layout", auth, (request: Request, response: Response): void => {
    const dashboard = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(request.params["id"]) as DashboardRow | undefined;
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

    const widgets = database.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ? ORDER BY row, col").all(request.params["id"]) as WidgetRow[];

    response.json({
      version: 1,
      cells: widgets.map((w) => ({
        widgetId: w.widgetId,
        title: w.title,
        col: w.col,
        row: w.row,
        colSpan: w.colSpan,
        rowSpan: w.rowSpan,
        roleMinimum: w.roleMinimum,
      })),
    });
  });

  return router;
}
