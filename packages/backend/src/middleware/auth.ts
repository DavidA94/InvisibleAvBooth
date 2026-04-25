import type { Request, Response, NextFunction } from "express";
import type { AuthService, JwtPayload, Role } from "../services/authService.js";

// Extend Express Request to carry the verified JWT payload.
declare module "express-serve-static-core" {
  interface Request {
    jwtPayload?: JwtPayload;
  }
}

function extractToken(request: Request): string | undefined {
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return undefined;
}

export function authenticate(authService: AuthService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = extractToken(request);
    if (!token) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    const result = authService.verifyToken(token);
    if (!result.success) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }
    request.jwtPayload = result.value;
    next();
  };
}

export function requirePasswordChanged() {
  return (request: Request, response: Response, next: NextFunction): void => {
    if (request.jwtPayload?.requiresPasswordChange) {
      response.status(403).json({ error: "Password change required before accessing this resource" });
      return;
    }
    next();
  };
}

export function requireRole(authService: AuthService, minimum: Role) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const result = authService.requireRole(request.jwtPayload!, minimum);
    if (!result.success) {
      response.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
