import type { Request, Response, NextFunction } from "express";
import type { AuthService, JwtPayload, Role } from "../services/authService.js";

// Extend Express Request to carry the verified JWT payload.
declare module "express-serve-static-core" {
  interface Request {
    jwtPayload?: JwtPayload;
  }
}

export function authenticate(authService: AuthService) {
  return (request: Request, response: Response, next: NextFunction): void => {
    const token = request.cookies?.["token"] as string | undefined;
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
