/**
 * Pure logic for reading the authenticated user from the `user_info` cookie.
 * Extracted from authSlice for testability.
 */
import type { AuthUser } from "../types";

export function readUserFromCookie(): AuthUser | null {
  try {
    const match = document.cookie.split("; ").find((c) => c.startsWith("user_info="));
    if (!match) return null;
    const decoded = decodeURIComponent(match.split("=").slice(1).join("="));
    return JSON.parse(decoded) as AuthUser;
  } catch {
    return null;
  }
}
