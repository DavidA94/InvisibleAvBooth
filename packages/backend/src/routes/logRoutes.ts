import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";
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
  void authService;

  // POST /api/logs — accepts a batch of frontend log entries and writes them
  // to the backend logger tagged with source: frontend.
  // Authentication is applied at mount time in src/index.ts so request.jwtPayload
  // is already present for all routes in this router.
  router.post("/", (request: Request, response: Response): void => {
    const entries = request.body as LogEntry[];

    if (!Array.isArray(entries)) {
      response.status(400).json({ error: "body must be an array of log entries" });
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

    response.status(204).send();
  });

  return router;
}
