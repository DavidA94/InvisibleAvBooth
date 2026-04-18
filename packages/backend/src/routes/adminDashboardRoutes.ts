import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import { logger } from "../logger.js";

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

function parseDashboard(row: DashboardRow): Omit<DashboardRow, "allowedRoles"> & { allowedRoles: string[] } {
  return { ...row, allowedRoles: JSON.parse(row.allowedRoles) as string[] };
}

export function createAdminDashboardRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /admin/dashboards
  // Authentication is applied at mount time in src/index.ts so request.jwtPayload
  // is already present for all routes in this router.
  router.get("/", adminOnly, (_request: Request, response: Response): void => {
    const rows = database.prepare("SELECT * FROM dashboards ORDER BY createdAt").all() as DashboardRow[];
    response.json(rows.map(parseDashboard));
  });

  // POST /admin/dashboards
  router.post("/", adminOnly, (request: Request, response: Response): void => {
    const {
      name,
      description = "",
      allowedRoles = [],
    } = request.body as {
      name?: string;
      description?: string;
      allowedRoles?: string[];
    };
    if (!name) {
      response.status(400).json({ error: "name is required" });
      return;
    }
    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();
    database
      .prepare("INSERT INTO dashboards (id, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?)")
      .run(id, name, description, JSON.stringify(allowedRoles), createdAt);
    logger.info("Dashboard created", { userId: request.jwtPayload!.sub, context: { dashboardId: id } });
    response.status(201).json(parseDashboard(database.prepare("SELECT * FROM dashboards WHERE id = ?").get(id) as DashboardRow));
  });

  // GET /admin/dashboards/:id
  router.get("/:id", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(request.params["id"]) as DashboardRow | undefined;
    if (!row) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    response.json(parseDashboard(row));
  });

  // PUT /admin/dashboards/:id
  router.put("/:id", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(request.params["id"]) as DashboardRow | undefined;
    if (!row) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const { name, description, allowedRoles } = request.body as { name?: string; description?: string; allowedRoles?: string[] };
    database
      .prepare("UPDATE dashboards SET name=?, description=?, allowedRoles=? WHERE id=?")
      .run(name ?? row.name, description ?? row.description, JSON.stringify(allowedRoles ?? (JSON.parse(row.allowedRoles) as string[])), row.id);
    response.json(parseDashboard(database.prepare("SELECT * FROM dashboards WHERE id = ?").get(row.id) as DashboardRow));
  });

  // DELETE /admin/dashboards/:id
  router.delete("/:id", adminOnly, (request: Request, response: Response): void => {
    if (!database.prepare("SELECT id FROM dashboards WHERE id = ?").get(request.params["id"])) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    database.prepare("DELETE FROM dashboards WHERE id = ?").run(request.params["id"]);
    response.status(204).send();
  });

  // GET /admin/dashboards/:id/widgets
  router.get("/:id/widgets", adminOnly, (request: Request, response: Response): void => {
    if (!database.prepare("SELECT id FROM dashboards WHERE id = ?").get(request.params["id"])) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    response.json(database.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ? ORDER BY row, col").all(request.params["id"]));
  });

  // POST /admin/dashboards/:id/widgets
  router.post("/:id/widgets", adminOnly, (request: Request, response: Response): void => {
    if (!database.prepare("SELECT id FROM dashboards WHERE id = ?").get(request.params["id"])) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const {
      widgetId,
      title,
      col,
      row,
      colSpan,
      rowSpan,
      roleMinimum = "AvVolunteer",
    } = request.body as {
      widgetId?: string;
      title?: string;
      col?: number;
      row?: number;
      colSpan?: number;
      rowSpan?: number;
      roleMinimum?: string;
    };

    // eslint-disable-next-line eqeqeq -- == checks for null and undefined, but not zero
    if (!widgetId || !title || col == null || row == null || colSpan == null || rowSpan == null) {
      response.status(400).json({ error: "widgetId, title, col, row, colSpan, rowSpan are required" });
      return;
    }
    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();
    try {
      database
        .prepare(
          "INSERT INTO widget_configurations (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run(id, request.params["id"], widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt);
    } catch {
      response.status(409).json({ error: "widgetId already exists in this dashboard" });
      return;
    }
    response.status(201).json(database.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(id));
  });

  // GET /admin/dashboards/:id/widgets/:widgetId
  router.get("/:id/widgets/:widgetId", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(request.params["widgetId"]) as WidgetRow | undefined;
    if (!row || row.dashboardId !== request.params["id"]) {
      response.status(404).json({ error: "Widget not found" });
      return;
    }
    response.json(row);
  });

  // PUT /admin/dashboards/:id/widgets/:widgetId
  router.put("/:id/widgets/:widgetId", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(request.params["widgetId"]) as WidgetRow | undefined;
    if (!row || row.dashboardId !== request.params["id"]) {
      response.status(404).json({ error: "Widget not found" });
      return;
    }
    const { title, col, row: r, colSpan, rowSpan, roleMinimum } = request.body as Partial<WidgetRow>;
    database
      .prepare("UPDATE widget_configurations SET title=?, col=?, row=?, colSpan=?, rowSpan=?, roleMinimum=? WHERE id=?")
      .run(title ?? row.title, col ?? row.col, r ?? row.row, colSpan ?? row.colSpan, rowSpan ?? row.rowSpan, roleMinimum ?? row.roleMinimum, row.id);
    response.json(database.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(row.id));
  });

  // DELETE /admin/dashboards/:id/widgets/:widgetId
  router.delete("/:id/widgets/:widgetId", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(request.params["widgetId"]) as WidgetRow | undefined;
    if (!row || row.dashboardId !== request.params["id"]) {
      response.status(404).json({ error: "Widget not found" });
      return;
    }
    database.prepare("DELETE FROM widget_configurations WHERE id = ?").run(row.id);
    response.status(204).send();
  });

  return router;
}
