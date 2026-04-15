import type { Request, Response, NextFunction } from "express";
import type { AuthService, JwtPayload, Role } from "../services/authService.js";

// Extend Express Request to carry the verified JWT payload.
declare global {
  namespace Express {
    interface Request {
      jwtPayload?: JwtPayload;
    }
  }
}

export function authenticate(authService: AuthService) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const token = req.cookies?.["token"] as string | undefined;
    if (!token) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const result = authService.verifyToken(token);
    if (!result.success) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.jwtPayload = result.value;
    next();
  };
}

export function requireRole(authService: AuthService, minimum: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = authService.requireRole(req.jwtPayload!, minimum);
    if (!result.success) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
