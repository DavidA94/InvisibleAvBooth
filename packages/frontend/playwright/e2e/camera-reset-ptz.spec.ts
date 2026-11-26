import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { obsStateDefault } from "../fixtures/payloads/obs";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_CAMERA_WIDGET,
  TEST_ID_CAMERA_GRID_OVERLAY,
  TEST_ID_CAMERA_RESET_PTZ_BUTTON,
  TEST_ID_CAMERA_RESET_PTZ_HINT,
} from "../../src/constants/testIds";

// Non-ADMIN: ADMIN users are redirected to /admin after login. Reset PTZ is available to every role.
const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const cameraState = {
  cameras: [
    {
      cameraId: "cam1",
      label: "Main Camera",
      connected: true,
      viscaConnected: true,
      position: { pan: 100, tilt: 200, zoom: 5000, focus: 0 },
      autoFocus: true,
      aiTracking: false,
      aiTilt: false,
      aiZoom: false,
      activePresetId: null,
      features: ["pan", "tilt", "zoom"],
      capabilities: { tapToCenter: true },
      presets: [],
    },
  ],
  ndiAvailable: false,
};

interface SocketHandle {
  resetRequests: () => unknown[];
  push: (event: string, payload: unknown) => void;
}

async function setupSocket(page: Page, resetResult: { success: boolean; error?: string } = { success: true }): Promise<SocketHandle> {
  const resetRequests: unknown[] = [];
  const connections: WebSocketRoute[] = [];

  await page.routeWebSocket("**/socket.io/*", (ws) => {
    connections.push(ws);
    ws.send('0{"sid":"mock-ws-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');

    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : "";
      if (text === "2") return void ws.send("3");
      if (text === "40") return void ws.send('40{"sid":"mock-ws-sid"}');

      if (text.includes('"cts:request:initial:state"')) {
        ws.send(`42["stc:obs:state",${JSON.stringify(obsStateDefault())}]`);
        ws.send(
          `42["stc:session:manifest:updated",${JSON.stringify({ manifest: {}, interpolatedStreamTitle: "", interpolatedDescription: "", manifestReady: true })}]`,
        );
        ws.send(`42["stc:relay:state",${JSON.stringify({ running: false, obsConnected: false })}]`);
        ws.send(`42["stc:platform:readiness",${JSON.stringify({ platforms: [] })}]`);
        ws.send(`42["stc:camera:state",${JSON.stringify(cameraState)}]`);
        return;
      }

      // Socket.io packet "42<ackId>[...]" is an event expecting an ack; the ack reply is "43<ackId>[...]".
      const match = text.match(/^42(\d+)\["cts:camera:ptz:reset",(.*)\]$/);
      if (match) {
        resetRequests.push(JSON.parse(match[2]!));
        ws.send(`43${match[1]}[${JSON.stringify(resetResult)}]`);
      }
    });
  });

  return {
    resetRequests: () => resetRequests,
    push: (event, payload) => connections.forEach((ws) => ws.send(`42["${event}",${JSON.stringify(payload)}]`)),
  };
}

async function setupDashboard(page: Page): Promise<void> {
  await page.route("**/api/dashboards", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([{ id: "default", name: "Main", description: "" }]) }),
  );
  await page.route("**/api/dashboards/*/layout", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        version: 1,
        cells: [{ widgetId: "camera", title: "Camera", col: 0, row: 0, colSpan: 6, rowSpan: 4, roleMinimum: "AvVolunteer" }],
      }),
    }),
  );
}

async function openDashboard(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_CAMERA_WIDGET)).toBeVisible({ timeout: 15000 });
}

test.describe("Camera Reset PTZ", () => {
  test.beforeEach(async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
  });

  test("sends a reset for the selected camera when idle", async ({ page }) => {
    const socket = await setupSocket(page);
    await openDashboard(page);

    const button = page.getByTestId(TEST_ID_CAMERA_RESET_PTZ_BUTTON);
    await expect(button).toHaveAttribute("data-state", "ready", { timeout: 5000 });
    await button.click();

    await expect.poll(() => socket.resetRequests()).toEqual([{ cameraId: "cam1" }]);
  });

  test("is disabled while recording, and re-enables when the recording stops", async ({ page }) => {
    const socket = await setupSocket(page);
    await openDashboard(page);

    const button = page.getByTestId(TEST_ID_CAMERA_RESET_PTZ_BUTTON);
    await expect(button).toHaveAttribute("data-state", "ready", { timeout: 5000 });

    socket.push("stc:obs:state", obsStateDefault({ recording: true, commandedState: { streaming: false, recording: true } }));
    await expect(button).toHaveAttribute("data-state", "disabled");
    await expect(page.getByTestId(TEST_ID_CAMERA_RESET_PTZ_HINT)).toContainText("Unavailable while recording or streaming");

    // Force-click bypasses Playwright's actionability check, so this proves the disabled control really sends nothing.
    await button.click({ force: true });
    expect(socket.resetRequests()).toEqual([]);

    socket.push("stc:obs:state", obsStateDefault());
    await expect(button).toHaveAttribute("data-state", "ready");
  });

  test("is disabled while streaming", async ({ page }) => {
    const socket = await setupSocket(page);
    await openDashboard(page);

    socket.push("stc:obs:state", obsStateDefault({ streaming: true, commandedState: { streaming: true, recording: false } }));
    await expect(page.getByTestId(TEST_ID_CAMERA_RESET_PTZ_BUTTON)).toHaveAttribute("data-state", "disabled");
  });

  test("shows the backend's refusal as a notification", async ({ page }) => {
    await setupSocket(page, { success: false, error: "Cannot reset PTZ while recording or streaming" });
    await openDashboard(page);

    await page.getByTestId(TEST_ID_CAMERA_RESET_PTZ_BUTTON).click();
    await expect(page.getByText("Cannot reset PTZ while recording or streaming")).toBeVisible({ timeout: 5000 });
  });

  test("shows the 3x3 framing grid over the preview", async ({ page }) => {
    await setupSocket(page);
    await openDashboard(page);
    await expect(page.getByTestId(TEST_ID_CAMERA_GRID_OVERLAY)).toBeAttached();
  });
});
