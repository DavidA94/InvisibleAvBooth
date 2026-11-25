import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_LOWER_THIRD_WIDGET,
  TEST_ID_LOWER_THIRD_DISMISS_BUTTON,
  TEST_ID_LOWER_THIRD_EXPAND_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_VIEW,
  TEST_ID_LOWER_THIRD_EXPANDED_VERSES,
  TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON,
} from "../../src/constants/testIds";

/**
 * Expanded View flow (lower-thirds spec Req 5.23-5.27): the active scripture row gets an Expand
 * button; it opens a text-only modal with pagination, Force Clear (bottom-left), Close and
 * Dismiss and close (bottom-right).
 */

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const verses = [
  { verseNumber: 1, text: "In the beginning God created the heaven and the earth." },
  { verseNumber: 2, text: "And the earth was without form, and void." },
  { verseNumber: 3, text: "And God said, Let there be light." },
];

function scripture(currentPage: number): Record<string, unknown> {
  return {
    id: "item-scripture",
    type: "Scripture",
    style: "blue_rhombus",
    content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 }, formattedReference: "Genesis 1:1-3", verses },
    autoDismissMs: null,
    source: "volunteer",
    templateId: null,
    templateName: null,
    used: true,
    createdAt: "2026-01-01T00:00:00Z",
    pages: {
      totalPages: 2,
      currentPage,
      pages: [
        { pageNumber: 1, startVerse: 1, endVerse: 2 },
        { pageNumber: 2, startVerse: 3, endVerse: 3 },
      ],
      useWideWidth: false,
    },
  };
}

const titleItem = {
  id: "item-title",
  type: "Title",
  style: "blue_rhombus",
  content: { title: "John Smith" },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: true,
  createdAt: "2026-01-01T00:00:00Z",
  pages: null,
};

function lowerThirdState(overrides = {}): Record<string, unknown> {
  return {
    active: scripture(1),
    library: [],
    phase: "visible",
    autoDismissAt: null,
    overlayConnected: true,
    overlayResolutionCorrect: true,
    transitionLocked: false,
    overlayStale: false,
    ...overrides,
  };
}

interface SocketHandle {
  commands: () => unknown[];
  sendLowerThirdState: (state: Record<string, unknown>) => void;
}

async function setupSocket(page: Page, initialState: Record<string, unknown>): Promise<SocketHandle> {
  const commands: unknown[] = [];
  const connections: WebSocketRoute[] = [];
  await page.routeWebSocket("**/socket.io/*", (ws: WebSocketRoute) => {
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
  return {
    commands: () => commands,
    sendLowerThirdState: (state) => {
      for (const ws of connections) {
        try {
          ws.send(`42["stc:lower-third:state",${JSON.stringify(state)}]`);
        } catch {
          /* closed */
        }
      }
    },
  };
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

async function openWidget(page: Page, state: Record<string, unknown> = lowerThirdState()): Promise<SocketHandle> {
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

async function rootFontSize(page: Page): Promise<number> {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
}

test.describe("Lower-third widget — Expanded View", () => {
  test("Expand sits left of Dismiss with a double gap", async ({ page }) => {
    await openWidget(page);

    const expand = await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).boundingBox();
    const dismiss = await page.getByTestId(TEST_ID_LOWER_THIRD_DISMISS_BUTTON).boundingBox();
    const rem = await rootFontSize(page);

    expect(expand!.x + expand!.width).toBeLessThan(dismiss!.x);
    // Row gap is 0.5rem; Expand → Dismiss must be double (1rem).
    expect(dismiss!.x - (expand!.x + expand!.width)).toBeGreaterThanOrEqual(rem - 1);
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON)).toContainText("Expand");
  });

  test("opens a text-only view of the current page with the footer laid out per spec", async ({ page }) => {
    await openWidget(page);
    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).click();

    const verseList = page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VERSES);
    await expect(verseList).toContainText("In the beginning");
    await expect(verseList).not.toContainText("Let there be light");

    const forceClear = page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON);
    const close = page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON);
    const dismissAndClose = page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON);
    const forceClearBox = await forceClear.boundingBox();
    const closeBox = await close.boundingBox();
    const dismissBox = await dismissAndClose.boundingBox();
    const rem = await rootFontSize(page);

    // Force Clear is at the left, well apart from the right-hand group; Close precedes Dismiss and close.
    expect(forceClearBox!.x + forceClearBox!.width).toBeLessThan(closeBox!.x);
    expect(closeBox!.x - (forceClearBox!.x + forceClearBox!.width)).toBeGreaterThanOrEqual(4 * rem);
    expect(closeBox!.x + closeBox!.width).toBeLessThan(dismissBox!.x);

    for (const button of [forceClear, close, dismissAndClose]) {
      const height = await button.evaluate((element) => (element as HTMLElement).offsetHeight);
      expect(height).toBeGreaterThanOrEqual(2.75 * rem - 1);
    }
  });

  test("paginating in the modal sends page-next and the view follows the new page", async ({ page }) => {
    const socket = await openWidget(page);
    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).click();
    const view = page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW);

    await view.getByLabel("Next page").click();
    await expect.poll(() => socket.commands()).toEqual([{ type: "page-next" }]);

    socket.sendLowerThirdState(lowerThirdState({ active: scripture(2) }));
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VERSES)).toContainText("Let there be light");
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VERSES)).not.toContainText("In the beginning");
  });

  test("Dismiss and close sends dismiss-active and closes the modal at once", async ({ page }) => {
    const socket = await openWidget(page);
    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).click();

    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON).click();

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW)).toBeHidden();
    await expect.poll(() => socket.commands()).toEqual([{ type: "dismiss-active" }]);
  });

  test("Force Clear sends force-clear with no confirmation and closes the modal", async ({ page }) => {
    const socket = await openWidget(page);
    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).click();

    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON).click();

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW)).toBeHidden();
    await expect.poll(() => socket.commands()).toEqual([{ type: "force-clear" }]);
  });

  test("Close closes the modal and sends nothing", async ({ page }) => {
    const socket = await openWidget(page);
    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).click();

    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON).click();

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW)).toBeHidden();
    expect(socket.commands()).toEqual([]);
  });

  test("closes by itself when the server clears the active item, and does not reopen", async ({ page }) => {
    const socket = await openWidget(page);
    await page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON).click();
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW)).toBeVisible();

    socket.sendLowerThirdState(lowerThirdState({ active: null, phase: "hidden" }));
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW)).toBeHidden();

    socket.sendLowerThirdState(lowerThirdState());
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON)).toBeVisible();
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VIEW)).toBeHidden();
  });

  test("no Expand button for an active Title item", async ({ page }) => {
    await openWidget(page, lowerThirdState({ active: titleItem }));

    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_DISMISS_BUTTON)).toBeVisible();
    await expect(page.getByTestId(TEST_ID_LOWER_THIRD_EXPAND_BUTTON)).toHaveCount(0);
  });
});
