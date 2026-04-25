import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService, AuthErrorCode, CreateUserRequest, UpdateUserRequest } from "../services/authService.js";
import { requireRole } from "../middleware/auth.js";


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
  const adminOnly = requireRole(authService, "ADMIN");

  // GET /admin/users
  // Authentication is applied at mount time in src/index.ts so request.jwtPayload
  // is already present for all routes in this router.
  router.get("/", adminOnly, (_request: Request, response: Response): void => {
    // adminOnly middleware guarantees ADMIN role — listUsers cannot fail here
    const result = authService.listUsers(_request.jwtPayload!);
    response.json(result.success ? result.value : []);
  }); // POST /admin/users
  router.post("/", adminOnly, async (request: Request, response: Response): Promise<void> => {
    const result = await authService.createUser(request.body as CreateUserRequest, request.jwtPayload!);
    if (!result.success) {
      response.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }
    response.status(201).json(result.value);
  });

  // GET /admin/users/:id
  router.get("/:id", adminOnly, (request: Request, response: Response): void => {
    // adminOnly middleware guarantees ADMIN role — listUsers cannot fail here
    const result = authService.listUsers(request.jwtPayload!);
    const users = result.success ? result.value : [];
    const user = users.find((u) => u.id === request.params["id"]);
    if (!user) {
      response.status(404).json({ error: "User not found" });
      return;
    }
    response.json(user);
  });

  // PUT /admin/users/:id
  router.put("/:id", adminOnly, async (request: Request, response: Response): Promise<void> => {
    const result = await authService.updateUser(request.params["id"]!, request.body as UpdateUserRequest, request.jwtPayload!);
    if (!result.success) {
      response.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }
    response.json(result.value);
  });

  // DELETE /admin/users/:id
  router.delete("/:id", adminOnly, (request: Request, response: Response): void => {
    const result = authService.deleteUser(request.params["id"]!, request.jwtPayload!);
    if (!result.success) {
      response.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }
    response.status(204).send();
  });

  // POST /admin/users/:id/change-password
  router.post("/:id/change-password", async (request: Request, response: Response): Promise<void> => {
    const { newPassword } = request.body as { newPassword?: string };
    if (!newPassword) {
      response.status(400).json({ error: "newPassword is required" });
      return;
    }

    const result = await authService.changePassword(request.params["id"]!, newPassword, request.jwtPayload!);
    if (!result.success) {
      response.status(errorStatus(result.error.code)).json({ error: result.error.message });
      return;
    }

    // Return new token when the admin is changing their own password.
    if (request.jwtPayload!.sub === request.params["id"]) {
      response.json({ ok: true, token: result.value.token });
    } else {
      response.json({ ok: true });
    }
  });

  return router;
}
