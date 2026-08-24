import { Router } from "express";
import type { Request, Response } from "express";
import { randomBytes } from "crypto";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import { logger } from "../logger.js";
import { GRID_TYPES } from "@invisible-av-booth/shared";
import type { GridType } from "@invisible-av-booth/shared";
import { validateSlug, validateGrids, isDashboardComplete } from "../validation/dashboardValidation.js";
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

function parseDashboard(row: DashboardRow): Omit<DashboardRow, "allowedRoles"> & { allowedRoles: string[] } {
  return { ...row, allowedRoles: JSON.parse(row.allowedRoles) as string[] };
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

function computeIsComplete(row: DashboardRow, grids: Record<string, WidgetPlacement[]>): boolean {
  const parsed = parseDashboard(row);
  return isDashboardComplete({ name: parsed.name, slug: parsed.slug, allowedRoles: parsed.allowedRoles }, grids);
}

export function createAdminDashboardRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /api/admin/dashboards — list all dashboards with isComplete status
  router.get("/", adminOnly, (_request: Request, response: Response): void => {
    const rows = database.prepare("SELECT * FROM dashboards ORDER BY createdAt").all() as DashboardRow[];
    const results = rows.map((row) => {
      const grids = getGridsForDashboard(database, row.id);
      return {
        ...parseDashboard(row),
        isComplete: computeIsComplete(row, grids),
      };
    });
    response.json(results);
  });

  // GET /api/admin/dashboards/:id — full detail with all four grid layouts
  router.get("/:id", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(request.params["id"]) as DashboardRow | undefined;
    if (!row) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    const grids = getGridsForDashboard(database, row.id);
    response.json({
      ...parseDashboard(row),
      isComplete: computeIsComplete(row, grids),
      grids,
    });
  });

  // POST /api/admin/dashboards — create a new dashboard
  router.post("/", adminOnly, (request: Request, response: Response): void => {
    const {
      name,
      slug,
      description = "",
      allowedRoles = [],
      grids,
    } = request.body as {
      name?: string;
      slug?: string;
      description?: string;
      allowedRoles?: string[];
      grids?: Record<string, WidgetPlacement[]>;
    };

    // Validate required fields
    if (!name) {
      response.status(400).json({ error: "name is required" });
      return;
    }
    if (!slug) {
      response.status(400).json({ error: "slug is required" });
      return;
    }

    // Validate slug format
    const slugError = validateSlug(slug);
    if (slugError) {
      response.status(400).json({ error: slugError.message });
      return;
    }

    // Check slug uniqueness
    const existingSlug = database.prepare("SELECT id FROM dashboards WHERE slug = ?").get(slug);
    if (existingSlug) {
      response.status(409).json({ error: `A dashboard with slug '${slug}' already exists` });
      return;
    }

    // Check name uniqueness (case-insensitive)
    const existingName = database.prepare("SELECT id FROM dashboards WHERE LOWER(name) = LOWER(?)").get(name);
    if (existingName) {
      response.status(409).json({ error: "A dashboard with this name already exists" });
      return;
    }

    // Validate grids if provided
    if (grids) {
      const gridErrors = validateGrids(grids);
      if (gridErrors.length > 0) {
        response.status(400).json({ errors: gridErrors.map((e) => e.message) });
        return;
      }
    }

    const id = randomBytes(16).toString("hex");
    const createdAt = new Date().toISOString();

    const insertDashboard = database.transaction(() => {
      database
        .prepare("INSERT INTO dashboards (id, slug, name, description, allowedRoles, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, slug, name, description, JSON.stringify(allowedRoles), createdAt);

      if (grids) {
        insertWidgetConfigurations(database, id, grids);
      }
    });

    insertDashboard();

    logger.info("Dashboard created", { userId: request.jwtPayload!.sub, context: { dashboardId: id } });

    const row = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(id) as DashboardRow;
    const savedGrids = getGridsForDashboard(database, id);
    response.status(201).json({
      ...parseDashboard(row),
      isComplete: computeIsComplete(row, savedGrids),
      grids: savedGrids,
    });
  });

  // PUT /api/admin/dashboards/:id — atomic update of metadata + grids
  router.put("/:id", adminOnly, (request: Request, response: Response): void => {
    const row = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(request.params["id"]) as DashboardRow | undefined;
    if (!row) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }

    const { name, slug, description, allowedRoles, grids } = request.body as {
      name?: string;
      slug?: string;
      description?: string;
      allowedRoles?: string[];
      grids?: Record<string, WidgetPlacement[]>;
    };

    // Validate slug if provided
    const newSlug = slug ?? row.slug;
    if (slug !== undefined) {
      const slugError = validateSlug(slug);
      if (slugError) {
        response.status(400).json({ error: slugError.message });
        return;
      }
      // Check slug uniqueness (excluding current dashboard)
      const existingSlug = database.prepare("SELECT id FROM dashboards WHERE slug = ? AND id != ?").get(slug, row.id) as { id: string } | undefined;
      if (existingSlug) {
        response.status(409).json({ error: `A dashboard with slug '${slug}' already exists` });
        return;
      }
    }

    // Check name uniqueness (case-insensitive, excluding current dashboard)
    const newName = name ?? row.name;
    if (name !== undefined) {
      const existingName = database.prepare("SELECT id FROM dashboards WHERE LOWER(name) = LOWER(?) AND id != ?").get(name, row.id) as
        { id: string } | undefined;
      if (existingName) {
        response.status(409).json({ error: "A dashboard with this name already exists" });
        return;
      }
    }

    // Validate grids if provided
    if (grids) {
      const gridErrors = validateGrids(grids);
      if (gridErrors.length > 0) {
        response.status(400).json({ errors: gridErrors.map((e) => e.message) });
        return;
      }
    }

    const updateTransaction = database.transaction(() => {
      database
        .prepare("UPDATE dashboards SET name=?, slug=?, description=?, allowedRoles=? WHERE id=?")
        .run(newName, newSlug, description ?? row.description, JSON.stringify(allowedRoles ?? (JSON.parse(row.allowedRoles) as string[])), row.id);

      if (grids) {
        // Delete all existing widget configurations and reinsert
        database.prepare("DELETE FROM widget_configurations WHERE dashboardId = ?").run(row.id);
        insertWidgetConfigurations(database, row.id, grids);
      }
    });

    updateTransaction();

    const updatedRow = database.prepare("SELECT * FROM dashboards WHERE id = ?").get(row.id) as DashboardRow;
    const savedGrids = getGridsForDashboard(database, row.id);
    response.json({
      ...parseDashboard(updatedRow),
      isComplete: computeIsComplete(updatedRow, savedGrids),
      grids: savedGrids,
    });
  });

  // DELETE /api/admin/dashboards/:id
  router.delete("/:id", adminOnly, (request: Request, response: Response): void => {
    if (!database.prepare("SELECT id FROM dashboards WHERE id = ?").get(request.params["id"])) {
      response.status(404).json({ error: "Dashboard not found" });
      return;
    }
    database.prepare("DELETE FROM dashboards WHERE id = ?").run(request.params["id"]);
    logger.info("Dashboard deleted", { userId: request.jwtPayload!.sub, context: { dashboardId: request.params["id"] } });
    response.status(204).send();
  });

  return router;
}

function insertWidgetConfigurations(database: Database, dashboardId: string, grids: Record<string, WidgetPlacement[]>): void {
  const insert = database.prepare(
    "INSERT INTO widget_configurations (id, dashboardId, widgetId, gridType, title, col, row, colSpan, rowSpan, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const createdAt = new Date().toISOString();

  for (const [gridType, widgets] of Object.entries(grids)) {
    for (const widget of widgets) {
      insert.run(
        randomBytes(16).toString("hex"),
        dashboardId,
        widget.widgetId,
        gridType as GridType,
        widget.title,
        widget.col,
        widget.row,
        widget.colSpan,
        widget.rowSpan,
        widget.roleMinimum,
        createdAt,
      );
    }
  }
}
