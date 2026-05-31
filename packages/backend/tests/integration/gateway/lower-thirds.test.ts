import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_LOWER_THIRD_COMMAND, OTS_LOWER_THIRD_PHASE } from "@invisible-av-booth/shared";
import type { LowerThirdCommand } from "@invisible-av-booth/shared";

let server: TestServer;

beforeAll(async () => {
  server = await buildTestServer({ seedKjv: true });
});
afterAll(() => destroyServer(server));
beforeEach(() => resetServer(server));

function connectOverlay(): Socket {
  return ioClient(`http://localhost:${server.port}/overlay`, { transports: ["websocket"] });
}

async function connectDashboard(): Promise<Socket> {
  const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
  const token = cookie.split("token=")[1]?.split(";")[0] ?? "";
  const socket = ioClient(`http://localhost:${server.port}`, { transports: ["websocket"], auth: { token } });
  await new Promise<void>((resolve) => socket.on("connect", resolve));
  return socket;
}

function sendCommand(socket: Socket, command: LowerThirdCommand): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(CTS_LOWER_THIRD_COMMAND, command, (result: { success: boolean; error?: string }) => resolve(result));
  });
}

describe("Lower-Third Integration", () => {
  it("full flow: add → activate → dismiss", async () => {
    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dashboard = await connectDashboard();

    // Add item
    const addResult = await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "Test Speaker" } } });
    expect(addResult.success).toBe(true);

    // Get state
    const state = server.ctx.lowerThirdService.getFullState();
    const itemId = state.library[0]?.id;
    expect(itemId).toBeDefined();

    // Activate
    const activateResult = await sendCommand(dashboard, { type: "activate", itemId: itemId! });
    expect(activateResult.success).toBe(true);
    expect(server.ctx.lowerThirdService.getAnimationPhase()).toBe("showing");

    // Simulate overlay reporting visible
    overlay.emit(OTS_LOWER_THIRD_PHASE, "visible");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(server.ctx.lowerThirdService.getAnimationPhase()).toBe("visible");

    // Dismiss
    const dismissResult = await sendCommand(dashboard, { type: "dismiss-active" });
    expect(dismissResult.success).toBe(true);

    // Simulate overlay reporting hidden
    overlay.emit(OTS_LOWER_THIRD_PHASE, "hidden");
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(server.ctx.lowerThirdService.getActive()).toBeNull();
    expect(server.ctx.lowerThirdService.getAnimationPhase()).toBe("hidden");

    overlay.disconnect();
    dashboard.disconnect();
  });

  it("auto-dismiss sets autoDismissAt on activation", async () => {
    const service = server.ctx.lowerThirdService;
    service.forceClear();

    const result = service.addToLibrary({ type: "Title", content: { title: "Auto" }, autoDismissMs: 5000 });
    if (!result.success) throw new Error(result.error);
    const itemId = result.value.id;

    service.activate(itemId);
    service.reportPhase("visible");

    const state = service.getFullState();
    expect(state.autoDismissAt).not.toBeNull();
    expect(state.active?.autoDismissMs).toBe(5000);

    service.forceClear();
  });

  it("force clear bypasses transition lock", async () => {
    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dashboard = await connectDashboard();

    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "Locked" } } });
    const itemId = server.ctx.lowerThirdService.getFullState().library[0]?.id;

    await sendCommand(dashboard, { type: "activate", itemId: itemId! });
    expect(server.ctx.lowerThirdService.isTransitionLocked()).toBe(true);

    // Force clear bypasses lock
    const result = await sendCommand(dashboard, { type: "force-clear" });
    expect(result.success).toBe(true);
    expect(server.ctx.lowerThirdService.getActive()).toBeNull();

    overlay.disconnect();
    dashboard.disconnect();
  });

  it("push-up transition when activating while active", async () => {
    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((resolve) => setTimeout(resolve, 50));

    const dashboard = await connectDashboard();

    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "First" } } });
    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "Second" } } });

    const state = server.ctx.lowerThirdService.getFullState();
    const firstId = state.library[0]?.id;
    const secondId = state.library[1]?.id;

    await sendCommand(dashboard, { type: "activate", itemId: firstId! });
    server.ctx.lowerThirdService.reportPhase("visible");

    // Activate second — push-up
    await sendCommand(dashboard, { type: "activate", itemId: secondId! });
    expect(server.ctx.lowerThirdService.getActive()?.id).toBe(secondId);
    expect(server.ctx.lowerThirdService.getAnimationPhase()).toBe("showing");

    overlay.disconnect();
    dashboard.disconnect();
  });
});
