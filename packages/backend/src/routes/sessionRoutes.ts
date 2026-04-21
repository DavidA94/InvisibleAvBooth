import { Router } from "express";
import type { Request, Response } from "express";
import type { SessionManifestService } from "../services/sessionManifestService.js";

export function createSessionRouter(manifestService: SessionManifestService): Router {
  const router = Router();

  // GET /api/session/manifest
  router.get("/manifest", (_request: Request, response: Response): void => {
    response.json(manifestService.get());
  });

  return router;
}
