import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService, AuthErrorCode, CreateUserRequest, UpdateUserRequest } from "../services/authService.js";
import { authenticate, requireRole } from "../middleware/auth.js";

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

const STATUS: Partial<Record<AuthErrorCode, number>> = {
  USER_NOT_FOUND: 404,
  USERNAME_TAKEN: 409,
  SELF_DELETE: 403,
  INSUFFICIENT_ROLE: 403,
  FORBIDDEN: 403,
};

function errorStatus(code: AuthErrorCode): number {
  return STATUS[code] ?? 400;
}

export function createAdminUserRouter(authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /admin/users
  router.get("/", auth, adminOnly, (_req: Request, res: Response): void => {
    // adminOnly middleware guarantees ADMIN role — listUsers cannot fail here
    const result = authService.listUsers(_req.jwtPayload!);
    res.json(result.success ? result.value : []);
  }); // POST /admin/users
  router.post("/", auth, adminOnly, async (req: Request, res: Response): Promise<void> => {
    const result = await authService.createUser(req.body as CreateUserRequest, req.jwtPayload!);
    if (!result.success) {
      res.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }
    res.status(201).json(result.value);
  });

  // GET /admin/users/:id
  router.get("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    // adminOnly middleware guarantees ADMIN role — listUsers cannot fail here
    const result = authService.listUsers(req.jwtPayload!);
    const users = result.success ? result.value : [];
    const user = users.find((u) => u.id === req.params["id"]);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(user);
  });

  // PUT /admin/users/:id
  router.put("/:id", auth, adminOnly, async (req: Request, res: Response): Promise<void> => {
    const result = await authService.updateUser(req.params["id"]!, req.body as UpdateUserRequest, req.jwtPayload!);
    if (!result.success) {
      res.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }
    res.json(result.value);
  });

  // DELETE /admin/users/:id
  router.delete("/:id", auth, adminOnly, (req: Request, res: Response): void => {
    const result = authService.deleteUser(req.params["id"]!, req.jwtPayload!);
    if (!result.success) {
      res.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }
    res.status(204).send();
  });

  // POST /admin/users/:id/change-password
  router.post("/:id/change-password", auth, async (req: Request, res: Response): Promise<void> => {
    const { newPassword } = req.body as { newPassword?: string };
    if (!newPassword) {
      res.status(400).json({ error: "newPassword is required" });
      return;
    }

    const result = await authService.changePassword(req.params["id"]!, newPassword, req.jwtPayload!);
    if (!result.success) {
      res.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }

    res.cookie("token", result.value.token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });

    res.json({ ok: true });
  });

  return router;
}
