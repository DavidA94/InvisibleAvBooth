import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";
import { authenticate } from "../middleware/auth.js";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);

  // POST /api/auth/login
  router.post("/login", async (request: Request, response: Response): Promise<void> => {
    const { username, password, rememberMe } = request.body as {
      username?: string;
      password?: string;
      rememberMe?: boolean;
    };

    if (!username || !password) {
      response.status(400).json({ error: "username and password are required" });
      return;
    }

    const result = await authService.login(username, password, !!rememberMe);
    if (!result.success) {
      response.status(401).json({ error: "Invalid credentials" });
      return;
    }

    response.json({ user: result.value.user, token: result.value.token });
  });

  // POST /api/auth/logout
  router.post("/logout", (_request: Request, response: Response): void => {
    // Token-based auth — nothing to clear server-side.
    // Client discards the token.
    response.json({ ok: true });
  });

  // POST /api/auth/change-password
  router.post("/change-password", auth, async (request: Request, response: Response): Promise<void> => {
    const { newPassword } = request.body as { newPassword?: string };
    if (!newPassword) {
      response.status(400).json({ error: "newPassword is required" });
      return;
    }

    const result = await authService.changePassword(request.jwtPayload!.sub, newPassword, request.jwtPayload!);
    if (!result.success) {
      response.status(400).json({ error: result.error.message });
      return;
    }

    // Return new token with updated claims (requiresPasswordChange cleared)
    response.json({ ok: true, token: result.value.token });
  });

  return router;
}
