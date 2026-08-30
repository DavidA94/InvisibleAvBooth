import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";
import {
  TEST_ID_ADMIN_DEVICES_PAGE,
  TEST_ID_DEVICE_LIST_ITEM,
  TEST_ID_ADD_DEVICE_BUTTON,
  TEST_ID_ADD_DEVICE_TYPE_OPTION,
  TEST_ID_DEVICE_FORM_LABEL,
  TEST_ID_DEVICE_FORM_HOST,
  TEST_ID_DEVICE_FORM_SAVE,
  TEST_ID_DEVICE_LIST_DELETE_BUTTON,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_PRESET_NAME_INPUT,
  TEST_ID_PRESET_SAVE_BUTTON,
  TEST_ID_PRESET_POSITION_SUMMARY,
} from "../../src/constants/testIds";

const MIXER_DEVICE = {
  id: "mix1",
  deviceType: "soundboard",
  label: "Main Mixer",
  host: "127.0.0.1",
  port: 10024,
  metadata: { model: "behringer-xair", channelCount: "4" },
  features: { "gain-control": true, "channel-metering": true, "channel-audio-capture": false },
  enabled: true,
  createdAt: "2026-01-01",
};

test.describe("Admin Sound Board Device", () => {
  test.beforeEach(async ({ page, context }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeSocketIo(page);

    await context.addCookies([
      {
        name: "user_info",
        value: encodeURIComponent(JSON.stringify({ id: "u1", username: "admin", role: "ADMIN" })),
        domain: "localhost",
        path: "/",
      },
    ]);

    let created = false;
    await page.route("**/api/admin/devices", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(created ? [MIXER_DEVICE] : []) });
      } else if (route.request().method() === "POST") {
        created = true;
        const body = route.request().postDataJSON();
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "mix1", ...body }) });
      } else {
        await route.continue();
      }
    });
    await page.route("**/api/admin/devices/*", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MIXER_DEVICE) });
      } else if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/admin/mixers/probe", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, model: "XR18", firmware: "1.19" }) });
    });
    await page.route("**/api/admin/mixers/*/presets", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
      } else if (route.request().method() === "POST") {
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "p1", name: "Singers", sortOrder: 0, payload: {} }) });
      } else {
        await route.continue();
      }
    });
    await page.route("**/api/admin/mixers/*/capture-preset", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, payload: { "/ch/01/mix/fader": 0.5, "/ch/01/mix/on": 1 } }),
      });
    });
  });

  test("create a Sound Board device via the add flow, then probe and save", async ({ page }) => {
    await page.goto("/admin/devices");
    await expect(page.getByTestId(TEST_ID_ADMIN_DEVICES_PAGE)).toBeVisible({ timeout: 10000 });

    await page.getByTestId(TEST_ID_ADD_DEVICE_BUTTON).click();
    await page.getByTestId(`${TEST_ID_ADD_DEVICE_TYPE_OPTION}-soundboard`).click();

    await expect(page.getByTestId(TEST_ID_DEVICE_FORM_LABEL)).toBeVisible();
    await page.getByTestId(TEST_ID_DEVICE_FORM_LABEL).locator("input").fill("Main Mixer");
    await page.getByTestId(TEST_ID_DEVICE_FORM_HOST).locator("input").fill("127.0.0.1");

    // Probe reports success.
    await page.getByText("Test Connection").click();
    await expect(page.getByText(/Connected/)).toBeVisible();

    await page.getByTestId(TEST_ID_DEVICE_FORM_SAVE).click();
    // The list refreshes and shows the new device.
    await expect(page.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-mix1`)).toBeVisible();
  });

  test("edit an existing mixer, author a preset (capture + save), then delete", async ({ page }) => {
    // Seed the list as already containing the mixer.
    await page.unroute("**/api/admin/devices");
    await page.route("**/api/admin/devices", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([MIXER_DEVICE]) });
      } else {
        await route.continue();
      }
    });

    await page.goto("/admin/devices");
    await expect(page.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-mix1`)).toBeVisible({ timeout: 10000 });

    // Open the mixer detail — connection recalled.
    await page.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-mix1`).click();
    await expect(page.getByTestId(TEST_ID_DEVICE_FORM_LABEL)).toBeVisible();

    // Author a preset: open the modal, capture, name, save.
    await page.getByText("Add Preset").click();
    await expect(page.getByTestId(TEST_ID_PRESET_NAME_INPUT)).toBeVisible();
    await page.getByTestId(TEST_ID_PRESET_NAME_INPUT).locator("input").fill("Singers");
    await page.getByText("Capture current board").click();
    await expect(page.getByTestId(TEST_ID_PRESET_POSITION_SUMMARY)).toBeVisible();
    await page.getByTestId(TEST_ID_PRESET_SAVE_BUTTON).click();

    // Delete the device (confirm cascade).
    await page.getByTestId(`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-mix1`).click();
    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();
  });
});
