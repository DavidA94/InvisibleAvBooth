import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";

// In-memory session manifest — replaced by SessionManifestService in task 28.
// For now, expose a stub that returns an empty manifest so the route exists.
let manifest: Record<string, unknown> = {};

export function createSessionRouter(authService: AuthService): Router {
  const router = Router();
  void authService;

  // GET /api/session/manifest
  // Authentication is applied at mount time in src/index.ts so request.jwtPayload
  // is already present for all routes in this router.
  router.get("/manifest", (_request: Request, response: Response): void => {
    response.json(manifest);
  });

  return router;
}

// Exported so SessionManifestService can update the in-memory value (task 28).
export function setManifest(value: Record<string, unknown>): void {
  manifest = value;
}
