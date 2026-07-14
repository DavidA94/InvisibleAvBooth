/**
 * Lower-third template-derived library recomputation tests.
 *
 * Covers: template items appearing/disappearing when manifest changes,
 * BUS_TEMPLATES_CHANGED triggering recomputation, and template items
 * persisting when active even if tokens become unresolvable.
 *
 * Gaps addressed: B15 from docs/testing-gaps.md
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";
import { CTS_SESSION_MANIFEST_UPDATE, CTS_LOWER_THIRD_COMMAND, STC_LOWER_THIRD_STATE, OTS_LOWER_THIRD_PHASE } from "@invisible-av-booth/shared";
import type { LowerThirdCommand } from "@invisible-av-booth/shared";
import { eventBus } from "../../../src/eventBus/eventBus.js";
import { BUS_TEMPLATES_CHANGED } from "../../../src/eventBus/types.js";

let server: TestServer;
const sockets: Socket[] = [];

beforeAll(async () => {
  server = await buildTestServer({ seedKjv: true });
});
afterAll(() => destroyServer(server));
beforeEach(() => resetServer(server));
afterEach(() => {
  while (sockets.length) sockets.pop()!.disconnect();
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

function seedLowerThirdTemplate(name: string, lowerThirdType: string, formatString: string, autoDismissMs?: number | null): string {
  const id = `lt-tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  server.ctx.database
    .prepare(
      "INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, lowerThirdType, autoDismissMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, name, "lower_third", formatString, "AvVolunteer", lowerThirdType, autoDismissMs ?? null, new Date().toISOString());
  return id;
}

// ── B15: Template-derived library recomputation on manifest change ────────────

describe("Template-derived library recomputation", () => {
  it("template item appears in library when manifest provides required tokens", async () => {
    // Create a lower-third template that needs {Speaker}
    seedLowerThirdTemplate("Speaker LT", "Title", '{"title":"{Speaker}"}');

    const dashboard = await connectDashboard();

    // Initially no speaker → template not in library
    const state = server.ctx.lowerThirdService.getFullState();
    expect(state.library.filter((i) => i.source === "template")).toHaveLength(0);

    // Update manifest with speaker → template should appear
    const received = new Promise<{ library: Array<{ source: string; templateName: string }> }>((resolve) => {
      dashboard.on(STC_LOWER_THIRD_STATE, (data: { library: Array<{ source: string; templateName: string }> }) => {
        if (data.library.some((i) => i.source === "template")) resolve(data);
      });
    });

    dashboard.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "Pastor John" }, () => {});
    const payload = await received;

    const templateItems = payload.library.filter((i) => i.source === "template");
    expect(templateItems).toHaveLength(1);
    expect(templateItems[0]!.templateName).toBe("Speaker LT");
  });

  it("template item disappears from library when manifest loses required tokens", async () => {
    seedLowerThirdTemplate("Speaker LT", "Title", '{"title":"{Speaker}"}');

    const dashboard = await connectDashboard();

    // Set speaker first
    await new Promise<void>((resolve) => {
      dashboard.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "Pastor John" }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 50));

    // Verify it's in the library
    const state = server.ctx.lowerThirdService.getFullState();
    expect(state.library.filter((i) => i.source === "template")).toHaveLength(1);

    // Clear manifest (removing speaker) → template should disappear
    const received = new Promise<{ library: Array<{ source: string }> }>((resolve) => {
      dashboard.on(STC_LOWER_THIRD_STATE, (data: { library: Array<{ source: string }> }) => {
        if (!data.library.some((i) => i.source === "template")) resolve(data);
      });
    });

    // Need a title template in DB for clear to work (manifestService.clear needs template)
    const titleId = `title-${Date.now()}`;
    server.ctx.database
      .prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
      .run(titleId, "Default", "title", "{Date}", "AvVolunteer", new Date().toISOString());

    dashboard.emit(CTS_SESSION_MANIFEST_UPDATE, { titleTemplateId: titleId, speaker: "" }, () => {});

    const payload = await received;
    expect(payload.library.filter((i) => i.source === "template")).toHaveLength(0);
  });

  it("template items with no interpolation tokens are always present", async () => {
    // Static text template — no tokens needed from manifest
    seedLowerThirdTemplate("Welcome", "Title", '{"title":"Welcome to Church"}');

    const _dashboard = await connectDashboard();

    // Even with empty manifest, static template should be in library
    await new Promise((r) => setTimeout(r, 100));

    // Trigger recompute by emitting BUS_TEMPLATES_CHANGED
    eventBus.emit(BUS_TEMPLATES_CHANGED, {});
    await new Promise((r) => setTimeout(r, 100));

    const state = server.ctx.lowerThirdService.getFullState();
    const templateItems = state.library.filter((i) => i.source === "template");
    expect(templateItems.length).toBeGreaterThanOrEqual(1);
    expect(templateItems.some((i) => i.templateName === "Welcome")).toBe(true);
  });

  it("active template item persists even when tokens become unresolvable", async () => {
    seedLowerThirdTemplate("Speaker LT", "Title", '{"title":"{Speaker}"}');

    const overlay = connectOverlay();
    await new Promise<void>((resolve) => overlay.on("connect", resolve));
    await new Promise((r) => setTimeout(r, 50));

    const dashboard = await connectDashboard();

    // Set speaker → template appears
    await new Promise<void>((resolve) => {
      dashboard.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "Pastor John" }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 50));

    // Activate the template item
    const state = server.ctx.lowerThirdService.getFullState();
    const templateItem = state.library.find((i) => i.source === "template")!;
    expect(templateItem).toBeDefined();

    const activateResult = await sendCommand(dashboard, { type: "activate", itemId: templateItem.id });
    expect(activateResult.success).toBe(true);

    // Simulate overlay reporting visible
    overlay.emit(OTS_LOWER_THIRD_PHASE, "visible");
    await new Promise((r) => setTimeout(r, 50));

    // Now clear the speaker — template would normally disappear, but it's active
    await new Promise<void>((resolve) => {
      dashboard.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "" }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 100));

    // Active item should still exist (not forcibly dismissed)
    const afterState = server.ctx.lowerThirdService.getFullState();
    expect(afterState.active).not.toBeNull();
    expect(afterState.active!.id).toBe(templateItem.id);

    // Force clear for cleanup
    await sendCommand(dashboard, { type: "force-clear" });
  });

  it("BUS_TEMPLATES_CHANGED triggers library recomputation", async () => {
    const dashboard = await connectDashboard();

    // Set manifest with speaker
    await new Promise<void>((resolve) => {
      dashboard.emit(CTS_SESSION_MANIFEST_UPDATE, { speaker: "Pastor John" }, () => resolve());
    });
    await new Promise((r) => setTimeout(r, 50));

    // No templates yet
    const state = server.ctx.lowerThirdService.getFullState();
    expect(state.library.filter((i) => i.source === "template")).toHaveLength(0);

    // Add a template to the DB and emit BUS_TEMPLATES_CHANGED
    seedLowerThirdTemplate("New Speaker LT", "Title", '{"title":"{Speaker}"}');

    const received = new Promise<{ library: Array<{ source: string; templateName: string }> }>((resolve) => {
      dashboard.on(STC_LOWER_THIRD_STATE, (data: { library: Array<{ source: string; templateName: string }> }) => {
        if (data.library.some((i) => i.source === "template")) resolve(data);
      });
    });

    eventBus.emit(BUS_TEMPLATES_CHANGED, {});

    const payload = await received;
    const templateItems = payload.library.filter((i) => i.source === "template");
    expect(templateItems).toHaveLength(1);
    expect(templateItems[0]!.templateName).toBe("New Speaker LT");
  });

  it("deleted template removes its item from library", async () => {
    const templateId = seedLowerThirdTemplate("To Delete", "Title", '{"title":"Static Text"}');

    const dashboard = await connectDashboard();

    // Template should appear (static text, always resolvable)
    eventBus.emit(BUS_TEMPLATES_CHANGED, {});
    await new Promise((r) => setTimeout(r, 100));

    const state = server.ctx.lowerThirdService.getFullState();
    expect(state.library.some((i) => i.templateId === templateId)).toBe(true);

    // Delete the template and signal change
    server.ctx.database.prepare("DELETE FROM metadata_templates WHERE id = ?").run(templateId);

    const received = new Promise<{ library: Array<{ templateId: string | null }> }>((resolve) => {
      dashboard.on(STC_LOWER_THIRD_STATE, (data: { library: Array<{ templateId: string | null }> }) => {
        if (!data.library.some((i) => i.templateId === templateId)) resolve(data);
      });
    });

    eventBus.emit(BUS_TEMPLATES_CHANGED, {});

    const payload = await received;
    expect(payload.library.some((i) => i.templateId === templateId)).toBe(false);
  });
});
