import type { Page } from "@playwright/test";
import { authLoginSuccess } from "../../fixtures/payloads/auth";
import type { AuthLoginResponse } from "../../fixtures/payloads/auth";

export async function routeAuthLogin(page: Page, response?: AuthLoginResponse): Promise<void> {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response ?? authLoginSuccess()),
      headers: { "Set-Cookie": "token=mock-jwt; Path=/; HttpOnly" },
    });
  });
}

export async function routeAuthLoginFailure(page: Page, message = "Invalid credentials"): Promise<void> {
  await page.route("**/api/auth/login", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ message }),
    });
  });
}

export async function routeAuthLogout(page: Page): Promise<void> {
  await page.route("**/api/auth/logout", async (route) => {
    await route.fulfill({
      status: 302,
      headers: { Location: "/login", "Set-Cookie": "token=; Path=/; HttpOnly; Max-Age=0" },
    });
  });
}

export async function routeAuthCheck(page: Page, response?: AuthLoginResponse): Promise<void> {
  await page.route("**/api/auth/check", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response ?? authLoginSuccess()),
    });
  });
}

export async function routeChangePassword(page: Page): Promise<void> {
  await page.route("**/api/auth/change-password", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
  });
}
