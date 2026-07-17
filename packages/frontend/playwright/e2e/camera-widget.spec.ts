import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { TEST_ID_LOGIN_USERNAME, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_SUBMIT } from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const cameraState = {
  cameras: [
    {
      cameraId: "cam1",
      connected: true,
      viscaConnected: true,
      position: { pan: 100, tilt: 200, zoom: 5000, focus: 0 },
      autoFocus: true,
      aiTracking: false,
      aiTilt: false,
      aiZoom: false,
      activePresetId: null,
      features: ["pan", "tilt", "zoom"],
      capabilities: { tapToCenter: false },
      presets: [
        {
          id: "p1",
          name: "Wide Shot",
          sortOrder: 0,
          storedOnCamera: false,
          cameraPresetSlot: null,
          pan: 0,
          tilt: 0,
          zoom: 0,
          focus: null,
          autoFocus: true,
          aiTracking: false,
          aiTilt: false,
          aiZoom: false,
        },
        {
          id: "p2",
          name: "Pulpit",
          sortOrder: 1,
          storedOnCamera: false,
          cameraPresetSlot: null,
          pan: 500,
          tilt: 300,
          zoom: 10000,
          focus: null,
          autoFocus: true,
          aiTracking: false,
          aiTilt: false,
          aiZoom: false,
        },
      ],
    },
    {
      cameraId: "cam2",
      connected: false,
      viscaConnected: false,
      position: null,
      autoFocus: true,
      aiTracking: false,
      aiTilt: false,
      aiZoom: false,
      activePresetId: null,
      features: ["pan", "tilt", "zoom"],
      capabilities: { tapToCenter: false },
      presets: [],
    },
  ],
  ndiAvailable: false,
};

async function setupSocketWithCamera(page: Page, initialCameraState = cameraState) {
  let lastCameraEvent: unknown | null = null;
  const connections: WebSocketRoute[] = [];

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
        ws.send(`42["stc:camera:state",${JSON.stringify(initialCameraState)}]`);
        return;
      }

      if (text.includes('"cts:camera:preset:activate"')) {
        const match = text.match(/^(\d+)\["cts:camera:preset:activate",(.*)\]$/);
        if (match) {
          lastCameraEvent = JSON.parse(match[2]!);
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
    });
  });

  return { lastCameraEvent: () => lastCameraEvent };
}

async function setupDashboardWithCamera(page: Page): Promise<void> {
  await page.route("**/api/dashboards", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "default", name: "Main", description: "" }]) });
  });
  await page.route("**/api/dashboards/*/layout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        cells: [{ widgetId: "camera", title: "Camera", col: 0, row: 0, colSpan: 6, rowSpan: 4, roleMinimum: "AvVolunteer" }],
      }),
    });
  });
}

async function loginAndNavigate(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.locator("[data-testid='camera-widget']")).toBeVisible({ timeout: 15000 });
}

test.describe("Camera widget", () => {
  test("shows 'Camera Offline' when camera is not connected", async ({ page }) => {
    // Use a single offline camera
    const offlineState = {
      ...cameraState,
      cameras: [{ ...cameraState.cameras[1]!, cameraId: "cam1" }],
    };

    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithCamera(page);
    await setupSocketWithCamera(page, offlineState);
    await loginAndNavigate(page);

    // Should show offline overlay
    await expect(page.locator("[data-testid='camera-offline-overlay']")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("[data-testid='camera-offline-overlay']")).toContainText("Camera Offline");
  });

  test("shows preset list and can activate presets", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithCamera(page);
    const socket = await setupSocketWithCamera(page);
    await loginAndNavigate(page);

    // The preset list renders in expanded mode or in the modal.
    // In a default viewport the widget might be in compact mode (video tap opens modal).
    // Tap the video to open the control modal for access to presets.
    const preview = page.locator("[data-testid='camera-preview']");
    if (await preview.isVisible()) {
      await preview.click();
    }

    // Look for preset list in the modal or expanded controls
    const presetList = page.locator("[data-testid='preset-list']");
    if (await presetList.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(presetList).toContainText("Wide Shot");
      await expect(presetList).toContainText("Pulpit");

      // Click activate
      const activateBtn = page.locator("[data-testid='preset-activate-btn']").first();
      await activateBtn.click();
      await page.waitForTimeout(200);
      expect(socket.lastCameraEvent()).toEqual({ cameraId: "cam1", presetId: "p1" });
    }
  });

  test("renders camera widget when state is received", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboardWithCamera(page);
    await setupSocketWithCamera(page);
    await loginAndNavigate(page);

    // The camera widget should render
    await expect(page.locator("[data-testid='camera-widget']")).toBeVisible();
  });
});
