import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { TEST_ID_LOGIN_USERNAME, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_SUBMIT, TEST_ID_LOWER_THIRD_WIDGET } from "../../src/constants/testIds";

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

const templateItem = {
  ...titleItem,
  id: "item-2",
  source: "template",
  templateId: "tmpl-1",
  templateName: "Speaker Name",
};

function lowerThirdState(overrides = {}) {
  return {
    active: null,
    library: [titleItem, templateItem],
    phase: "hidden",
    autoDismissAt: null,
    overlayConnected: true,
    overlayResolutionCorrect: true,
    transitionLocked: false,
    overlayStale: false,
    ...overrides,
  };
}

function lowerThirdStateWithActive() {
  return lowerThirdState({
    active: titleItem,
    phase: "visible",
    library: [templateItem],
  });
}

interface SocketHandle {
  sendLowerThirdState: (state: ReturnType<typeof lowerThirdState>) => void;
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
        ws.send(`42["stc:obs:state",${JSON.stringify({ connected: false, streaming: false, recording: false })}]`);
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
          lastCmd = JSON.parse(match[2]);
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
    });
  });

  return handle;
}

async function setupDashboardWithLowerThirds(page: Page): Promise<void> {
  await page.route("**/api/dashboards", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([{ id: "default", name: "Main", description: "" }]),
    });
  });
  await page.route("**/api/dashboards/*/layout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        cells: [{ widgetId: "lower-thirds", title: "Lower Thirds", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
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

test.describe("SwipeableRow — mouse swipe", () => {
  test("swipe left reveals left actions on library volunteer item", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    // Find the volunteer item row
    const row = page.locator("[data-testid='lt-row-item-1']").first();
    await expect(row).toBeVisible();

    // The parent of lt-row is .swipeable-content
    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();
    expect(box).not.toBeNull();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    await swipeableContent.dispatchEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointermove", { clientX: centerX - 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointerup", { clientX: centerX - 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(50);
    const transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(-96px)"); // 2 actions × 48px for volunteer item
  });

  test("swipe right reveals right actions (Go Live) on library item", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const row = page.locator("[data-testid='lt-row-item-1']").first();
    await expect(row).toBeVisible();

    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    await swipeableContent.dispatchEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointermove", { clientX: centerX + 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointerup", { clientX: centerX + 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(50);
    const transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(48px)"); // 1 action × 48px
  });

  test("clicking revealed action button sends correct command", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    const socket = await setupSocketWithLowerThirds(page, lowerThirdStateWithActive());
    await loginAndNavigate(page);

    // Find the active row and swipe left to reveal Force Clear
    const activeRow = page.locator("[data-testid='lt-row-item-1']").first();
    await expect(activeRow).toBeVisible();

    const swipeableContent = activeRow.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    await swipeableContent.dispatchEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointermove", { clientX: centerX - 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointerup", { clientX: centerX - 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(50);

    // Verify swipe worked
    const transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(-48px)"); // 1 action (Force Clear) × 48px

    // Click Force Clear button
    const forceClearBtn = page.getByLabel("Force Clear");
    await expect(forceClearBtn).toBeVisible();
    await forceClearBtn.click({ force: true });

    // Verify the command was sent
    await page.waitForTimeout(100);
    expect(socket.lastCommand()).toEqual({ type: "force-clear" });
  });

  test("clicking content area closes revealed actions", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const row = page.locator("[data-testid='lt-row-item-1']").first();
    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Swipe to open
    await swipeableContent.dispatchEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointermove", { clientX: centerX - 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointerup", { clientX: centerX - 30, clientY: centerY, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(50);
    let transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(-96px)");

    // Tap content to close (pointerdown + pointerup with no move)
    await swipeableContent.dispatchEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointerup", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(250);
    transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(0px)");
  });

  test("short drag does not open actions", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const row = page.locator("[data-testid='lt-row-item-1']").first();
    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Very short drag (5px) — should not open (below MIN_DISTANCE_PX)
    await swipeableContent.dispatchEvent("pointerdown", { clientX: centerX, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointermove", { clientX: centerX - 5, clientY: centerY, pointerId: 1, pointerType: "mouse" });
    await swipeableContent.dispatchEvent("pointerup", { clientX: centerX - 5, clientY: centerY, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(50);
    const transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(0px)");
  });
});

test.describe("SwipeableRow — touch swipe", () => {
  test("touch swipe left reveals actions", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const row = page.locator("[data-testid='lt-row-item-1']").first();
    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    // Simulate touch swipe via dispatchEvent with pointerType: touch
    await swipeableContent.dispatchEvent("pointerdown", {
      clientX: centerX,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });
    await swipeableContent.dispatchEvent("pointermove", {
      clientX: centerX - 30,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });
    await swipeableContent.dispatchEvent("pointerup", {
      clientX: centerX - 30,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });

    await page.waitForTimeout(50);
    const transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(-96px)");
  });

  test("touch swipe right reveals Go Live action", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const row = page.locator("[data-testid='lt-row-item-2']").first();
    await expect(row).toBeVisible();
    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    await swipeableContent.dispatchEvent("pointerdown", {
      clientX: centerX,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });
    await swipeableContent.dispatchEvent("pointermove", {
      clientX: centerX + 30,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });
    await swipeableContent.dispatchEvent("pointerup", {
      clientX: centerX + 30,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });

    await page.waitForTimeout(50);
    const transform = await swipeableContent.evaluate((el) => el.style.transform);
    expect(transform).toBe("translateX(48px)");
  });

  test("tapping Go Live action after touch swipe sends activate command", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    const socket = await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    // Template item (item-2) — swipe right reveals Go Live
    const row = page.locator("[data-testid='lt-row-item-2']").first();
    await expect(row).toBeVisible();
    const swipeableContent = row.locator("..");
    const box = await swipeableContent.boundingBox();

    const centerX = box!.x + box!.width / 2;
    const centerY = box!.y + box!.height / 2;

    await swipeableContent.dispatchEvent("pointerdown", {
      clientX: centerX,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });
    await swipeableContent.dispatchEvent("pointermove", {
      clientX: centerX + 30,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });
    await swipeableContent.dispatchEvent("pointerup", {
      clientX: centerX + 30,
      clientY: centerY,
      pointerId: 1,
      pointerType: "touch",
    });

    await page.waitForTimeout(50);

    // Click the Go Live button (force: true to bypass pointer interception)
    const goLiveBtn = page.getByLabel("Go Live").first();
    await expect(goLiveBtn).toBeVisible();
    await goLiveBtn.click({ force: true });

    await page.waitForTimeout(100);
    expect(socket.lastCommand()).toEqual({ type: "activate", itemId: "item-2" });
  });
});

test.describe("SwipeableRow — only one open at a time", () => {
  test("tapping an open row closes it", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithLowerThirds(page);
    await setupSocketWithLowerThirds(page);
    await loginAndNavigate(page);

    const row1 = page.locator("[data-testid='lt-row-item-1']").first();
    const content1 = row1.locator("..");

    const box1 = await content1.boundingBox();

    // Swipe first row open
    await content1.dispatchEvent("pointerdown", { clientX: box1!.x + 50, clientY: box1!.y + 10, pointerId: 1, pointerType: "mouse" });
    await content1.dispatchEvent("pointermove", { clientX: box1!.x + 20, clientY: box1!.y + 10, pointerId: 1, pointerType: "mouse" });
    await content1.dispatchEvent("pointerup", { clientX: box1!.x + 20, clientY: box1!.y + 10, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(100);
    let transform1 = await content1.evaluate((el) => el.style.transform);
    expect(transform1).toBe("translateX(-96px)");

    // Tap content to close (pointerdown + pointerup with no move)
    await content1.dispatchEvent("pointerdown", { clientX: box1!.x + 50, clientY: box1!.y + 10, pointerId: 1, pointerType: "mouse" });
    await content1.dispatchEvent("pointerup", { clientX: box1!.x + 50, clientY: box1!.y + 10, pointerId: 1, pointerType: "mouse" });

    await page.waitForTimeout(250);
    transform1 = await content1.evaluate((el) => el.style.transform);
    expect(transform1).toBe("translateX(0px)");
  });
});
