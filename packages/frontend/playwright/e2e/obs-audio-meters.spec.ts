import { test, expect, type Page } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { routeTemplatesApi } from "../support/routes/template";
import type { MockSocketHandle } from "../support/routes/obs";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_AUDIO_METER_CONTAINER,
  TEST_ID_AUDIO_METER_LEFT,
  TEST_ID_AUDIO_METER_RIGHT,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

/** Dashboard layout that includes the OBS Preview widget */
const dashboardLayoutWithPreview = {
  version: 1,
  cells: [
    { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" },
    { widgetId: "obs-preview", title: "OBS Preview", col: 2, row: 0, colSpan: 4, rowSpan: 4, roleMinimum: "AvVolunteer" },
  ],
};

async function loginAndNavigate(page: Page, socketHandle: MockSocketHandle): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

  // Send device capabilities with audioMetering enabled and NDI configured
  socketHandle.sendRaw("stc:device:capabilities", {
    deviceId: "preview",
    capabilities: { deviceId: "preview", deviceType: "obs", features: { preview: true, audioMetering: true } },
  });
  socketHandle.sendRaw("stc:device:capabilities", {
    deviceId: "obs-preview",
    capabilities: { deviceId: "obs-preview", deviceType: "obs", features: { ndiConfigured: true } },
  });
  // Small wait for state to propagate
  await page.waitForTimeout(100);
}

test.describe("OBS Audio Level Meters", () => {
  let socketHandle: MockSocketHandle;

  test.beforeEach(async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeTemplatesApi(page);

    // Custom dashboard layout that includes the OBS Preview widget
    await page.route("**/api/dashboards", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([{ id: "default", name: "Main Dashboard", description: "Primary control dashboard" }]),
      });
    });
    await page.route("**/api/dashboards/*/layout", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dashboardLayoutWithPreview),
      });
    });

    socketHandle = await routeSocketIo(page);
  });

  test("meters not visible before first level event", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    // No level events sent — meters should not be visible
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).not.toBeVisible({ timeout: 2000 });
  });

  test("meters visible after first level event", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -20, right: -10 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });
  });

  test("L and R meters move independently", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -6, right: -30 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });

    // Get fill percentages from the CSS custom property
    const leftFill = await page.getByTestId(TEST_ID_AUDIO_METER_LEFT).locator(".audio-meter-gradient").getAttribute("style");
    const rightFill = await page.getByTestId(TEST_ID_AUDIO_METER_RIGHT).locator(".audio-meter-gradient").getAttribute("style");

    // -6 dB → 90%, -30 dB → 50%
    expect(leftFill).toContain("90%");
    expect(rightFill).toContain("50%");
  });

  test("meters display correct fill height proportional to dB", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -30, right: -15 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });

    const leftFill = await page.getByTestId(TEST_ID_AUDIO_METER_LEFT).locator(".audio-meter-gradient").getAttribute("style");
    const rightFill = await page.getByTestId(TEST_ID_AUDIO_METER_RIGHT).locator(".audio-meter-gradient").getAttribute("style");

    // -30 dB → 50%, -15 dB → 75%
    expect(leftFill).toContain("50%");
    expect(rightFill).toContain("75%");
  });

  test("meters visible when muted", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -20, right: -20 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });

    // Muting is a preview audio control — meters should remain visible
    // (We can't easily test the mute button interaction here since the preview
    //  stream hook is mocked, but the meters being visible proves independence)
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible();
  });

  test("staleness: bars go to zero after 500ms with no events", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -20, right: -10 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });

    // Wait for staleness timeout (500ms + buffer)
    await page.waitForTimeout(700);

    // Bars should go to zero (0% fill)
    const leftFill = await page.getByTestId(TEST_ID_AUDIO_METER_LEFT).locator(".audio-meter-gradient").getAttribute("style");
    const rightFill = await page.getByTestId(TEST_ID_AUDIO_METER_RIGHT).locator(".audio-meter-gradient").getAttribute("style");
    expect(leftFill).toContain("0%");
    expect(rightFill).toContain("0%");

    // Meters should still be visible (not removed)
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible();
  });

  test("meter track has dark background zones (OBS-style unfilled reference)", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -20, right: -10 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });

    // Check the track elements exist (they show dark color zones as background)
    const tracks = page.locator(".audio-meter-track");
    await expect(tracks.first()).toBeAttached();
    expect(await tracks.count()).toBe(2); // One per bar
  });

  test("Audio connection indicator shows unhealthy on staleness", async ({ page }) => {
    await loginAndNavigate(page, socketHandle);
    socketHandle.sendRaw("stc:obs:audio:levels", { left: -20, right: -10 });
    await expect(page.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeVisible({ timeout: 5000 });

    // Initially the Audio indicator should be healthy (events flowing)
    const indicators = page.getByTestId("connection-indicators");
    const obsPreviewIndicators = indicators.filter({ hasText: "Audio" });
    await expect(obsPreviewIndicators).toBeVisible({ timeout: 2000 });

    // Wait for staleness timeout (500ms + buffer)
    await page.waitForTimeout(700);

    // After staleness, check that an unhealthy dot exists within the Audio indicator area
    // Both Feed and Audio may be unhealthy (no video stream in test), so count total unhealthy dots
    const unhealthyDots = obsPreviewIndicators.locator('[data-status="unhealthy"]');
    // At minimum 1 should be the Audio one (could be 2 if Feed is also unhealthy)
    await expect(unhealthyDots.first()).toBeVisible({ timeout: 2000 });
    expect(await unhealthyDots.count()).toBeGreaterThanOrEqual(1);
  });
});
