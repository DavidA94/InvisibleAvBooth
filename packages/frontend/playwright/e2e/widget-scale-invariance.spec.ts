import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { routeAuthLogin, routeAuthCheck } from "../support/routes/auth";
import { authLoginSuccess } from "../fixtures/payloads/auth";
import { obsStateDefault } from "../fixtures/payloads/obs";
import { TEST_ID_LOGIN_USERNAME, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_SUBMIT, TEST_ID_CAMERA_WIDGET } from "../../src/constants/testIds";

/**
 * Scale invariance (dashboard-management Req 2.10): the dashboard shrinks by lowering the root font
 * size, so every widget must lay out identically in rem at any scale. This renders the same
 * large-landscape dashboard at full scale (1920x1080 → 16px root) and scaled down (1280x800 →
 * ~14.5px root) and compares sizes in rem and layout decisions (presets visible, channels per page,
 * compact mode, title-bar indicators collapsed).
 *
 * Regression for: a fixed 250px Camera preset column made the joystick a constant 250px, so the
 * visible preset count depended on the screen.
 */

const volunteerLogin = authLoginSuccess({ role: "AvVolunteer" });

const cameraState = {
  cameras: [
    {
      cameraId: "cam1",
      label: "Main Camera",
      connected: true,
      viscaConnected: true,
      position: { pan: 0, tilt: 0, zoom: 0, focus: 0 },
      autoFocus: true,
      aiTracking: false,
      aiTilt: false,
      aiZoom: false,
      activePresetId: null,
      features: ["pan", "tilt", "zoom", "focus"],
      capabilities: { tapToCenter: true },
      presets: [1, 2, 3, 4, 5, 6].map((n) => ({ id: `p${n}`, name: `Preset ${n}` })),
    },
  ],
  ndiAvailable: false,
};

const mixerState = {
  mixerId: "mix1",
  connected: true,
  model: "behringer-xair",
  channelCount: 16,
  capabilities: { features: ["gain-control", "channel-metering"], gainRange: { minDb: -12, maxDb: 60 } },
  channels: Array.from({ length: 16 }, (_, index) => ({ channel: index + 1, name: `Ch ${index + 1}`, fader: 0.5, faderDb: -10, muted: false, gainDb: 0 })),
  presets: [],
};

const lowerThirdState = {
  active: null,
  library: [1, 2, 3].map((n) => ({
    id: `lt${n}`,
    type: "Title",
    style: "blue_rhombus",
    content: { title: `Speaker ${n}` },
    autoDismissMs: null,
    source: "volunteer",
    templateId: null,
    templateName: null,
    used: false,
    createdAt: `2026-01-01T00:00:0${n}Z`,
    pages: null,
  })),
  phase: "hidden",
  autoDismissAt: null,
  overlayConnected: true,
  overlayResolution: { width: 1920, height: 1080 },
  overlayResolutionCorrect: true,
  transitionLocked: false,
  overlayStale: false,
};

// The production large-landscape layout (data/app.db), so the test measures what volunteers see.
const LARGE_LANDSCAPE_CELLS = [
  { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 4, rowSpan: 2, roleMinimum: "AvVolunteer" },
  { widgetId: "obs-preview", title: "OBS Preview", col: 4, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" },
  { widgetId: "lower-thirds", title: "Lower Thirds", col: 8, row: 0, colSpan: 3, rowSpan: 3, roleMinimum: "AvVolunteer" },
  { widgetId: "camera", title: "Camera", col: 0, row: 2, colSpan: 6, rowSpan: 4, roleMinimum: "AvVolunteer" },
  { widgetId: "soundboard", title: "Sound Board", col: 6, row: 3, colSpan: 5, rowSpan: 4, roleMinimum: "AvVolunteer" },
];

async function openDashboard(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await routeAuthLogin(page, volunteerLogin);
  await routeAuthCheck(page, volunteerLogin);
  await page.route("**/api/dashboards", (route) => route.fulfill({ json: [{ id: "default", name: "Main", description: "" }] }));
  await page.route("**/api/dashboards/*/layout", (route) =>
    route.fulfill({
      json: { grids: { "large-landscape": LARGE_LANDSCAPE_CELLS, "large-portrait": [], "small-landscape": [], "small-portrait": [] } },
    }),
  );
  await page.routeWebSocket("**/preview/**", () => {});
  await page.routeWebSocket("**/socket.io/*", (ws: WebSocketRoute) => {
    ws.send('0{"sid":"mock-ws-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');
    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : "";
      if (text === "2") return ws.send("3");
      if (text === "40") return ws.send('40{"sid":"mock-ws-sid"}');
      if (text.includes('"cts:request:initial:state"')) {
        ws.send(`42["stc:obs:state",${JSON.stringify(obsStateDefault())}]`);
        ws.send(`42["stc:relay:state",${JSON.stringify({ running: false, obsConnected: false })}]`);
        ws.send(`42["stc:platform:readiness",${JSON.stringify({ platforms: [] })}]`);
        ws.send(`42["stc:camera:state",${JSON.stringify(cameraState)}]`);
        ws.send(`42["stc:mixer:state",${JSON.stringify([mixerState])}]`);
        ws.send(`42["stc:lower-third:state",${JSON.stringify(lowerThirdState)}]`);
      }
    });
  });
  await page.goto("/login");
  await page.getByTestId(TEST_ID_LOGIN_USERNAME).locator("input").fill("volunteer");
  await page.getByTestId(TEST_ID_LOGIN_PASSWORD).locator("input").fill("password");
  await page.getByTestId(TEST_ID_LOGIN_SUBMIT).click();
  await expect(page.getByTestId(TEST_ID_CAMERA_WIDGET)).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(300); // ResizeObserver-driven layout decisions settle
}

