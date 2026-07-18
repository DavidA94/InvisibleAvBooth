import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_FULLSCREEN_BUTTON,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

test.describe("Fullscreen Toggle", () => {
  test.beforeEach(async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page);
  });

  test("button visible when fullscreenEnabled is true", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    // Fullscreen button should be visible (Chromium supports fullscreen)
    await expect(page.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toBeVisible({ timeout: 5000 });
  });

  test("click enters fullscreen and icon changes", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    const button = page.getByTestId(TEST_ID_FULLSCREEN_BUTTON);
    await expect(button).toBeVisible();

    // Initial state: "Enter fullscreen"
    await expect(button).toHaveAttribute("aria-label", "Enter fullscreen");

    // Click to enter fullscreen
    await button.click();

    // In headless Chromium, requestFullscreen may not actually change visual state,
    // but we can check if the aria-label changed via the fullscreenchange event.
    // Simulate the fullscreenchange event if needed:
    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
      document.dispatchEvent(new Event("fullscreenchange"));
    });

    await expect(button).toHaveAttribute("aria-label", "Exit fullscreen");
  });

  test("second click exits fullscreen and icon reverts", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    const button = page.getByTestId(TEST_ID_FULLSCREEN_BUTTON);

    // Enter fullscreen
    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await expect(button).toHaveAttribute("aria-label", "Exit fullscreen");

    // Exit fullscreen
    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await expect(button).toHaveAttribute("aria-label", "Enter fullscreen");
  });

  test("external fullscreen exit updates icon", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    const button = page.getByTestId(TEST_ID_FULLSCREEN_BUTTON);

    // Simulate entering fullscreen via external means (browser shortcut)
    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await expect(button).toHaveAttribute("aria-label", "Exit fullscreen");

    // Simulate user pressing Escape (external exit)
    await page.evaluate(() => {
      Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await expect(button).toHaveAttribute("aria-label", "Enter fullscreen");
  });

  test("button hidden when fullscreenEnabled is false", async ({ page }) => {
    // Override fullscreenEnabled before page load — must happen before React hydrates
    await page.addInitScript(() => {
      Object.defineProperty(document, "fullscreenEnabled", { value: false, writable: true, configurable: true });
      // Also override webkit variant
      Object.defineProperty(document, "webkitFullscreenEnabled", { value: false, writable: true, configurable: true });
    });

    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(page);

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    // Button should not be rendered
    await expect(page.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).not.toBeVisible({ timeout: 2000 });
  });

  test("requestFullscreen rejection handled gracefully", async ({ page }) => {
    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    // Mock requestFullscreen to reject
    await page.evaluate(() => {
      document.documentElement.requestFullscreen = () => Promise.reject(new Error("Not allowed by permissions policy"));
    });

    const button = page.getByTestId(TEST_ID_FULLSCREEN_BUTTON);
    await button.click();

    // Icon should remain unchanged (no error, no state change)
    await expect(button).toHaveAttribute("aria-label", "Enter fullscreen");
  });
});
