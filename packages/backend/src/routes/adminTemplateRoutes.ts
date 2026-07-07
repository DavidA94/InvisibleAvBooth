import { Router } from "express";
import type { Request, Response } from "express";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";
import { MetadataTemplateDao } from "../dao/metadataTemplateDao.js";
import { validateTemplate } from "../validation/templateValidation.js";
import type { ValidationInput } from "../validation/templateValidation.js";
import { logger } from "../logger.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_TEMPLATES_CHANGED } from "../eventBus/types.js";

export function createAdminTemplateRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  const adminOnly = requireRole(authService, "ADMIN");
  const dao = new MetadataTemplateDao(database);

  // GET / — all templates
  router.get("/", adminOnly, (_request: Request, response: Response): void => {
    response.json(dao.getAll());
  });

  // POST /validate — validate without persisting
  router.post("/validate", adminOnly, (request: Request, response: Response): void => {
    const { name, category, formatString, roleMinimum, excludeId } = request.body as Partial<ValidationInput>;
    if (!name || !category || formatString === undefined || !roleMinimum) {
      response.status(400).json({ error: "name, category, formatString, and roleMinimum are required" });
      return;
    }
    const input: ValidationInput = { name, category, formatString, roleMinimum };
    if (excludeId) input.excludeId = excludeId;
    const result = validateTemplate(input, dao.getAll());
    response.json(result);
  });

  // POST / — create template
  router.post("/", adminOnly, (request: Request, response: Response): void => {
    const { name, category, formatString, roleMinimum, lowerThirdType, autoDismissMs } = request.body as {
      name?: string;
      category?: string;
      formatString?: string;
      roleMinimum?: string;
      lowerThirdType?: string;
      autoDismissMs?: number | null;
    };
    if (!name || !category || formatString === undefined || !roleMinimum) {
      response.status(400).json({ error: "name, category, formatString, and roleMinimum are required" });
      return;
    }
    if (category === "lower_third" && !lowerThirdType) {
      response.status(400).json({ error: "lowerThirdType is required for lower_third category" });
      return;
    }
    const validation = validateTemplate({ name, category, formatString, roleMinimum } as ValidationInput, dao.getAll());
    if (validation.blockers.length > 0) {
      response.status(422).json({ blockers: validation.blockers, warnings: validation.warnings });
      return;
    }
    const template = dao.create({
      name,
      category,
      formatString,
      roleMinimum,
      ...(lowerThirdType ? { lowerThirdType } : {}),
      ...(autoDismissMs !== undefined ? { autoDismissMs } : {}),
    } as Parameters<typeof dao.create>[0]);
    logger.info("Template created", { userId: request.jwtPayload!.sub, context: { templateId: template.id } });
    eventBus.emit(BUS_TEMPLATES_CHANGED, { action: "created", templateId: template.id });
    response.status(201).json(template);
  });

  // PUT /:id — update template
  router.put("/:id", adminOnly, (request: Request, response: Response): void => {
    const id = request.params["id"] as string;
    const existing = dao.getById(id);
    if (!existing) {
      response.status(404).json({ error: "Template not found" });
      return;
    }
    const { name, formatString, roleMinimum, lowerThirdType, autoDismissMs } = request.body as {
      name?: string;
      formatString?: string;
      roleMinimum?: string;
      lowerThirdType?: string;
      autoDismissMs?: number | null;
    };
    const validationInput: ValidationInput = {
      name: name ?? existing.name,
      category: existing.category,
      formatString: formatString ?? existing.formatString,
      roleMinimum: (roleMinimum ?? existing.roleMinimum) as ValidationInput["roleMinimum"],
      excludeId: id,
    };
    const validation = validateTemplate(validationInput, dao.getAll());
    if (validation.blockers.length > 0) {
      response.status(422).json({ blockers: validation.blockers, warnings: validation.warnings });
      return;
    }
    try {
      const updated = dao.update(id, {
        name,
        formatString,
        roleMinimum,
        ...(lowerThirdType !== undefined ? { lowerThirdType } : {}),
        ...(autoDismissMs !== undefined ? { autoDismissMs } : {}),
      } as Parameters<typeof dao.update>[1]);
      logger.info("Template updated", { userId: request.jwtPayload!.sub, context: { templateId: id } });
      eventBus.emit(BUS_TEMPLATES_CHANGED, { action: "updated", templateId: id });
      response.json(updated);
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  // DELETE /:id — delete template
  router.delete("/:id", adminOnly, (request: Request, response: Response): void => {
    const id = request.params["id"] as string;
    try {
      const deleted = dao.delete(id);
      if (!deleted) {
        response.status(404).json({ error: "Template not found" });
        return;
      }
      logger.info("Template deleted", { userId: request.jwtPayload!.sub, context: { templateId: id } });
      eventBus.emit(BUS_TEMPLATES_CHANGED, { action: "deleted", templateId: id });
      response.status(204).send();
    } catch (error) {
      response.status(400).json({ error: (error as Error).message });
    }
  });

  return router;
}
