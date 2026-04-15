import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";
import { authenticate } from "../middleware/auth.js";
import { logger } from "../logger.js";

interface LogEntry {
  level: "debug" | "info" | "warn" | "error";
  message: string;
  userId?: string;
  context?: Record<string, unknown>;
  timestamp?: string;
}

export function createLogRouter(authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);

  // POST /api/logs — accepts a batch of frontend log entries and writes them
  // to the backend logger tagged with source: frontend.
  router.post("/", auth, (req: Request, res: Response): void => {
    const entries = req.body as LogEntry[];

    if (!Array.isArray(entries)) {
      res.status(400).json({ error: "body must be an array of log entries" });
      return;
    }

    for (const entry of entries) {
      const { level = "info", message, userId, context, timestamp } = entry;
      logger[level](message, {
        source: "frontend",
        ...(userId ? { userId } : {}),
        ...(context ? { context } : {}),
        ...(timestamp ? { clientTimestamp: timestamp } : {}),
      });
    }

    res.status(204).send();
  });

  return router;
}
