import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_LOWER_THIRD_WIDGET,
  TEST_ID_LT_ACTIVE_SECTION,
  TEST_ID_LT_LIBRARY_SECTION,
  TEST_ID_LT_SHOW_BUTTON,
  TEST_ID_LT_ADD_DIALOG,
  TEST_ID_LT_ADD_TITLE_INPUT,
  TEST_ID_LT_ADD_SAVE,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const titleItem = {
  id: "item-1",
  type: "Title",
  style: "blue_rhombus",
  content: { title: "John Smith" },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  pages: null,
};

const activeItem = {
  ...titleItem,
  id: "item-active",
  content: { title: "Active Speaker" },
  used: true,
};

function lowerThirdState(overrides = {}): Record<string, unknown> {
  return {
    active: null,
    library: [titleItem],
    phase: "hidden",
    autoDismissAt: null,
    overlayConnected: true,
    overlayResolutionCorrect: true,
    transitionLocked: false,
    overlayStale: false,
    ...overrides,
  };
}

interface SocketHandle {
  sendLowerThirdState: (state: Record<string, unknown>) => void;
  lastCommand: () => unknown | null;
}

async function setupSocketWithLowerThirds(page: Page, initialState = lowerThirdState()): Promise<SocketHandle> {
  let lastCmd: unknown | null = null;
  const connections: WebSocketRoute[] = [];

  function broadcast(message: string): void {
    for (const ws of connections) {
      try {
        ws.send(message);
      } catch {
        /* closed */
      }
    }
  }

  const handle: SocketHandle = {
    sendLowerThirdState: (state) => {
      broadcast(`42["stc:lower-third:state",${JSON.stringify(state)}]`);
    },
    lastCommand: () => lastCmd,
  };

  await page.routeWebSocket("**/socket.io/*", (ws) => {
    connections.push(ws);
    ws.send('0{"sid":"mock-ws-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');

    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : "";
      if (text === "2") {
        ws.send("3");
        return;
      }
      if (text === "40") {
        ws.send('40{"sid":"mock-ws-sid"}');
        return;
      }

      if (text.includes('"cts:request:initial:state"')) {
        ws.send(
          `42["stc:obs:state",${JSON.stringify({ connected: true, streaming: false, recording: false, commandedState: { streaming: false, recording: false } })}]`,
        );
        ws.send(
          `42["stc:session:manifest:updated",${JSON.stringify({ manifest: {}, interpolatedStreamTitle: "", interpolatedDescription: "", manifestReady: false })}]`,
        );
        ws.send(`42["stc:relay:state",${JSON.stringify({ running: false, obsConnected: false })}]`);
        ws.send(`42["stc:platform:readiness",${JSON.stringify({ platforms: [] })}]`);
        ws.send(`42["stc:lower-third:state",${JSON.stringify(initialState)}]`);
        return;
      }

      if (text.includes('"cts:lower-third:command"')) {
        const match = text.match(/^(\d+)\["cts:lower-third:command",(.*)\]$/);
        if (match) {
          lastCmd = JSON.parse(match[2]!);
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
    });
  });

  return handle;
}

async function setupDashboardWithLowerThirds(page: Page): Promise<void> {
  await page.route("**/api/dashboards", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "default", name: "Main", description: "" }]) });
  });
  await page.route("**/api/dashboards/*/layout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        cells: [{ widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 0, colSpan: 3, rowSpan: 3, roleMinimum: "AvVolunteer" }],
      }),
    });
  });
}

async function loginAndNavigate(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_LOWER_THIRD_WIDGET)).toBeVisible({ timeout: 15000 });
}

// ── F23: Active section display ──────────────────────────────────────────────

