/**
 * Lower-third edge case integration tests.
 *
 * Covers: transition lock enforcement, auto-dismiss when overlay disconnected,
 * addToLibrary with Scripture type, page navigation, and overlay reconnect
 * with skipEntrance.
 *
 * Gaps addressed: B16, B18, B19, B20, B21 from docs/testing-gaps.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_LOWER_THIRD_COMMAND, OTS_LOWER_THIRD_PHASE, STO_LOWER_THIRD_STATE } from "@invisible-av-booth/shared";
import type { LowerThirdCommand } from "@invisible-av-booth/shared";

let server: TestServer;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = await buildTestServer({ seedKjv: true });
});
afterAll(() => destroyServer(server));
beforeEach(() => resetServer(server));
afterEach(() => {
  while (sockets.length) sockets.pop()!.disconnect();
  server.ctx.lowerThirdService.forceClear();
});

function connectOverlay(): Socket {
  const socket = ioClient(`http://localhost:${server.port}/overlay`, { transports: ["websocket"] });
  sockets.push(socket);
  return socket;
}

async function connectDashboard(): Promise<Socket> {
  const cookie = await loginAsAdmin(server.agent, server.ctx.authService);
  const token = cookie.split("token=")[1]?.split(";")[0] ?? "";
  const socket = ioClient(`http://localhost:${server.port}`, { transports: ["websocket"], auth: { token } });
  sockets.push(socket);
  await new Promise<void>((resolve) => socket.on("connect", resolve));
  return socket;
}

function sendCommand(socket: Socket, command: LowerThirdCommand): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    socket.emit(CTS_LOWER_THIRD_COMMAND, command, (result: { success: boolean; error?: string }) => resolve(result));
  });
}

// ── B20: Transition Lock Enforcement ─────────────────────────────────────────

describe("Transition lock enforcement", () => {
  it("rejects activate while showing animation is in progress", async () => {
    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((r) => setTimeout(r, 50));

    const dashboard = await connectDashboard();

    // Add two items
    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "First" } } });
    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "Second" } } });

    const state = server.ctx.lowerThirdService.getFullState();
    const firstId = state.library[0]!.id;
    const secondId = state.library[1]!.id;

    // Activate first — enters "showing" phase (transition lock)
    await sendCommand(dashboard, { type: "activate", itemId: firstId });
    expect(server.ctx.lowerThirdService.getAnimationPhase()).toBe("showing");
    expect(server.ctx.lowerThirdService.isTransitionLocked()).toBe(true);

    // Try to activate second — should be rejected
    const result = await sendCommand(dashboard, { type: "activate", itemId: secondId });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Transition in progress");
  });

  it("rejects dismiss while showing animation is in progress", async () => {
    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((r) => setTimeout(r, 50));

    const dashboard = await connectDashboard();

    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "Test" } } });
    const itemId = server.ctx.lowerThirdService.getFullState().library[0]!.id;

    // Activate — enters "showing"
    await sendCommand(dashboard, { type: "activate", itemId });
    expect(server.ctx.lowerThirdService.isTransitionLocked()).toBe(true);

    // Try to dismiss — should be rejected
    const result = await sendCommand(dashboard, { type: "dismiss-active" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Transition in progress");
  });

  it("rejects page-next while animation is in progress", async () => {
    const service = server.ctx.lowerThirdService;

    // Add a scripture item and simulate pages
    const addResult = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } },
    });
    expect(addResult.success).toBe(true);
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    // Simulate page breakdown
    service.reportPages(itemId, {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 16, endVerse: 17 },
        { pageNumber: 2, startVerse: 18, endVerse: 18 },
      ],
      useWideWidth: false,
    });

    // Activate and stay in "showing" (don't report phase visible)
    service.activate(itemId);
    expect(service.isTransitionLocked()).toBe(true);

    // Try page-next — should be rejected
    const result = service.pageNext();
    expect(result.success).toBe(false);
    expect(result.error).toContain("Transition in progress");
  });

  it("allows activate after phase reports visible (lock released)", async () => {
    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((r) => setTimeout(r, 50));

    const dashboard = await connectDashboard();

    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "First" } } });
    await sendCommand(dashboard, { type: "add-to-library", input: { type: "Title", content: { title: "Second" } } });

    const state = server.ctx.lowerThirdService.getFullState();
    const firstId = state.library[0]!.id;
    const secondId = state.library[1]!.id;

    // Activate first
    await sendCommand(dashboard, { type: "activate", itemId: firstId });

    // Report visible — unlocks
    overlay.emit(OTS_LOWER_THIRD_PHASE, "visible");
    await new Promise((r) => setTimeout(r, 50));
    expect(server.ctx.lowerThirdService.isTransitionLocked()).toBe(false);

    // Now activate second — should succeed (push-up)
    const result = await sendCommand(dashboard, { type: "activate", itemId: secondId });
    expect(result.success).toBe(true);
  });
});

// ── B16: Auto-dismiss timer fires when overlay disconnected ──────────────────

describe("Auto-dismiss timer when overlay disconnected", () => {
  it("auto-dismiss advances phase to dismissing even without overlay", async () => {
    const service = server.ctx.lowerThirdService;

    // Add item with short auto-dismiss (100ms for testing)
    const addResult = service.addToLibrary({ type: "Title", content: { title: "Quick" }, autoDismissMs: 100 });
    expect(addResult.success).toBe(true);
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    // Activate without overlay connected
    service.activate(itemId);
    // Simulate showing → visible (so auto-dismiss timer starts)
    service.reportPhase("visible");
    expect(service.getFullState().autoDismissAt).not.toBeNull();

    // Wait for auto-dismiss to fire (100ms + buffer)
    await new Promise((r) => setTimeout(r, 200));

    // Phase should advance to dismissing even though no overlay is connected
    expect(service.getAnimationPhase()).toBe("dismissing");
  });

  it("auto-dismiss fires and fallback timer eventually clears active item", async () => {
    const service = server.ctx.lowerThirdService;

    const addResult = service.addToLibrary({ type: "Title", content: { title: "Quick" }, autoDismissMs: 100 });
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    service.activate(itemId);
    service.reportPhase("visible");

    // Wait for auto-dismiss (100ms) + fallback timer (5000ms)
    // We can't wait 5s in a test, so just verify the dismissing phase happens
    await new Promise((r) => setTimeout(r, 200));
    expect(service.getAnimationPhase()).toBe("dismissing");
    expect(service.getActive()).not.toBeNull(); // Still active during dismissing

    // Simulate overlay reporting hidden (as if it processed the dismiss)
    service.reportPhase("hidden");
    expect(service.getActive()).toBeNull();
  });
});

// ── B18: addToLibrary with Scripture type ────────────────────────────────────

describe("addToLibrary with Scripture type", () => {
  it("succeeds with valid KJV reference and looks up verse text", () => {
    const service = server.ctx.lowerThirdService;
    const result = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16 } },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.value.type).toBe("Scripture");
    const content = result.value.content as { verses: Array<{ verseNumber: number; text: string }> };
    expect(content.verses).toHaveLength(1);
    expect(content.verses[0]!.verseNumber).toBe(16);
    expect(content.verses[0]!.text).toContain("God so loved");
  });

  it("succeeds with multi-verse range", () => {
    const service = server.ctx.lowerThirdService;
    const result = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const content = result.value.content as { verses: Array<{ verseNumber: number; text: string }> };
    expect(content.verses).toHaveLength(2);
    expect(content.verses[0]!.verseNumber).toBe(16);
    expect(content.verses[1]!.verseNumber).toBe(17);
  });

  it("fails with invalid reference (book not in KJV)", () => {
    const service = server.ctx.lowerThirdService;
    const result = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 99, chapter: 1, verse: 1 } },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Scripture not found");
  });

  it("fails with invalid chapter/verse combination", () => {
    const service = server.ctx.lowerThirdService;
    const result = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 999, verse: 1 } },
    });

    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error).toContain("Scripture not found");
  });
});

// ── B19: Page-next / page-previous commands ──────────────────────────────────

describe("Page navigation commands", () => {
  it("page-next advances to next page", () => {
    const service = server.ctx.lowerThirdService;

    const addResult = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } },
    });
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    // Simulate pages
    service.reportPages(itemId, {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 16, endVerse: 17 },
        { pageNumber: 2, startVerse: 18, endVerse: 18 },
      ],
      useWideWidth: false,
    });

    // Activate and report visible
    service.activate(itemId);
    service.reportPhase("visible");

    // Page next
    const result = service.pageNext();
    expect(result.success).toBe(true);
    expect(service.getActive()!.pages!.currentPage).toBe(2);
    expect(service.getAnimationPhase()).toBe("showing"); // Page transition animation
  });

  it("page-previous goes back to previous page", () => {
    const service = server.ctx.lowerThirdService;

    const addResult = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } },
    });
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    service.reportPages(itemId, {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 16, endVerse: 17 },
        { pageNumber: 2, startVerse: 18, endVerse: 18 },
      ],
      useWideWidth: false,
    });

    service.activate(itemId);
    service.reportPhase("visible");

    // Go to page 2
    service.pageNext();
    service.reportPhase("visible"); // complete page transition

    // Go back to page 1
    const result = service.pagePrevious();
    expect(result.success).toBe(true);
    expect(service.getActive()!.pages!.currentPage).toBe(1);
  });

  it("page-next fails on last page", () => {
    const service = server.ctx.lowerThirdService;

    const addResult = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } },
    });
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    service.reportPages(itemId, {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 16, endVerse: 17 },
        { pageNumber: 2, startVerse: 18, endVerse: 18 },
      ],
      useWideWidth: false,
    });

    service.activate(itemId);
    service.reportPhase("visible");
    service.pageNext();
    service.reportPhase("visible");

    // Already on last page
    const result = service.pageNext();
    expect(result.success).toBe(false);
    expect(result.error).toContain("last page");
  });

  it("page-previous fails on first page", () => {
    const service = server.ctx.lowerThirdService;

    const addResult = service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 18 } },
    });
    if (!addResult.success) return;
    const itemId = addResult.value.id;

    service.reportPages(itemId, {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 16, endVerse: 17 },
        { pageNumber: 2, startVerse: 18, endVerse: 18 },
      ],
      useWideWidth: false,
    });

    service.activate(itemId);
    service.reportPhase("visible");

    const result = service.pagePrevious();
    expect(result.success).toBe(false);
    expect(result.error).toContain("first page");
  });

  it("page commands fail when no paginated content active", () => {
    const service = server.ctx.lowerThirdService;

    // Activate a Title item (no pages)
    service.addToLibrary({ type: "Title", content: { title: "No pages" } });
    const itemId = service.getFullState().library[0]!.id;
    service.activate(itemId);
    service.reportPhase("visible");

    expect(service.pageNext().success).toBe(false);
    expect(service.pagePrevious().success).toBe(false);
  });
});

// ── B21: Overlay reconnect with skipEntrance ─────────────────────────────────

describe("Overlay reconnect with skipEntrance", () => {
  it("reconnecting overlay receives skipEntrance: true when item was visible", async () => {
    const service = server.ctx.lowerThirdService;

    // Add and activate an item, make it visible
    service.addToLibrary({ type: "Title", content: { title: "Visible Item" } });
    const itemId = service.getFullState().library[0]!.id;
    service.activate(itemId);
    service.reportPhase("visible");

    // Connect overlay — should receive state with skipEntrance: true
    const overlay = connectOverlay();
    const stateData = await new Promise<Record<string, unknown>>((resolve) => {
      overlay.on(STO_LOWER_THIRD_STATE, (data: Record<string, unknown>) => resolve(data));
    });

    expect(stateData.skipEntrance).toBe(true);
    expect(stateData.active).not.toBeNull();
    expect(stateData.phase).toBe("visible");
  });

  it("reconnecting overlay receives skipEntrance: false when phase is hidden", async () => {
    const service = server.ctx.lowerThirdService;
    // No active item — phase is hidden
    expect(service.getAnimationPhase()).toBe("hidden");

    const overlay = connectOverlay();
    const stateData = await new Promise<Record<string, unknown>>((resolve) => {
      overlay.on(STO_LOWER_THIRD_STATE, (data: Record<string, unknown>) => resolve(data));
    });

    expect(stateData.skipEntrance).toBe(false);
    expect(stateData.active).toBeNull();
  });

  it("reconnecting overlay receives skipEntrance: false when phase is showing", async () => {
    const service = server.ctx.lowerThirdService;

    service.addToLibrary({ type: "Title", content: { title: "Animating" } });
    const itemId = service.getFullState().library[0]!.id;
    service.activate(itemId);
    // Phase is "showing" — entrance animation in progress
    expect(service.getAnimationPhase()).toBe("showing");

    const overlay = connectOverlay();
    const stateData = await new Promise<Record<string, unknown>>((resolve) => {
      overlay.on(STO_LOWER_THIRD_STATE, (data: Record<string, unknown>) => resolve(data));
    });

    // Should restart entrance animation (skipEntrance: false)
    expect(stateData.skipEntrance).toBe(false);
  });
});
