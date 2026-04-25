import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";

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

    // Set auth cookie so full-page navigations preserve auth state
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
    await expect(page.getByTestId("admin-users-page")).toBeVisible({ timeout: 10000 });

    // List renders
    await expect(page.getByTestId("user-row-u1")).toBeVisible();
    await expect(page.getByTestId("user-row-u2")).toBeVisible();

    // Create user
    await page.getByTestId("create-username").locator("input").fill("newuser");
    await page.getByTestId("create-password").locator("input").fill("pass123");
    await page.getByTestId("create-user-submit").click();

    // Edit user
    await page.getByTestId("edit-btn-u2").click();
    await expect(page.getByTestId("edit-username")).toBeVisible();
    await page.getByTestId("edit-save").click();

    // Delete user
    await page.getByTestId("delete-btn-u2").click();
  });
});

test.describe("Admin Device Management", () => {
  test.beforeEach(async ({ page, context }) => {
    await routeAuthLogin(page);
    await routeAuthCheck(page);
    await routeSocketIo(page);

    // Set auth cookie so full-page navigations preserve auth state
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
    await expect(page.getByTestId("admin-devices-page")).toBeVisible({ timeout: 10000 });

    // List renders
    await expect(page.getByTestId("device-row-d1")).toBeVisible();

    // Create device
    await page.getByTestId("create-device-label").locator("input").fill("Backup OBS");
    await page.getByTestId("create-device-host").locator("input").fill("192.168.1.200");
    await page.getByTestId("create-device-submit").click();

    // Edit device
    await page.getByTestId("edit-device-btn-d1").click();
    await expect(page.getByTestId("edit-device-label")).toBeVisible();
    await page.getByTestId("edit-device-save").click();

    // Delete device
    await page.getByTestId("delete-device-btn-d1").click();
  });
});
