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

export async function routeSocketIo(
  page: Page,
  initialObs?: ObsStatePayload,
  initialManifest?: SessionManifestPayload,
): Promise<MockSocketHandle> {
  // Mutable state — updated by handle methods, read by cts:request:initial:state
  let currentObsState = initialObs ?? obsStateDefault();
  let currentManifest = initialManifest ?? sessionManifestDefault();
  const connections: WebSocketRoute[] = [];

  function broadcast(message: string): void {
    for (const connection of connections) {
      try {
        connection.send(message);
      } catch {
        /* connection closed */
      }
    }
  }

  const handle: MockSocketHandle = {
    sendObsState: (state) => {
      currentObsState = state;
      broadcast(`42["stc:obs:state",${JSON.stringify(state)}]`);
    },
    sendManifest: (payload) => {
      currentManifest = payload;
      broadcast(`42["stc:session:manifest:updated",${JSON.stringify(payload)}]`);
    },
    sendRaw: (event, data) => {
      broadcast(`42["${event}",${JSON.stringify(data)}]`);
    },
  };

  await page.routeWebSocket("**/socket.io/*", (ws) => {
    connections.push(ws);

    // Engine.IO handshake
    ws.send('0{"sid":"mock-ws-sid","upgrades":[],"pingInterval":25000,"pingTimeout":60000}');

    ws.onMessage((message) => {
      const text = typeof message === "string" ? message : "";

      if (text === "2") {
        ws.send("3");
        return;
      }

      if (text === "40" || text.startsWith("40{")) {
        ws.send('40{"sid":"mock-ws-sid"}');
        return;
      }

      // Send current (not initial) state on reconnect
      if (text.includes('"cts:request:initial:state"')) {
        ws.send(`42["stc:obs:state",${JSON.stringify(currentObsState)}]`);
        ws.send(`42["stc:session:manifest:updated",${JSON.stringify(currentManifest)}]`);
        return;
      }

      // Ack commands with success
      if (text.includes('"cts:obs:command"') || text.includes('"cts:session:manifest:update"')) {
        const match = text.match(/^(\d+)/);
        if (match) {
          ws.send(`${match[1]}[{"success":true}]`);
        }
      }
    });
  });

  return handle;
}

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
