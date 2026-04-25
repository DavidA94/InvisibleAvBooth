import type { Page } from "@playwright/test";
import { authLoginSuccess } from "../../fixtures/payloads/auth";
import type { AuthLoginResponse } from "../../fixtures/payloads/auth";

export async function routeAuthLogin(page: Page, response?: AuthLoginResponse): Promise<void> {
  await page.route("**/api/auth/login", async (route) => {
    const payload = response ?? authLoginSuccess();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...payload, token: "mock-jwt-token" }),
    });
  });
}

export async function routeAuthLoginFailure(page: Page, message = "Invalid credentials"): Promise<void> {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: message }),
    });
  });
}

export async function routeAuthCheck(page: Page): Promise<void> {
  // No-op — token-based auth doesn't need a check endpoint.
  // The frontend reads the token from localStorage on load.
}

export async function routeChangePassword(page: Page): Promise<void> {
  await page.route("**/api/auth/change-password", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, token: "mock-jwt-token-new" }),
    });
  });
}