interface Snapshot {
  rootPx: number;
  sizesRem: Record<string, [number, number] | null>;
  layout: Record<string, number | boolean>;
}

/** Sizes of key elements in rem, plus layout decisions that must not change with scale. */
async function snapshot(page: Page): Promise<Snapshot> {
  return page.evaluate(() => {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const remBox = (selector: string): [number, number] | null => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return [Math.round((rect.width / rootPx) * 10) / 10, Math.round((rect.height / rootPx) * 10) / 10];
    };
    const presets = document.querySelector(".camera-controls-presets");
    const presetsVisible = presets
      ? [...presets.querySelectorAll(".camera-preset-btn")].filter((button) => {
          const rect = button.getBoundingClientRect();
          const list = presets.getBoundingClientRect();
          return rect.top >= list.top - 0.5 && rect.bottom <= list.bottom + 0.5;
        }).length
      : -1;
    return {
      rootPx,
      sizesRem: {
        cameraJoystick: remBox(".ptz-joystick"),
        cameraPresets: remBox(".camera-controls-presets"),
        cameraVideo: remBox(".camera-controls-video"),
        cameraSelect: remBox(".camera-select-wrapper"),
        cameraPresetButton: remBox(".camera-preset-btn"),
        soundboardWidget: remBox("[data-testid='soundboard-widget']"),
        soundboardStrip: remBox("[data-testid='soundboard-channel-strip-1']"),
        lowerThirdRow: remBox("[data-testid='lower-third-row-lt1']"),
        widgetTitleBar: remBox("[data-testid='widget-title-bar']"),
      },
      layout: {
        cameraPresetsVisible: presetsVisible,
        cameraCompact: document.querySelector("[data-testid='camera-widget']")?.getAttribute("data-state") === "compact",
        soundboardStrips: document.querySelectorAll("[data-testid^='soundboard-channel-strip-']").length,
        collapsedTitleBars: document.querySelectorAll("[data-testid='widget-title-bar'][data-state='collapsed']").length,
      },
    };
  });
}

// 1280x800 (~14.5px root, common tablet) and 1366x768 (~13.9px). Both stay in large-landscape, so the
// same layout is compared. The 0.65 floor is covered by the unit-level helpers; at the floor the grid
// overflows and scrolls by design, which this layout comparison does not model.
for (const [width, height] of [
  [1280, 800],
  [1366, 768],
] as const) {
  test(`widgets lay out identically in rem at full scale and at ${width}x${height}`, async ({ browser }) => {
    const full = await browser.newPage();
    await openDashboard(full, 1920, 1080);
    const fullSnapshot = await snapshot(full);

    const scaled = await browser.newPage();
    await openDashboard(scaled, width, height);
    const scaledSnapshot = await snapshot(scaled);

    // Precondition: the second page really is scaled down.
    expect(fullSnapshot.rootPx).toBe(16);
    expect(scaledSnapshot.rootPx).toBeLessThan(15);

    expect(scaledSnapshot.layout, `layout decisions changed with scale (root ${scaledSnapshot.rootPx}px)`).toEqual(fullSnapshot.layout);
    for (const [name, fullSize] of Object.entries(fullSnapshot.sizesRem)) {
      expect(fullSize, `${name} not rendered`).not.toBeNull();
      const scaledSize = scaledSnapshot.sizesRem[name]!;
      expect(Math.abs(scaledSize[0] - fullSize![0]), `${name} width (rem) full=${fullSize![0]} scaled=${scaledSize[0]}`).toBeLessThanOrEqual(0.2);
      expect(Math.abs(scaledSize[1] - fullSize![1]), `${name} height (rem) full=${fullSize![1]} scaled=${scaledSize[1]}`).toBeLessThanOrEqual(0.2);
    }
    expect(fullSnapshot.layout.cameraPresetsVisible).toBeGreaterThanOrEqual(1);
  });
}
