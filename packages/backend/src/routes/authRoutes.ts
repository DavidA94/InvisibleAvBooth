import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";
import { authenticate } from "../middleware/auth.js";

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();
  const auth = authenticate(authService);
  // Note: no requirePasswordChanged() here — these routes must remain accessible
  // to users who need to change their password.

  // POST /auth/login
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

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;

    response.cookie("token", result.value.token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge,
    });

    response.json({ user: result.value.user });
  });

  // POST /auth/logout
  router.post("/logout", (_request: Request, response: Response): void => {
    response.clearCookie("token", { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax" });
    response.json({ ok: true });
  });

  // POST /auth/change-password — self-service; works even when requiresPasswordChange is set
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

    response.cookie("token", result.value.token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000,
    });

    response.json({ ok: true });
  });

  return router;
}
