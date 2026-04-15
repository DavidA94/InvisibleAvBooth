import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";
import { authenticate } from "../middleware/auth.js";

// In-memory session manifest — replaced by SessionManifestService in task 28.
// For now, expose a stub that returns an empty manifest so the route exists.
let manifest: Record<string, unknown> = {};

export function createSessionRouter(authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);

  // GET /api/session/manifest
  router.get("/manifest", auth, (_request: Request, response: Response): void => {
    response.json(manifest);
  });

  return router;
}

// Exported so SessionManifestService can update the in-memory value (task 28).
export function setManifest(value: Record<string, unknown>): void {
  manifest = value;
}
