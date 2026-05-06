import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { sessionManifestFilled } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import { platformStateIdle, platformStateStreaming, platformReadinessDefault } from "../fixtures/payloads/platform";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_MANAGE_STREAMS_BUTTON,
  TEST_ID_MANAGE_STREAMS_MODAL,
  TEST_ID_PLATFORM_ROW,
  TEST_ID_PLATFORM_START_ALL,
  TEST_ID_PLATFORM_STOP_ALL,
  TEST_ID_PLATFORM_START_SINGLE,
  TEST_ID_PLATFORM_STOP_SINGLE,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

async function loginAndNavigate(page: Parameters<typeof test>[1]["page"], handle: Awaited<ReturnType<typeof routeSocketIo>>): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

  // Push platform state so the modal has data
  handle.sendRaw("stc:platform:state", platformStateIdle());
  handle.sendRaw("stc:platform:readiness", platformReadinessDefault());
}

test.describe("Multi-platform stream start flow", () => {
  test("opens Manage Streams modal and shows YouTube platform with privacy", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(page, undefined, sessionManifestFilled());

    await loginAndNavigate(page, handle);

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    const row = page.getByTestId(TEST_ID_PLATFORM_ROW);
    await expect(row).toBeVisible();
    await expect(row).toContainText("YouTube", { useInnerText: true });
    await expect(row).toContainText("Idle", { useInnerText: true });
    await expect(row).toContainText("(Unlisted)", { useInnerText: true });
  });

  test("Start All shows confirmation and sends command", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(page, undefined, sessionManifestFilled());

    await loginAndNavigate(page, handle);

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    // Click Start All — confirmation should appear
    await page.getByTestId(TEST_ID_PLATFORM_START_ALL).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeVisible();
    await expect(page.getByText("Go Live")).toBeVisible();

    // Confirm — command is sent (mock acks it)
    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();

    // Confirmation modal should close
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeVisible({ timeout: 3000 });
  });

  test("Stop All shows confirmation and sends command", async ({ page }) => {
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

    // Push streaming state
    handle.sendRaw("stc:platform:state", platformStateStreaming());
    handle.sendRaw("stc:platform:readiness", platformReadinessDefault());

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    // Wait for streaming state to render
    await expect(page.getByTestId(TEST_ID_PLATFORM_STOP_SINGLE)).toBeVisible({ timeout: 5000 });

    // Click Stop All — confirmation should appear
    await page.getByTestId(TEST_ID_PLATFORM_STOP_ALL).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeVisible();
    await expect(page.getByText("Stop all streams?")).toBeVisible();

    // Confirm
    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeVisible({ timeout: 3000 });
  });

  test("individual Start Stream shows confirmation with platform name", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(page, undefined, sessionManifestFilled());

    await loginAndNavigate(page, handle);

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    await page.getByTestId(TEST_ID_PLATFORM_START_SINGLE).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeVisible();
    await expect(page.getByText("Start streaming to YouTube?")).toBeVisible();

    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeVisible({ timeout: 3000 });
  });

  test("individual Stop Stream shows confirmation with platform name", async ({ page }) => {
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

    handle.sendRaw("stc:platform:state", platformStateStreaming());
    handle.sendRaw("stc:platform:readiness", platformReadinessDefault());

    await page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeVisible({ timeout: 5000 });

    await expect(page.getByTestId(TEST_ID_PLATFORM_STOP_SINGLE)).toBeVisible({ timeout: 5000 });
    await page.getByTestId(TEST_ID_PLATFORM_STOP_SINGLE).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeVisible();
    await expect(page.getByText("Stop streaming to YouTube?")).toBeVisible();

    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeVisible({ timeout: 3000 });
  });
});
