import { Router } from "express";
import type { Request, Response } from "express";
import { logger } from "../logger.js";

interface LogEntry {
  level?: "debug" | "info" | "warn" | "error";
  message?: string;
  context?: Record<string, unknown>;
}

const VALID_LEVELS = new Set(["debug", "info", "warn", "error"]);
const MAX_ENTRIES = 10;
const MAX_ENTRY_SIZE = 1024;

// Simple in-memory rate limiter: max 10 requests per minute per IP
const requestCounts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = requestCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    requestCounts.set(ip, { count: 1, resetAt: now + 60000 });
    return false;
  }
  entry.count++;
  return entry.count > 10;
}

export function createOverlayLogRouter(): Router {
  const router = Router();

  router.post("/", (request: Request, response: Response): void => {
    const ip = request.ip ?? "unknown";
    if (isRateLimited(ip)) {
      response.status(429).json({ error: "Rate limit exceeded" });
      return;
    }

    const entries = request.body as LogEntry[];
    if (!Array.isArray(entries) || entries.length > MAX_ENTRIES) {
      response.status(400).json({ error: "Body must be an array of at most 10 log entries" });
      return;
    }

    const oversized = entries.filter((e) => JSON.stringify(e).length > MAX_ENTRY_SIZE);
    if (oversized.length > 0) {
      logger.warn("Overlay log entries rejected: exceeds 1KB limit", {
        source: "backend",
        context: { count: oversized.length, ip, userAgent: request.headers["user-agent"] },
      });
      response.status(413).json({ error: `${oversized.length} entry/entries exceed 1KB limit` });
      return;
    }

    for (const entry of entries) {
      const level = entry.level && VALID_LEVELS.has(entry.level) ? entry.level : "info";
      if (!entry.message) continue;
      logger[level](entry.message, { source: "overlay", ...(entry.context ? { context: entry.context } : {}) });
    }

    response.status(204).send();
  });

  return router;
}
