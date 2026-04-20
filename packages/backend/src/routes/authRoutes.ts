import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthService } from "../services/authService.js";
import { authenticate } from "../middleware/auth.js";

const IS_PRODUCTION = process.env["NODE_ENV"] === "production";
const USER_COOKIE = "user_info";

function setUserInfoCookie(response: Response, user: { username: string; role: string }, maxAge: number): void {
  response.cookie(USER_COOKIE, JSON.stringify({ username: user.username, role: user.role }), {
    httpOnly: false,
    secure: IS_PRODUCTION,
    sameSite: "lax",
    maxAge,
  });
}

function clearUserInfoCookie(response: Response): void {
  response.clearCookie(USER_COOKIE, { httpOnly: false, secure: IS_PRODUCTION, sameSite: "lax" });
}

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

    setUserInfoCookie(response, result.value.user.user, maxAge);
    response.json({ user: result.value.user });
  });

  // POST /auth/logout (API clients)
  router.post("/logout", (_request: Request, response: Response): void => {
    response.clearCookie("token", { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax" });
    clearUserInfoCookie(response);
    response.json({ ok: true });
  });

  // GET /auth/logout (browser navigation — clears cookies and redirects)
  router.get("/logout", (_request: Request, response: Response): void => {
    response.clearCookie("token", { httpOnly: true, secure: IS_PRODUCTION, sameSite: "lax" });
    clearUserInfoCookie(response);
    response.redirect("/login");
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

    const maxAge = 8 * 60 * 60 * 1000;
    response.cookie("token", result.value.token, {
      httpOnly: true,
      secure: IS_PRODUCTION,
      sameSite: "lax",
      maxAge,
    });

    // Update user info cookie — requiresPasswordChange is now cleared
    setUserInfoCookie(response, request.jwtPayload!, maxAge);
    response.json({ ok: true });
  });

  return router;
}
