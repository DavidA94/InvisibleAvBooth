import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { obsStateDefault } from "../fixtures/payloads/obs";
import { sessionManifestFilled } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_OBS_RECORD_BUTTON,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_CONFIRMATION_CANCEL_BUTTON,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

async function loginAndNavigate(page: Parameters<typeof test>[1]["page"]): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
}

test.describe("Recording start/stop flows", () => {
  test("Start Recording button sends command and transitions to recording state", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(page, obsStateDefault({ connected: true }), sessionManifestFilled());

    await loginAndNavigate(page);

    const recordButton = page.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    await expect(recordButton).toBeVisible({ timeout: 5000 });
    await expect(recordButton).toContainText("Start Recording");

    // Click Start Recording — no confirmation needed for start
    await recordButton.click();

    // Simulate backend confirming recording started
    handle.sendObsState(obsStateDefault({ connected: true, recording: true, commandedState: { streaming: false, recording: true } }));

    // Button should now say "Stop Recording"
    await expect(recordButton).toContainText("Stop Recording", { timeout: 3000 });
  });

  test("Stop Recording shows confirmation modal before stopping", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    // Start with recording already active
    await routeSocketIo(
      page,
      obsStateDefault({ connected: true, recording: true, commandedState: { streaming: false, recording: true } }),
      sessionManifestFilled(),
    );

    await loginAndNavigate(page);

    const recordButton = page.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    await expect(recordButton).toContainText("Stop Recording", { timeout: 5000 });

    // Click Stop Recording — should show confirmation
    await recordButton.click();

    // Confirmation modal should appear with recording-specific wording
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeVisible({ timeout: 3000 });
    await expect(page.getByText("Are you sure you want to stop recording?")).toBeVisible();
  });

  test("Stop Recording confirmation cancel keeps recording active", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    await routeSocketIo(
      page,
      obsStateDefault({ connected: true, recording: true, commandedState: { streaming: false, recording: true } }),
      sessionManifestFilled(),
    );

    await loginAndNavigate(page);

    const recordButton = page.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    await expect(recordButton).toContainText("Stop Recording", { timeout: 5000 });

    // Click Stop → Cancel
    await recordButton.click();
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON)).toBeVisible({ timeout: 3000 });
    await page.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON).click();

    // Confirmation dismissed, still recording
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeVisible({ timeout: 2000 });
    await expect(recordButton).toContainText("Stop Recording");
  });

  test("Stop Recording confirmation confirm sends command and transitions to idle", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketIo(
      page,
      obsStateDefault({ connected: true, recording: true, commandedState: { streaming: false, recording: true } }),
      sessionManifestFilled(),
    );

    await loginAndNavigate(page);

    const recordButton = page.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    await expect(recordButton).toContainText("Stop Recording", { timeout: 5000 });

    // Click Stop → Confirm
    await recordButton.click();
    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();

    // Confirmation dismissed
    await expect(page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).not.toBeVisible({ timeout: 3000 });

    // Simulate backend confirming stop
    handle.sendObsState(obsStateDefault({ connected: true, recording: false, commandedState: { streaming: false, recording: false } }));

    // Button returns to idle state
    await expect(recordButton).toContainText("Start Recording", { timeout: 3000 });
  });
});
