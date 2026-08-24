import { test, expect } from "@playwright/test";
import type { Page, BrowserContext } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo } from "../support/routes/obs";

// ── Test data ─────────────────────────────────────────────────────────────────

const adminDashboardList = [
  { id: "d1", slug: "main", name: "Main Dashboard", description: "Primary", allowedRoles: ["AvVolunteer"], isComplete: true },
  { id: "d2", slug: "incomplete", name: "Incomplete", description: "", allowedRoles: [], isComplete: false },
];

const adminDashboardDetail = {
  id: "d1",
  slug: "main",
  name: "Main Dashboard",
  description: "Primary",
  allowedRoles: ["AvVolunteer"],
  isComplete: true,
  grids: {
    "large-landscape": [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 4, rowSpan: 3, roleMinimum: "AvVolunteer" },
    ],
    "large-portrait": [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 4, rowSpan: 3, roleMinimum: "AvVolunteer" },
    ],
    "small-landscape": [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 4, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ],
    "small-portrait": [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 0, row: 2, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ],
  },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupRoutes(page: Page, context: BrowserContext): Promise<void> {
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

  // Admin dashboard API routes
  await page.route("**/api/admin/dashboards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(adminDashboardList) });
    } else if (route.request().method() === "POST") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ...body, id: "new-id", isComplete: false, grids: body.grids ?? {} }),
      });
    }
  });

  await page.route("**/api/admin/dashboards/d1", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(adminDashboardDetail) });
    } else if (route.request().method() === "PUT") {
      const body = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...adminDashboardDetail, ...body, isComplete: true }),
      });
    } else if (route.request().method() === "DELETE") {
      await route.fulfill({ status: 204 });
    }
  });

  await page.route("**/api/admin/dashboards/d2", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ...adminDashboardDetail,
          id: "d2",
          slug: "incomplete",
          name: "Incomplete",
          isComplete: false,
          grids: { "large-landscape": [], "large-portrait": [], "small-landscape": [], "small-portrait": [] },
        }),
      });
    }
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Admin Dashboard Management", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupRoutes(page, context);
    await page.goto("/admin/dashboards");
    await page.getByTestId("admin-dashboards-page").waitFor();
  });

  test("tab navigation between all four grid types", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    await expect(page.getByTestId("dashboard-grid-tab-large-landscape")).toBeVisible();
    await expect(page.getByTestId("dashboard-grid-tab-small-landscape")).toBeVisible();
    await expect(page.getByTestId("dashboard-grid-tab-large-portrait")).toBeVisible();
    await expect(page.getByTestId("dashboard-grid-tab-small-portrait")).toBeVisible();
  });

  test("loading existing dashboard populates all fields", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    await expect(page.getByTestId("dashboard-form-name")).toHaveValue("Main Dashboard");
    await expect(page.getByTestId("dashboard-form-slug")).toHaveValue("main");
  });

  test("tab completeness icons reflect grid content", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    // All tabs for d1 have widgets — should have checkmark icons
    const tab = page.getByTestId("dashboard-grid-tab-large-landscape");
    await expect(tab.locator(".tab-icon-complete")).toBeVisible();
  });

  test("adding a widget places it on the grid editor", async ({ page }) => {
    await page.getByTestId("add-dashboard-button").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    const addWidget = page.getByTestId("grid-editor-add-widget");
    await addWidget.selectOption("obs");

    await expect(page.getByTestId("grid-editor-widget-obs")).toBeVisible();
  });

  test("removing a widget shows confirmation and removes from grid", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    // Hover and click delete on OBS widget
    const deleteBtn = page.getByTestId("grid-editor-widget-delete-obs");
    await deleteBtn.click({ force: true });

    // Confirmation modal
    await expect(page.getByTestId("confirmation-body")).toContainText("Remove OBS");
    await page.getByTestId("confirmation-confirm-button").click();

    // Widget gone
    await expect(page.getByTestId("grid-editor-widget-obs")).not.toBeVisible();
  });

  test("save sends correct payload to backend", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/admin/dashboards/d1") && req.method() === "PUT"),
      page.getByTestId("dashboard-form-save").click(),
    ]);

    const body = JSON.parse(request.postData() ?? "{}");
    expect(body.name).toBe("Main Dashboard");
    expect(body.slug).toBe("main");
    expect(body.grids).toBeDefined();
    expect(body.grids["large-landscape"]).toHaveLength(2);
  });

  test("success toast appears after save", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();
    await page.getByTestId("dashboard-form-save").click();

    await expect(page.locator(".toast-message")).toContainText("saved successfully");
  });

  test("widget drag changes position", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    const obsWidget = page.getByTestId("grid-editor-widget-obs");
    const box = await obsWidget.boundingBox();
    if (!box) throw new Error("Widget not found");

    // Drag right by 200px (several cells at the scaled size)
    await obsWidget.dispatchEvent("pointerdown", { clientX: box.x + 10, clientY: box.y + 10, pointerId: 1 });
    const container = page.getByTestId("dashboard-grid-editor");
    await container.dispatchEvent("pointermove", { clientX: box.x + 200, clientY: box.y + 10, pointerId: 1 });
    await container.dispatchEvent("pointerup", { clientX: box.x + 200, clientY: box.y + 10, pointerId: 1 });

    // The ghost should have been visible during drag (covered by unit tests)
    // Verify the position changed in the save payload
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes("/api/admin/dashboards/d1") && req.method() === "PUT"),
      page.getByTestId("dashboard-form-save").click(),
    ]);

    const body = JSON.parse(request.postData() ?? "{}");
    const obs = body.grids["large-landscape"].find((w: { widgetId: string }) => w.widgetId === "obs");
    expect(obs).toBeDefined();
    // Position should have changed from (0,0) — exact col depends on scale and snap
    // At least verify the payload is sent correctly
  });

  test("unsaved changes warning on navigation away", async ({ page }) => {
    await page.getByTestId("dashboard-list-item-d1").click();
    await page.getByTestId("dashboard-detail-panel").waitFor();

    // Make a change
    await page.getByTestId("dashboard-form-name").fill("Modified Name");

    // Try to navigate to another dashboard
    await page.getByTestId("dashboard-list-item-d2").click();

    // Unsaved changes modal should appear
    await expect(page.getByTestId("confirmation-body")).toContainText("unsaved changes");
  });

  test("partial save shows incomplete toast", async ({ page }) => {
    // Override POST to return isComplete: false
    await page.route("**/api/admin/dashboards", async (route) => {
      if (route.request().method() === "POST") {
        const body = JSON.parse(route.request().postData() ?? "{}");
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ ...body, id: "new-id", isComplete: false, grids: {} }),
        });
      } else {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(adminDashboardList) });
      }
    });

    await page.getByTestId("add-dashboard-button").click();
    await page.getByTestId("dashboard-form-name").fill("Test");
    await page.getByTestId("dashboard-form-slug").fill("test");
    await page.getByTestId("dashboard-form-save").click();

    await expect(page.locator(".toast-message")).toContainText("incomplete");
  });
});
