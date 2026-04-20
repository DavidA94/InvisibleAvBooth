import { Router } from "express";
import type { Request, Response } from "express";
import type { SessionManifestService } from "../services/sessionManifestService.js";
import type { SessionManifest } from "../gateway/modules/sessionManifest/types.js";

export function createSessionRouter(manifestService: SessionManifestService): Router {
  const router = Router();

  // GET /api/session/manifest
  router.get("/manifest", (_request: Request, response: Response): void => {
    response.json(manifestService.get());
  });

  // POST /api/session/preview — preview interpolation without saving
  router.post("/preview", (request: Request, response: Response): void => {
    const draft = request.body as Partial<SessionManifest>;
    const interpolatedStreamTitle = manifestService.preview(draft);
    response.json({ interpolatedStreamTitle });
  });

  return router;
}
