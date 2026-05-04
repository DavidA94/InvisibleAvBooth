import type { Page } from "@playwright/test";

export async function routePlatformHealthApi(page: Page): Promise<void> {
  await page.route("**/api/platforms/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ platformType: "youtube", enabled: true, healthy: true }]),
    });
  });
}

export async function routeAdminPlatformsApi(page: Page): Promise<void> {
  await page.route("**/api/admin/platforms", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) });
    } else {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    }
  });
}
