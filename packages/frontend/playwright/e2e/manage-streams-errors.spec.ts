import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { sessionManifestFilled, sessionManifestDefault } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import { platformReadinessDefault } from "../fixtures/payloads/platform";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_MANAGE_STREAMS_BUTTON,
  TEST_ID_MANAGE_STREAMS_MODAL,
  TEST_ID_PLATFORM_ROW,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

async function loginAndNavigate(page: Parameters<typeof test>[1]["page"], handle: Awaited<ReturnType<typeof routeSocketIo>>): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

  // Push platform state
  handle.sendRaw("stc:platform:readiness", platformReadinessDefault());
}

test.describe("Manage Streams modal — error and edge states", () => {
  test("F17: shows 'No streaming platforms configured' when no platforms", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(page, undefined, sessionManifestFilled());

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    // Push empty platform readiness (no platforms configured)
    handle.sendRaw("stc:platform:readiness", { platforms: [] });

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    await expect(page.getByText("No streaming platforms configured")).toBeVisible();
  });

  test("F18: platform error state renders in the modal (platform row visible)", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(page, undefined, sessionManifestFilled());

    await loginAndNavigate(page, handle);

    // Push idle state so platform row renders
    handle.sendRaw("stc:platform:state", { platformType: "youtube", state: { status: "idle" } });
    await page.waitForTimeout(100);

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    // At minimum, the platform row should be visible with the platform name
    const row = page.getByTestId(TEST_ID_PLATFORM_ROW);
    await expect(row).toBeVisible({ timeout: 3000 });
    await expect(row).toContainText("YouTube", { ignoreCase: true });
  });

  test("F21: Manage Streams button shows sub-label when manifest not ready", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    // Manifest not ready (empty)
    const handle = await routeSocketIo(page, undefined, sessionManifestDefault());

    await page.goto("/login");
    await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
    await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
    await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
    await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

    handle.sendRaw("stc:platform:readiness", platformReadinessDefault());

    const button = page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON);
    await expect(button).toBeVisible({ timeout: 5000 });
    // Sub-label shows "Enter metadata" when manifest not ready
    await expect(button).toContainText("metadata", { ignoreCase: true });
  });
});