test.describe("Lower-third widget — Active section", () => {
  test("shows 'Nothing active' when no item is active", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page, lowerThirdState({ active: null }));
    await loginAndNavigate(page);

    const activeSection = page.getByTestId(TEST_ID_LT_ACTIVE_SECTION);
    await expect(activeSection).toBeVisible();
    await expect(activeSection).toContainText("Nothing active");
  });

  test("shows active item with dismiss button", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page, lowerThirdState({ active: activeItem, phase: "visible", library: [] }));
    await loginAndNavigate(page);

    const activeSection = page.getByTestId(TEST_ID_LT_ACTIVE_SECTION);
    await expect(activeSection).toContainText("Active Speaker");
    await expect(page.getByLabel("Dismiss")).toBeVisible();
  });
});

// ── F24: Library section display ─────────────────────────────────────────────

test.describe("Lower-third widget — Library section", () => {
  test("shows library items with Show button", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const librarySection = page.getByTestId(TEST_ID_LT_LIBRARY_SECTION);
    await expect(librarySection).toBeVisible();
    await expect(librarySection).toContainText("John Smith");
  });

  test("shows 'No items available' when library is empty", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page, lowerThirdState({ library: [] }));
    await loginAndNavigate(page);

    const librarySection = page.getByTestId(TEST_ID_LT_LIBRARY_SECTION);
    await expect(librarySection).toContainText("No items available");
  });
});

// ── F25: Show (preview dialog) → "Go Live" activation ───────────────────────

test.describe("Lower-third widget — Show (activate)", () => {
  test("Show button sends activate command directly", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    const socket = await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    // Click Show button on library item (directly activates — no preview dialog in implementation)
    const showBtn = page.getByTestId(TEST_ID_LT_SHOW_BUTTON);
    await expect(showBtn).toBeVisible();
    await showBtn.click();

    await page.waitForTimeout(100);
    expect(socket.lastCommand()).toEqual({ type: "activate", itemId: "item-1" });
  });
});

// ── F26: Add to library ──────────────────────────────────────────────────────

test.describe("Lower-third widget — Add to library", () => {
  test("Add button opens type dropdown, Title type opens dialog, save sends command", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    const socket = await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    // Click Add button (IonButton renders as ion-button element)
    const addButton = page.locator("ion-button", { hasText: "Add" });
    await expect(addButton).toBeVisible();
    await addButton.click();

    // Type dropdown should appear — click Title (exact match to avoid "Title + Subtitle")
    await page
      .locator(".lt-add-option")
      .filter({ hasText: /^Title$/ })
      .click();

    // Add dialog should appear
    await expect(page.getByTestId(TEST_ID_LT_ADD_DIALOG)).toBeVisible({ timeout: 3000 });

    // Fill in title
    await page.getByTestId(TEST_ID_LT_ADD_TITLE_INPUT).locator("input").fill("New Speaker");

    // Save
    await page.getByTestId(TEST_ID_LT_ADD_SAVE).click();

    await page.waitForTimeout(100);
    const cmd = socket.lastCommand() as { type: string; input: { type: string; content: { title: string } } };
    expect(cmd.type).toBe("add-to-library");
    expect(cmd.input.type).toBe("Title");
    expect(cmd.input.content.title).toBe("New Speaker");
  });
});

// ── F28-F29: Empty states and overlay connection ─────────────────────────────

test.describe("Lower-third widget — Overlay connection indicator", () => {
  const templateItem = { ...titleItem, id: "item-tmpl", source: "template", templateId: "t1", templateName: "Speaker" };

  test("shows unhealthy indicator when overlay is not connected", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    // Must include a template item so hasTemplates=true (otherwise status is always "inactive")
    await setupSocketWithLowerThirds(page, lowerThirdState({ overlayConnected: false, library: [templateItem] }));
    await loginAndNavigate(page);

    await expect(page.locator(".widget-dot-unhealthy")).toBeVisible({ timeout: 3000 });
  });

  test("shows healthy indicator when overlay is connected", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page, lowerThirdState({ overlayConnected: true, library: [templateItem] }));
    await loginAndNavigate(page);

    await expect(page.locator(".widget-dot-healthy")).toBeVisible({ timeout: 3000 });
  });
});
