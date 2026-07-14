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

// Single templates — auto-select kicks in, fields appear immediately
const singleTemplates: TemplatePayload[] = [
  { id: "t1", name: "Speaker and Title", category: "title", formatString: "{Date} – {Speaker} – {Title}", roleMinimum: "AvVolunteer" },
  { id: "t4", name: "None", category: "description", formatString: "", roleMinimum: "AvVolunteer" },
];

test.describe("Session manifest modal — field generation (F9-F14)", () => {
  test("F9: auto-selected templates show input fields for required tokens", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page, singleTemplates);
    await routeSocketIo(page, undefined, sessionManifestDefault());

    await loginAndOpenModal(page);

    // With single title template, auto-select fires → fields appear
    // Template "{Date} – {Speaker} – {Title}" requires Speaker and Title inputs
    await expect(page.getByTestId("manifest-speaker")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("manifest-title")).toBeVisible({ timeout: 5000 });
  });

  test("F10: Save button and fields are present when templates are selected", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page, singleTemplates);
    await routeSocketIo(page, undefined, sessionManifestDefault());

    await loginAndOpenModal(page);

    // Fields should be visible (auto-selected)
    await expect(page.getByTestId("manifest-speaker")).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId("manifest-title")).toBeVisible({ timeout: 5000 });

    // Save button should be present
    const saveBtn = page.getByTestId("manifest-save");
    await expect(saveBtn).toBeVisible();

    // User can fill fields
    await page.getByTestId("manifest-speaker").locator("input").fill("Pastor John");
    await page.getByTestId("manifest-title").locator("input").fill("Grace");
  });
});
