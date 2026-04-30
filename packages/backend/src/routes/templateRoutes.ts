import { Router } from "express";
import type { Request, Response } from "express";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";
import type { Role } from "@invisible-av-booth/shared";
import { MetadataTemplateDao } from "../dao/metadataTemplateDao.js";

export function createTemplateRouter(database: Database, _authService: AuthService): Router {
  const router = Router();
  const dao = new MetadataTemplateDao(database);

  // GET / — templates filtered by the caller's role (both categories)
  router.get("/", (request: Request, response: Response): void => {
    const role = request.jwtPayload!.role as Role;
    const title = dao.getByCategoryAndRole("title", role);
    const description = dao.getByCategoryAndRole("description", role);
    response.json([...title, ...description]);
  });

  return router;
}
