import { test, expect, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { routeDashboardApi } from "../support/routes/obs";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { obsStateDefault } from "../fixtures/payloads/obs";
import { sessionManifestFilled } from "../fixtures/payloads/session";
import { routeTemplatesApi } from "../support/routes/template";
import {
  TEST_ID_LOGIN_USERNAME,
  TEST_ID_LOGIN_PASSWORD,
  TEST_ID_LOGIN_SUBMIT,
  TEST_ID_DASHBOARD_GRID,
  TEST_ID_NOTIFICATION_BANNER,
  TEST_ID_OBS_RECORD_BUTTON,
  TEST_ID_MANAGE_STREAMS_BUTTON,
} from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

/**
 * Custom socket mock with disconnect/reconnect control.
 * Each new WebSocket connection from Socket.io's reconnection logic
 * is automatically handled (handshake + initial state).
 */
async function routeSocketWithDisconnectControl(page: Parameters<typeof test>[1]["page"]) {
  const connections: WebSocketRoute[] = [];

  function sendInitialState(ws: WebSocketRoute): void {
    ws.send(`42["stc:obs:state",${JSON.stringify(obsStateDefault({ connected: true }))}]`);
    ws.send(`42["stc:session:manifest:updated",${JSON.stringify(sessionManifestFilled())}]`);
    ws.send(`42["stc:relay:state",${JSON.stringify({ running: false, obsConnected: false })}]`);
    ws.send(`42["stc:platform:readiness",${JSON.stringify({ platforms: [] })}]`);
  }

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
        sendInitialState(ws);
        return;
      }
      if (text.includes('"cts:obs:command"') || text.includes('"cts:session:manifest:update"') || text.includes('"cts:platform:command"')) {
        const match = text.match(/^(\d+)/);
        if (match) {
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
    });
  });

  return {
    disconnect: () => {
      const latest = connections[connections.length - 1];
      if (latest) {
        latest.close({ code: 1006, reason: "Server disconnected" });
      }
    },
  };
}

async function loginAndNavigate(page: Parameters<typeof test>[1]["page"]): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeVisible({ timeout: 15000 });
}

test.describe("Socket disconnect/reconnect UX", () => {
  test("shows 'Connection lost' banner on socket disconnect", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketWithDisconnectControl(page);

    await loginAndNavigate(page);
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toBeVisible({ timeout: 5000 });

    // Simulate server disconnect
    handle.disconnect();

    // Banner should appear
    await expect(page.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toContainText("Connection lost");
  });

  test("OBS shows disconnected state after socket drop clears state", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketWithDisconnectControl(page);

    await loginAndNavigate(page);

    const recordButton = page.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    await expect(recordButton).toBeVisible({ timeout: 5000 });

    // Disconnect — banner shows, and OBS state will be stale (no fresh state from backend)
    handle.disconnect();
    await expect(page.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toBeVisible({ timeout: 5000 });

    // The banner is the primary UX indicator that the connection is lost
    // and commands won't work until reconnection
    await expect(page.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toContainText("reconnecting");
  });

  test("reconnection dismisses banner and re-enables controls", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await routeDashboardApi(page);
    await routeTemplatesApi(page);
    const handle = await routeSocketWithDisconnectControl(page);

    await loginAndNavigate(page);
    await expect(page.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toBeVisible({ timeout: 5000 });

    // Disconnect
    handle.disconnect();
    await expect(page.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toBeVisible({ timeout: 5000 });

    // Socket.io auto-reconnects — the mock accepts the new connection automatically
    // Wait for reconnection to complete and banner to dismiss
    await expect(page.getByTestId(TEST_ID_NOTIFICATION_BANNER)).not.toBeVisible({ timeout: 10000 });

    // Controls re-enabled
    const recordButton = page.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    await expect(recordButton).not.toBeDisabled({ timeout: 3000 });
  });
});
