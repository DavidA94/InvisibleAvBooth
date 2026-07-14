import { test, expect } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeSocketIo, routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { sessionManifestDefault } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import type { TemplatePayload } from "../fixtures/payloads/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_EDIT_DETAILS_BUTTON,
  TEST_ID_SESSION_MANIFEST_MODAL,
  TEST_ID_MANIFEST_TITLE_TEMPLATE,
  TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE,
  TEST_ID_MANIFEST_SPEAKER,
  TEST_ID_MANIFEST_TITLE,
  TEST_ID_MANIFEST_SAVE,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

// Multiple templates so auto-select doesn't fire (need user to choose)
const multipleTemplates: TemplatePayload[] = [
  { id: "t1", name: "Speaker and Title", category: "title", formatString: "{Date} – {Speaker} – {Title}", roleMinimum: "AvVolunteer" },
  { id: "t2", name: "Scripture Only", category: "title", formatString: "{Date} – {Scripture}", roleMinimum: "AvVolunteer" },
  { id: "t3", name: "Full Description", category: "description", formatString: "{Speaker}: {Title}", roleMinimum: "AvVolunteer" },
  { id: "t4", name: "None", category: "description", formatString: "", roleMinimum: "AvVolunteer" },
];

async function loginAndOpenModal(page: Parameters<typeof test>[1]["page"]): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });

  // Open manifest modal
  const editButton = page.getByTestId(TEST_ID_EDIT_DETAILS_BUTTON);
  await expect(editButton).toBeVisible({ timeout: 10000 });
  await editButton.click();
  await expect(page.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeVisible({ timeout: 5000 });
}

test.describe("Session manifest modal template selection workflow", () => {
  test("shows template dropdowns and message before selection", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page, multipleTemplates);
    await routeSocketIo(page, undefined, sessionManifestDefault());

    await loginAndOpenModal(page);

    // Template dropdowns should be visible
    await expect(page.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).toBeVisible();
    await expect(page.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE)).toBeVisible();

    // Before selecting templates, fields should NOT be shown
    // and a message should tell the user to select templates
    await expect(page.getByText("Select a title format")).toBeVisible();
  });
});
