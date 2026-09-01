import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { TEST_ID_LOGIN_USERNAME, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_SUBMIT } from "../../src/constants/testIds";

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });
const powerUserLogin = authLoginSuccess({ role: "AvPowerUser" });

function mixerState(overrides: Record<string, unknown> = {}) {
  return {
    mixerId: "mix1",
    connected: true,
    model: "behringer-xair",
    channelCount: 3,
    capabilities: { features: ["gain-control", "channel-metering"], gainRange: { minDb: -12, maxDb: 60 } },
    channels: [
      { channel: 1, name: "Vocals", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 },
      { channel: 2, name: "Guitar", fader: 0.75, faderDb: 0, muted: true, gainDb: 12 },
      { channel: 3, name: "Drums", fader: 0.4, faderDb: -15, muted: false, gainDb: 6 },
    ],
    presets: [{ id: "p1", name: "Singers", sortOrder: 0 }],
    ...overrides,
  };
}

async function setupSocket(page: Page, initial = [mixerState()]): Promise<{ lastSet: () => unknown; lastPresetActivate: () => unknown }> {
  let lastSet: unknown = null;
  let lastPresetActivate: unknown = null;

  await page.routeWebSocket("**/socket.io/*", (ws: WebSocketRoute) => {
    ws.send('0{"sid":"mock-ws-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');
    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : "";
      if (text === "2") return ws.send("3");
      if (text === "40") return ws.send('40{"sid":"mock-ws-sid"}');
      if (text.includes('"cts:request:initial:state"')) {
        ws.send(
          `42["stc:obs:state",${JSON.stringify({ connected: true, streaming: false, recording: false, commandedState: { streaming: false, recording: false } })}]`,
        );
        ws.send(
          `42["stc:session:manifest:updated",${JSON.stringify({ manifest: {}, interpolatedStreamTitle: "", interpolatedDescription: "", manifestReady: false })}]`,
        );
        ws.send(`42["stc:relay:state",${JSON.stringify({ running: false, obsConnected: false })}]`);
        ws.send(`42["stc:platform:readiness",${JSON.stringify({ platforms: [] })}]`);
        ws.send(`42["stc:camera:state",${JSON.stringify({ cameras: [], ndiAvailable: false })}]`);
        ws.send(`42["stc:mixer:state",${JSON.stringify(initial)}]`);
        return;
      }
      const setMatch = text.match(/^\d+\["cts:mixer:set",(.*)\]$/);
      if (setMatch) lastSet = JSON.parse(setMatch[1]!);
      const presetMatch = text.match(/^\d+\["cts:mixer:preset:activate",(.*)\]$/);
      if (presetMatch) lastPresetActivate = JSON.parse(presetMatch[1]!);
    });
  });

  return { lastSet: () => lastSet, lastPresetActivate: () => lastPresetActivate };
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
        cells: [{ widgetId: "soundboard", title: "Sound Board", col: 0, row: 0, colSpan: 7, rowSpan: 5, roleMinimum: "AvVolunteer" }],
      }),
    });
  });
}

async function loginAndNavigate(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.locator("[data-testid='soundboard-widget']")).toBeVisible({ timeout: 15000 });
}

test.describe("Sound Board widget", () => {
  test("renders channel strips with names and a green Controls indicator", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    await setupSocket(page);
    await loginAndNavigate(page);

    await expect(page.getByTestId("soundboard-channel-name-1")).toContainText("Vocals");
    await expect(page.getByTestId("soundboard-channel-name-2")).toContainText("Guitar");
    await expect(page.getByTestId("soundboard-widget")).toHaveAttribute("data-status", "online");
    // Controls indicator green (healthy) on fresh state.
    await expect(page.locator("[data-testid='connection-indicators'] [data-status='healthy']").first()).toBeVisible();
  });

  test("mute status reflects the mixer-reported state (channel 2 muted → Audio: Off)", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    await setupSocket(page);
    await loginAndNavigate(page);

    await expect(page.getByTestId("mixer-mute-status-1")).toContainText("Audio: On");
    await expect(page.getByTestId("mixer-mute-status-2")).toContainText("Audio: Off");
  });

  test("toggling mute emits cts:mixer:set and optimistically shows the commanded state", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    const socket = await setupSocket(page);
    await loginAndNavigate(page);

    await page.getByTestId("mixer-mute-button-1").click();
    // Optimistic: shows the commanded "Audio: Off" immediately (channel 1 starts unmuted).
    await expect(page.getByTestId("mixer-mute-status-1")).toContainText("Audio: Off");
    await expect.poll(() => socket.lastSet()).toMatchObject({ mixerId: "mix1", channel: 1, muted: true });
  });

  test("activating a preset emits cts:mixer:preset:activate and shows a toast", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    const socket = await setupSocket(page);
    await loginAndNavigate(page);

    await page.getByTestId("mixer-preset-button-p1").click();
    await expect.poll(() => socket.lastPresetActivate()).toMatchObject({ mixerId: "mix1", presetId: "p1" });
    await expect(page.getByText("Applied: Singers")).toBeVisible();
  });

  test("Adjust Gain opens the gain popover (AvPowerUser+)", async ({ page }) => {
    await routeAuthLogin(page, powerUserLogin);
    await routeAuthCheck(page, powerUserLogin);
    await setupDashboard(page);
    await setupSocket(page);
    await loginAndNavigate(page);

    await page.getByTestId("mixer-adjust-gain-button-1").click();
    // The IonPopover renders a gain-value readout and a slider.
    await expect(page.getByTestId("mixer-gain-slider").first()).toBeVisible();
    await expect(page.getByTestId("mixer-gain-slider").first()).toBeVisible();
  });

  test("Adjust Gain button is hidden for AvVolunteer (AvPowerUser+ gate)", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    await setupSocket(page);
    await loginAndNavigate(page);

    await expect(page.getByTestId("mixer-adjust-gain-button-1")).toHaveCount(0);
  });

  test("shows the offline scrim and a red Controls indicator when the mixer is disconnected", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    await setupSocket(page, [mixerState({ connected: false })]);
    await loginAndNavigate(page);

    await expect(page.getByTestId("widget-error-overlay")).toBeVisible();
    await expect(page.getByTestId("soundboard-widget")).toHaveAttribute("data-status", "offline");
    await expect(page.locator("[data-testid='connection-indicators'] [data-status='unhealthy']").first()).toBeVisible();
  });

  test("hides gain controls when gain-control is disabled (capability gating)", async ({ page }) => {
    await routeAuthLogin(page, volunteerLogin);
    await routeAuthCheck(page, volunteerLogin);
    await setupDashboard(page);
    await setupSocket(page, [mixerState({ capabilities: { features: ["channel-metering"], gainRange: { minDb: -12, maxDb: 60 } } })]);
    await loginAndNavigate(page);

    await expect(page.getByTestId("mixer-adjust-gain-button-1")).toHaveCount(0);
    // Fader + mute remain (core controls).
    await expect(page.getByTestId("mixer-vertical-fader-1")).toBeVisible();
    await expect(page.getByTestId("mixer-mute-button-1")).toBeVisible();
  });
});
