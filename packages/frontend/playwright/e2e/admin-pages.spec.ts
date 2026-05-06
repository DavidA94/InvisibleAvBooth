import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";
import {
  TEST_ID_ADMIN_USERS_PAGE,
  TEST_ID_USER_LIST_ITEM,
  TEST_ID_ADD_USER_BUTTON,
  TEST_ID_USER_FORM_USERNAME,
  TEST_ID_USER_FORM_PASSWORD,
  TEST_ID_USER_FORM_SAVE,
  TEST_ID_USER_LIST_DELETE_BUTTON,
  TEST_ID_ADMIN_DEVICES_PAGE,
  TEST_ID_DEVICE_LIST_ITEM,
  TEST_ID_ADD_DEVICE_BUTTON,
  TEST_ID_ADD_DEVICE_TYPE_OPTION,
  TEST_ID_DEVICE_FORM_LABEL,
  TEST_ID_DEVICE_FORM_HOST,
  TEST_ID_DEVICE_FORM_SAVE,
  TEST_ID_DEVICE_LIST_DELETE_BUTTON,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
} from "../../src/constants/testIds";

const USERS = [
  { id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: false, createdAt: "2026-01-01" },
  { id: "u2", username: "volunteer", role: "AvVolunteer", requiresPasswordChange: false, createdAt: "2026-01-02" },
];

const DEVICES = [
  {
    id: "d1",
    deviceType: "obs",
    label: "Main OBS",
    host: "192.168.1.100",
    port: 4455,
    metadata: { streamTitleTemplate: "{Date} – {Speaker} – {Title}" },
    features: {},
    enabled: true,
    createdAt: "2026-01-01",
  },
];

test.describe("Admin User Management", () => {
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

    await page.route("**/api/admin/users", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USERS) });
      } else if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "u3", ...body }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/admin/users/*", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(USERS[0]) });
      } else if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });
  });

  test("user CRUD flow", async ({ page }) => {
    await page.goto("/admin/users");
    await expect(page.getByTestId(TEST_ID_ADMIN_USERS_PAGE)).toBeVisible({ timeout: 10000 });

    // List renders with list+detail panel layout
    await expect(page.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toBeVisible();
    await expect(page.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeVisible();

    // Create user via Add User button → detail panel form
    await page.getByTestId(TEST_ID_ADD_USER_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_USER_FORM_USERNAME)).toBeVisible();
    await page.getByTestId(TEST_ID_USER_FORM_USERNAME).locator("input").fill("newuser");
    await page.getByTestId(TEST_ID_USER_FORM_PASSWORD).locator("input").fill("pass123");
    await page.getByTestId(TEST_ID_USER_FORM_SAVE).click();

    // Edit user — click list item to open in detail panel
    await page.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`).click();
    await expect(page.getByTestId(TEST_ID_USER_FORM_USERNAME)).toBeVisible();
    await page.getByTestId(TEST_ID_USER_FORM_SAVE).click();

    // Delete user via list delete button
    await page.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u2`).click();
    // Confirm deletion in the confirmation modal
    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();
  });
});

test.describe("Admin Device Management", () => {
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

    await page.route("**/api/admin/devices", async (route) => {
      if (route.request().method() === "GET") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DEVICES) });
      } else if (route.request().method() === "POST") {
        const body = route.request().postDataJSON();
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ id: "d2", ...body }),
        });
      } else {
        await route.continue();
      }
    });

    await page.route("**/api/admin/devices/*", async (route) => {
      if (route.request().method() === "PUT") {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(DEVICES[0]) });
      } else if (route.request().method() === "DELETE") {
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
    });
  });

  test("device CRUD flow", async ({ page }) => {
    await page.goto("/admin/devices");
    await expect(page.getByTestId(TEST_ID_ADMIN_DEVICES_PAGE)).toBeVisible({ timeout: 10000 });

    // List renders with list+detail panel layout
    await expect(page.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`)).toBeVisible();

    // Create device via Add Device button → type dropdown → detail panel form
    await page.getByTestId(TEST_ID_ADD_DEVICE_BUTTON).click();
    await page.getByTestId(`${TEST_ID_ADD_DEVICE_TYPE_OPTION}-obs`).click();
    await expect(page.getByTestId(TEST_ID_DEVICE_FORM_LABEL)).toBeVisible();
    await page.getByTestId(TEST_ID_DEVICE_FORM_LABEL).locator("input").fill("Backup OBS");
    await page.getByTestId(TEST_ID_DEVICE_FORM_HOST).locator("input").fill("192.168.1.200");
    await page.getByTestId(TEST_ID_DEVICE_FORM_SAVE).click();

    // Edit device — click list item to open in detail panel
    await page.getByTestId(`${TEST_ID_DEVICE_LIST_ITEM}-d1`).click();
    await expect(page.getByTestId(TEST_ID_DEVICE_FORM_LABEL)).toBeVisible();
    await page.getByTestId(TEST_ID_DEVICE_FORM_SAVE).click();

    // Delete device via list delete button
    await page.getByTestId(`${TEST_ID_DEVICE_LIST_DELETE_BUTTON}-d1`).click();
    // Confirm deletion in the confirmation modal
    await page.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON).click();
  });
});
