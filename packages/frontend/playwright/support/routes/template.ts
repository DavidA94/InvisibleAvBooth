import type { Page } from "@playwright/test";
import { templateList } from "../../fixtures/payloads/template";
import type { TemplatePayload } from "../../fixtures/payloads/template";

export async function routeTemplatesApi(page: Page, templates?: TemplatePayload[]): Promise<void> {
  await page.route("**/api/templates", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(templates ?? templateList()),
    });
  });
}

export async function routeAdminTemplatesApi(page: Page, templates?: TemplatePayload[]): Promise<void> {
  const data = templates ?? templateList();
  await page.route("**/api/admin/templates", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(data) });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "new", ...JSON.parse(route.request().postData() ?? "{}") }),
      });
    }
  });

  await page.route("**/api/admin/templates/validate", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ blockers: [], warnings: [] }) });
  });
}
