import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { authenticate, requireRole } from "../middleware/auth.js";
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

export function createAdminDashboardRouter(db: Database, authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /admin/dashboards
  router.get("/", auth, adminOnly, (_req: Request, res: Response): void => {
    const rows = db.prepare("SELECT * FROM dashboards ORDER BY createdAt").all() as DashboardRow[];
    res.json(rows.map(parseDashboard));
  });

  // POST /admin/dashboards
  router.post("/", auth, adminOnly, (req: Request, res: Response): void => {
    const {
      name,
      description = "",
      allowedRoles = [],
    } = req.body as {
      name?: string;
      description?: string;
      allowedRoles?: string[];
    };
    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();
    db.prepare("INSERT INTO dashboards (id, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?)").run(
      id,
      name,
      description,
      JSON.stringify(allowedRoles),
      createdAt,
    );
    logger.info("Dashboard created", { userId: req.jwtPayload!.sub, context: { dashboardId: id } });
    res.status(201).json(parseDashboard(db.prepare("SELECT * FROM dashboards WHERE id = ?").get(id) as DashboardRow));
  });

  // GET /admin/dashboards/:id
  router.get("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(req.params["id"]) as DashboardRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    res.json(parseDashboard(row));
  });

  // PUT /admin/dashboards/:id
  router.put("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM dashboards WHERE id = ?").get(req.params["id"]) as DashboardRow | undefined;
    if (!row) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const { name, description, allowedRoles } = req.body as { name?: string; description?: string; allowedRoles?: string[] };
    db.prepare("UPDATE dashboards SET name=?, description=?, allowedRoles=? WHERE id=?").run(
      name ?? row.name,
      description ?? row.description,
      JSON.stringify(allowedRoles ?? (JSON.parse(row.allowedRoles) as string[])),
      row.id,
    );
    res.json(parseDashboard(db.prepare("SELECT * FROM dashboards WHERE id = ?").get(row.id) as DashboardRow));
  });

  // DELETE /admin/dashboards/:id
  router.delete("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    if (!db.prepare("SELECT id FROM dashboards WHERE id = ?").get(req.params["id"])) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    db.prepare("DELETE FROM dashboards WHERE id = ?").run(req.params["id"]);
    res.status(204).send();
  });

  // GET /admin/dashboards/:id/widgets
  router.get("/:id/widgets", auth, adminOnly, (req: Request, res: Response): void => {
    if (!db.prepare("SELECT id FROM dashboards WHERE id = ?").get(req.params["id"])) {
      res.status(404).json({ error: "Dashboard not found" });
      return;
    }
    res.json(db.prepare("SELECT * FROM widget_configurations WHERE dashboardId = ? ORDER BY row, col").all(req.params["id"]));
  });

  // POST /admin/dashboards/:id/widgets
  router.post("/:id/widgets", auth, adminOnly, (req: Request, res: Response): void => {
    if (!db.prepare("SELECT id FROM dashboards WHERE id = ?").get(req.params["id"])) {
      res.status(404).json({ error: "Dashboard not found" });
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
    } = req.body as {
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
      res.status(400).json({ error: "widgetId, title, col, row, colSpan, rowSpan are required" });
      return;
    }
    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();
    try {
      db.prepare(
        "INSERT INTO widget_configurations (id, dashboardId, widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(id, req.params["id"], widgetId, title, col, row, colSpan, rowSpan, roleMinimum, createdAt);
    } catch {
      res.status(409).json({ error: "widgetId already exists in this dashboard" });
      return;
    }
    res.status(201).json(db.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(id));
  });

  // GET /admin/dashboards/:id/widgets/:widgetId
  router.get("/:id/widgets/:widgetId", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(req.params["widgetId"]) as WidgetRow | undefined;
    if (!row || row.dashboardId !== req.params["id"]) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }
    res.json(row);
  });

  // PUT /admin/dashboards/:id/widgets/:widgetId
  router.put("/:id/widgets/:widgetId", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(req.params["widgetId"]) as WidgetRow | undefined;
    if (!row || row.dashboardId !== req.params["id"]) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }
    const { title, col, row: r, colSpan, rowSpan, roleMinimum } = req.body as Partial<WidgetRow>;
    db.prepare("UPDATE widget_configurations SET title=?, col=?, row=?, colSpan=?, rowSpan=?, roleMinimum=? WHERE id=?").run(
      title ?? row.title,
      col ?? row.col,
      r ?? row.row,
      colSpan ?? row.colSpan,
      rowSpan ?? row.rowSpan,
      roleMinimum ?? row.roleMinimum,
      row.id,
    );
    res.json(db.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(row.id));
  });

  // DELETE /admin/dashboards/:id/widgets/:widgetId
  router.delete("/:id/widgets/:widgetId", auth, adminOnly, (req: Request, res: Response): void => {
    const row = db.prepare("SELECT * FROM widget_configurations WHERE id = ?").get(req.params["widgetId"]) as WidgetRow | undefined;
    if (!row || row.dashboardId !== req.params["id"]) {
      res.status(404).json({ error: "Widget not found" });
      return;
    }
    db.prepare("DELETE FROM widget_configurations WHERE id = ?").run(row.id);
    res.status(204).send();
  });

  return router;
}
