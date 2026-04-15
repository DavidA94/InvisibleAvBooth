import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";

export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  // POST /auth/login
  // Body: { username, password, rememberMe? }
  router.post("/login", async (req: Request, res: Response): Promise<void> => {
    const { username, password, rememberMe } = req.body as {
      username?: string;
      password?: string;
      rememberMe?: boolean;
    };

    if (!username || !password) {
      res.status(400).json({ error: "username and password are required" });
      return;
    }

    const result = await authService.login(username, password, !!rememberMe);
    if (!result.success) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000;

    res.cookie("token", result.value.token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge,
    });

    res.json({ user: result.value.user });
  });

  // POST /auth/logout
  router.post("/logout", (_req: Request, res: Response): void => {
    res.clearCookie("token", { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax" });
    res.json({ ok: true });
  });

  return router;
}
