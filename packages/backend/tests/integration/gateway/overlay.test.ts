import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer } from "../harness.js";
import type { TestServer } from "../harness.js";
import {
  STO_LOWER_THIRD_STATE,
  STO_LOWER_THIRD_MEASURE,
  OTS_LOWER_THIRD_PHASE,
  OTS_LOWER_THIRD_RESOLUTION,
  OTS_LOWER_THIRD_PAGES,
} from "@invisible-av-booth/shared";

let s: TestServer;

beforeAll(async () => {
  s = await buildTestServer({ seedKjv: true });
});
afterAll(() => destroyServer(s));
beforeEach(() => resetServer(s));

function connectOverlay(): Socket {
  return ioClient(`http://localhost:${s.port}/overlay`, {
    transports: ["websocket"],
    autoConnect: true,
  });
}

describe("/overlay namespace", () => {
  it("connects without authentication", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it("receives initial state on connection", async () => {
    const socket = connectOverlay();
    const state = await new Promise<Record<string, unknown>>((resolve) => {
      socket.on(STO_LOWER_THIRD_STATE, (data: Record<string, unknown>) => resolve(data));
    });
    expect(state).toHaveProperty("phase", "hidden");
    expect(state).toHaveProperty("active", null);
    expect(state).toHaveProperty("library");
    expect(state).toHaveProperty("skipEntrance");
    socket.disconnect();
  });

  it("forcibly disconnects previous overlay client on new connection", async () => {
    const socket1 = connectOverlay();
    await new Promise<void>((resolve) => socket1.on("connect", resolve));

    const disconnectPromise = new Promise<void>((resolve) => socket1.on("disconnect", resolve));

    const socket2 = connectOverlay();
    await new Promise<void>((resolve) => socket2.on("connect", resolve));

    await disconnectPromise;
    expect(socket1.connected).toBe(false);
    expect(socket2.connected).toBe(true);

    socket2.disconnect();
  });

  it("accepts phase reports from overlay", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    // Emit a phase report — should not throw
    socket.emit(OTS_LOWER_THIRD_PHASE, "visible");

    // Give it a tick to process
    await new Promise((r) => setTimeout(r, 50));
    socket.disconnect();
  });

  it("accepts resolution telemetry", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    socket.emit(OTS_LOWER_THIRD_RESOLUTION, { width: 1920, height: 1080, isCorrect: true });

    await new Promise((r) => setTimeout(r, 50));
    expect(s.ctx.lowerThirdService.getFullState().overlayResolutionCorrect).toBe(true);
    socket.disconnect();
  });

  it("updates overlayConnected state on connect/disconnect", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    await new Promise((r) => setTimeout(r, 50));
    expect(s.ctx.lowerThirdService.getFullState().overlayConnected).toBe(true);

    socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(s.ctx.lowerThirdService.getFullState().overlayConnected).toBe(false);
  });

  it("accepts ots:lower-third:log with valid entries", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    socket.emit("ots:lower-third:log", [
      { level: "info", message: "Overlay loaded" },
      { level: "warn", message: "Font fallback used", context: { font: "Arial" } },
    ]);

    await new Promise((r) => setTimeout(r, 50));
    // No error thrown — entries processed successfully
    socket.disconnect();
  });

  it("ignores ots:lower-third:log with non-array input", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    socket.emit("ots:lower-third:log", "not an array");
    socket.emit("ots:lower-third:log", { message: "single object" });

    await new Promise((r) => setTimeout(r, 50));
    // Should not throw — silently ignored
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it("skips log entries with invalid level", async () => {
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    socket.emit("ots:lower-third:log", [{ level: "invalid-level", message: "should be skipped" }, { message: "no level defaults to info" }]);

    await new Promise((r) => setTimeout(r, 50));
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it("accepts page breakdown reports via OTS_LOWER_THIRD_PAGES", async () => {
    // Add a Scripture item to the library so reportPages has something to update
    const service = s.ctx.lowerThirdService;
    service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } },
    });
    const library = service.getFullState().library;
    const item = library.find((i) => i.type === "Scripture")!;
    expect(item.pages).toBeNull();

    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));

    const pages = {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 16, endVerse: 16 },
        { pageNumber: 2, startVerse: 17, endVerse: 17 },
      ],
      useWideWidth: false,
    };
    socket.emit(OTS_LOWER_THIRD_PAGES, { itemId: item.id, pages });

    await new Promise((r) => setTimeout(r, 50));
    const updated = service.getFullState().library.find((i) => i.id === item.id)!;
    expect(updated.pages).toEqual(pages);
    socket.disconnect();
  });

  it("sendToOverlay does nothing when no client is connected", async () => {
    const service = s.ctx.lowerThirdService;
    // Connect and disconnect to ensure currentSocket becomes null
    const socket = connectOverlay();
    await new Promise<void>((resolve) => socket.on("connect", resolve));
    socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));
    expect(service.getFullState().overlayConnected).toBe(false);

    // Now trigger sendToOverlay via requestMeasurement — should not throw
    service.setOverlayConnected(true);
    service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16 } },
    });
    // No crash — sendToOverlay silently does nothing when socket is null
  });

  it("emits pending measurement requests on connection", async () => {
    const service = s.ctx.lowerThirdService;
    // Add a Scripture item while overlay is disconnected — pages will be null (pending)
    service.addToLibrary({
      type: "Scripture",
      content: { reference: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } },
    });
    const library = service.getFullState().library;
    const item = library.find((i) => i.type === "Scripture" && i.pages === null)!;
    expect(item).toBeDefined();

    // Connect overlay — should receive STO_LOWER_THIRD_MEASURE for the pending item
    const socket = connectOverlay();
    const measureData = await new Promise<Record<string, unknown>>((resolve) => {
      socket.on(STO_LOWER_THIRD_MEASURE, (data: Record<string, unknown>) => resolve(data));
    });

    expect(measureData).toHaveProperty("itemId", item.id);
    expect(measureData).toHaveProperty("verses");
    expect(measureData).toHaveProperty("reference");
    socket.disconnect();
  });
});
