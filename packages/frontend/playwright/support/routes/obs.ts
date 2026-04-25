import type { Page, WebSocketRoute } from "@playwright/test";
import { obsStateDefault } from "../../fixtures/payloads/obs";
import { sessionManifestDefault, dashboardLayoutDefault, dashboardListDefault } from "../../fixtures/payloads/session";
import type { ObsStatePayload } from "../../fixtures/payloads/obs";
import type { SessionManifestPayload } from "../../fixtures/payloads/session";

export interface MockSocketHandle {
  sendObsState: (state: ObsStatePayload) => void;
  sendManifest: (payload: SessionManifestPayload) => void;
  sendRaw: (event: string, data: unknown) => void;
}

/**
 * Routes the Socket.io WebSocket connection and returns a handle for pushing server events.
 * Also intercepts the Socket.io polling transport.
 */
export async function routeSocketIo(
  page: Page,
  initialObs?: ObsStatePayload,
  initialManifest?: SessionManifestPayload,
): Promise<MockSocketHandle> {
  const obsState = initialObs ?? obsStateDefault();
  const manifestPayload = initialManifest ?? sessionManifestDefault();

  // Intercept Socket.io polling transport only — WebSocket handled by routeWebSocket
  await page.route("**/socket.io/*", async (route) => {
    const url = route.request().url();
    if (url.includes("transport=polling")) {
      if (!url.includes("sid=")) {
        await route.fulfill({
          status: 200,
          contentType: "text/plain",
          body: '0{"sid":"mock-sid","upgrades":["websocket"],"pingInterval":25000,"pingTimeout":60000}',
        });
      } else {
        await route.fulfill({ status: 200, contentType: "text/plain", body: "" });
      }
    } else {
      await route.fallback();
    }
  });

  let wsRoute: WebSocketRoute | null = null;

  const handle: MockSocketHandle = {
    sendObsState: (state) => {
      if (wsRoute) {
        // Socket.io protocol: 42["event", data]
        wsRoute.send(`42["stc:obs:state",${JSON.stringify(state)}]`);
      }
    },
    sendManifest: (payload) => {
      if (wsRoute) {
        wsRoute.send(`42["stc:session:manifest:updated",${JSON.stringify(payload)}]`);
      }
    },
    sendRaw: (event, data) => {
      if (wsRoute) {
        wsRoute.send(`42["${event}",${JSON.stringify(data)}]`);
      }
    },
  };

  await page.routeWebSocket("**/socket.io/**", (ws) => {
    wsRoute = ws;

    ws.onMessage((message) => {
      const messageString = typeof message === "string" ? message : "";
      // Socket.io ping
      if (messageString === "2") {
        ws.send("3");
        return;
      }
      // Socket.io connect (namespace)
      if (messageString === "40") {
        ws.send('40{"sid":"mock-ws-sid"}');
        // Send initial state after connection
        setTimeout(() => {
          ws.send(`42["stc:obs:state",${JSON.stringify(obsState)}]`);
          ws.send(`42["stc:session:manifest:updated",${JSON.stringify(manifestPayload)}]`);
        }, 50);
        return;
      }
      // Handle cts:obs:command — ack with success
      if (messageString.includes('"cts:obs:command"')) {
        const match = messageString.match(/^(\d+)/);
        if (match) {
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
      // Handle cts:session:manifest:update — ack with success
      if (messageString.includes('"cts:session:manifest:update"')) {
        const match = messageString.match(/^(\d+)/);
        if (match) {
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
    });
  });

  return handle;
}

/** Routes dashboard REST endpoints. */
export async function routeDashboardApi(page: Page): Promise<void> {
  await page.route("**/api/dashboards", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(dashboardListDefault()),
      });
    } else {
      await route.continue();
    }
  });

  await page.route("**/api/dashboards/*/layout", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(dashboardLayoutDefault()),
    });
  });
}
