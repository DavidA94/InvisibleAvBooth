import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_LOWER_THIRD_WIDGET,
  TEST_ID_LOWER_THIRD_SHOW_BUTTON,
  TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON,
  TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER,
  TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION,
} from "../../src/constants/testIds";

/**
 * Show page flow (lower-thirds spec Req 5.19-5.22): a multi-page scripture gets a "Show page" button
 * left of Show; tapping it lists the pages; choosing one sends activate with startPage.
 * Runs against the real Ionic popover (unit tests mock it), so touch-target sizes are checked here.
 */

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const baseItem = {
  style: "blue_rhombus",
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
};

const multiPageScripture = {
  ...baseItem,
  id: "item-scripture",
  type: "Scripture",
  content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 5 }, formattedReference: "Genesis 1:1-5", verses: [] },
  pages: {
    totalPages: 3,
    currentPage: 1,
    pages: [
      { pageNumber: 1, startVerse: 1, endVerse: 2 },
      { pageNumber: 2, startVerse: 3, endVerse: 4 },
      { pageNumber: 3, startVerse: 5, endVerse: 5 },
    ],
    useWideWidth: false,
  },
};

const singlePageScripture = {
  ...multiPageScripture,
  id: "item-single",
  content: { reference: { bookId: 1, chapter: 1, verse: 1 }, formattedReference: "Genesis 1:1", verses: [] },
  createdAt: "2026-01-01T00:00:01Z",
  pages: { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }], useWideWidth: false },
};

const titleItem = {
  ...baseItem,
  id: "item-title",
  type: "Title",
  content: { title: "John Smith" },
  createdAt: "2026-01-01T00:00:02Z",
  pages: null,
};

function lowerThirdState(overrides = {}): Record<string, unknown> {
  return {
    active: null,
    library: [multiPageScripture],
    phase: "hidden",
    autoDismissAt: null,
    overlayConnected: true,
    overlayResolutionCorrect: true,
    transitionLocked: false,
    overlayStale: false,
    ...overrides,
  };
}

async function setupSocket(page: Page, initialState: Record<string, unknown>): Promise<{ commands: () => unknown[] }> {
  const commands: unknown[] = [];
  await page.routeWebSocket("**/socket.io/*", (ws: WebSocketRoute) => {
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
      // Socket.io packet "42<ackId>[event, payload]"; the ack reply must be an ACK packet "43<ackId>[result]".
      // Echoing "42<ackId>" sends a malformed EVENT, which makes the client drop and reconnect, and the
      // reconnect replays initial state, which would silently undo state pushed by the test.
      const match = text.match(/^42(\d*)\["cts:lower-third:command",(.*)\]$/);
      if (match) {
        commands.push(JSON.parse(match[2]!));
        ws.send(`43${match[1]}[{"success":true}]`);
      }
    });
  });
  return { commands: () => commands };
}

async function setupDashboard(page: Page): Promise<void> {
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

async function openWidget(page: Page, state: Record<string, unknown>): Promise<{ commands: () => unknown[] }> {
  await routeAuthLogin(page, volunteerLogin);
  await routeAuthCheck(page, volunteerLogin);
  await setupDashboard(page);
  const socket = await setupSocket(page, state);
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_LOWER_THIRD_WIDGET)).toBeVisible({ timeout: 15000 });
  return socket;
}

/** Root font size in px. The dashboard scales it to fit the viewport, so rem assertions must use the live value. */
async function rootFontSize(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
}

test.describe("Lower-third widget — Show page", () => {
  test("button sits left of Show with a double gap", async ({ page }) => {
    await openWidget(page, lowerThirdState());

    const showPage = await page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON).boundingBox();
    const show = await page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_BUTTON).boundingBox();
    const rem = await rootFontSize(page);

    expect(showPage).not.toBeNull();
    expect(show).not.toBeNull();
    expect(showPage!.x + showPage!.width).toBeLessThan(show!.x);
    // Normal row gap is 0.5rem; Show page → Show must be double (1rem).
    expect(show!.x - (showPage!.x + showPage!.width)).toBeGreaterThanOrEqual(rem - 1);
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON)).toContainText("Show page");
  });

  test("lists every page as a 2.75rem+ touch target and sends activate with startPage", async ({ page }) => {
    const socket = await openWidget(page, lowerThirdState());

    await page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).toBeVisible();

    const rem = await rootFontSize(page);
    for (const pageNumber of [1, 2, 3]) {
      const option = page.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-${pageNumber}`);
      await expect(option).toBeVisible();
      // offsetHeight is layout size; boundingBox() includes Ionic's scale-in animation transform on the popover.
      const height = await option.evaluate((element) => (element as HTMLElement).offsetHeight);
      expect(height).toBeGreaterThanOrEqual(2.75 * rem - 1);
    }
    await expect(page.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-2`)).toContainText("Genesis 1:3-4");

    await page.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-2`).click();

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).toBeHidden();
    await expect.poll(() => socket.commands()).toEqual([{ type: "activate", itemId: "item-scripture", startPage: 2 }]);
  });

  test("closing the popover without choosing a page sends nothing", async ({ page }) => {
    const socket = await openWidget(page, lowerThirdState());

    await page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).toBeHidden();
    expect(socket.commands()).toEqual([]);
  });

  test("Show still activates from page 1 with no startPage", async ({ page }) => {
    const socket = await openWidget(page, lowerThirdState());

    await page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_BUTTON).click();

    await expect.poll(() => socket.commands()).toEqual([{ type: "activate", itemId: "item-scripture" }]);
  });

  test("only multi-page scripture rows get the button", async ({ page }) => {
    await openWidget(page, lowerThirdState({ library: [multiPageScripture, singlePageScripture, titleItem] }));

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_BUTTON)).toHaveCount(3);
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON)).toHaveCount(1);
    await expect(page.getByTestId("lower-third-row-item-scripture").getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON)).toBeVisible();
  });

  test("button is disabled while a transition is in progress", async ({ page }) => {
    await openWidget(page, lowerThirdState({ phase: "showing", transitionLocked: true }));

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON)).toBeDisabled();
  });
});
