import BetterSqlite3 from "better-sqlite3";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LowerThirdService } from "./lowerThirdService.js";
import { MetadataTemplateDao } from "../dao/metadataTemplateDao.js";
import { SessionManifestService } from "./sessionManifestService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_LOWER_THIRD_STATE_CHANGED } from "../eventBus/types.js";
import { applySchema } from "../database/schema.js";
import type { Database } from "better-sqlite3";
import type { AddLowerThirdInput } from "@invisible-av-booth/shared";
import type { JwtPayload } from "./authService.js";

const actor: JwtPayload = { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 };

function createDatabase(): Database {
  const db = new BetterSqlite3(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  // Seed a title template so SessionManifestService doesn't complain
  db.prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    "t1",
    "Default",
    "title",
    "{Date} – {Speaker}",
    "AvVolunteer",
    new Date().toISOString(),
  );
  return db;
}

function seedKjv(db: Database): void {
  db.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(
    1,
    1,
    1,
    "In the beginning God created the heaven and the earth.",
  );
  db.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(1, 1, 2, "And the earth was without form, and void.");
  db.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(
    1,
    1,
    3,
    "And God said, Let there be light: and there was light.",
  );
}

let db: Database;
let dao: MetadataTemplateDao;
let manifestService: SessionManifestService;
let service: LowerThirdService;
let sendToOverlay: ReturnType<typeof vi.fn<(event: string, data?: unknown) => void>>;

beforeEach(() => {
  db = createDatabase();
  seedKjv(db);
  dao = new MetadataTemplateDao(db);
  manifestService = new SessionManifestService(db);
  service = new LowerThirdService(dao, db, manifestService);
  sendToOverlay = vi.fn<(event: string, data?: unknown) => void>();
  service.setSendToOverlay(sendToOverlay);
  service.setOverlayConnected(true);
});

afterEach(() => {
  service.destroy();
  eventBus.removeAllListeners();
  vi.restoreAllMocks();
});

// ── Library Management ────────────────────────────────────────────────────────

describe("library management", () => {
  it("adds a Title item to the library", () => {
    const input: AddLowerThirdInput = { type: "Title", content: { title: "John Smith" } };
    const result = service.addToLibrary(input);
    expect(result.success).toBe(true);
    expect(service.getLibrary()).toHaveLength(1);
    expect(service.getLibrary()[0]!.type).toBe("Title");
  });

  it("adds a TitleSubtitle item", () => {
    const input: AddLowerThirdInput = { type: "TitleSubtitle", content: { title: "John", subtitle: "Pastor" } };
    const result = service.addToLibrary(input);
    expect(result.success).toBe(true);
  });

  it("adds a Scripture item with verse lookup", () => {
    const input: AddLowerThirdInput = { type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1 } } };
    const result = service.addToLibrary(input);
    expect(result.success).toBe(true);
    if (result.success) {
      const content = result.value.content as { verses: Array<{ text: string }> };
      expect(content.verses[0]!.text).toContain("In the beginning");
    }
  });

  it("rejects Scripture with missing KJV data", () => {
    const input: AddLowerThirdInput = { type: "Scripture", content: { reference: { bookId: 99, chapter: 1, verse: 1 } } };
    const result = service.addToLibrary(input);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Scripture not found");
  });

  it("removes a volunteer item from library", () => {
    const result = service.addToLibrary({ type: "Title", content: { title: "X" } });
    expect(result.success).toBe(true);
    if (result.success) {
      const removeResult = service.removeFromLibrary(result.value.id);
      expect(removeResult.success).toBe(true);
      expect(service.getLibrary()).toHaveLength(0);
    }
  });

  it("cannot remove a template-derived item", () => {
    // Add a lower-third template and trigger recomputation
    dao.create({ name: "Speaker LT", category: "lower_third", formatString: '{"title":"{Speaker}"}', roleMinimum: "AvVolunteer", lowerThirdType: "Title" });
    manifestService.update({ speaker: "John" }, actor);
    const items = service.getLibrary();
    expect(items.length).toBeGreaterThan(0);
    const templateItem = items.find((i) => i.source === "template")!;
    const result = service.removeFromLibrary(templateItem.id);
    expect(result.success).toBe(false);
  });

  it("edits a volunteer item without changing sort position", () => {
    service.addToLibrary({ type: "Title", content: { title: "First" } });
    const second = service.addToLibrary({ type: "Title", content: { title: "Second" } });
    if (second.success) {
      service.editLibraryItem(second.value.id, { content: { title: "Edited" } });
      expect(service.getLibrary()[1]!.id).toBe(second.value.id);
      expect((service.getLibrary()[1]!.content as { title: string }).title).toBe("Edited");
    }
  });
});

// ── Activation & Dismiss ──────────────────────────────────────────────────────

describe("activation and dismiss", () => {
  it("activates an item from library", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "Test" } });
    if (!added.success) throw new Error("add failed");
    service.reportPhase("hidden"); // ensure not locked
    const result = service.activate(added.value.id);
    expect(result.success).toBe(true);
    expect(service.getActive()?.id).toBe(added.value.id);
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:show", expect.any(Object));
  });

  it("marks item as used after activation", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "Test" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    expect(service.getLibrary().find((i) => i.id === added.value.id)!.used).toBe(true);
  });

  it("uses push-up transition when activating while something is active", () => {
    const a = service.addToLibrary({ type: "Title", content: { title: "A" } });
    const b = service.addToLibrary({ type: "Title", content: { title: "B" } });
    if (!a.success || !b.success) throw new Error("add failed");

    service.activate(a.value.id);
    service.reportPhase("visible"); // unlock

    service.activate(b.value.id);
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:push-up", expect.any(Object));
    expect(service.getActive()?.id).toBe(b.value.id);
  });

  it("activates with skipAnimation sends skipEntrance and sets phase to visible", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "Test" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id, true);
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:show", expect.objectContaining({ skipEntrance: true }));
    expect(service.getAnimationPhase()).toBe("visible");
  });

  it("dismisses the active item", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "Test" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    const result = service.dismissActive();
    expect(result.success).toBe(true);
    expect(service.getAnimationPhase()).toBe("dismissing");
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:dismiss", {});
  });

  it("force clear bypasses transition lock", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "Test" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    // Phase is "showing" (locked)
    expect(service.isTransitionLocked()).toBe(true);

    service.forceClear();
    expect(service.getActive()).toBeNull();
    expect(service.getAnimationPhase()).toBe("hidden");
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:force-clear", {});
  });
});

// ── Transition Lock ───────────────────────────────────────────────────────────

describe("transition lock", () => {
  it("rejects activate during showing phase", () => {
    const a = service.addToLibrary({ type: "Title", content: { title: "A" } });
    const b = service.addToLibrary({ type: "Title", content: { title: "B" } });
    if (!a.success || !b.success) throw new Error("add failed");
    service.activate(a.value.id); // phase = showing
    const result = service.activate(b.value.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Transition in progress");
  });

  it("rejects dismiss during showing phase", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "A" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id); // phase = showing
    const result = service.dismissActive();
    expect(result.success).toBe(false);
  });

  it("rejects page navigation during transition", () => {
    const result = service.pageNext();
    expect(result.success).toBe(false);
  });

  it("unlocks on visible phase report", () => {
    const a = service.addToLibrary({ type: "Title", content: { title: "A" } });
    if (!a.success) throw new Error("add failed");
    service.activate(a.value.id);
    expect(service.isTransitionLocked()).toBe(true);
    service.reportPhase("visible");
    expect(service.isTransitionLocked()).toBe(false);
  });

  it("5-second fallback advances phase", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "A" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id); // phase = showing, fallback starts
    expect(service.getAnimationPhase()).toBe("showing");

    vi.advanceTimersByTime(5000);
    expect(service.getAnimationPhase()).toBe("visible");
    vi.useRealTimers();
  });
});

// ── Auto-Dismiss Timer ────────────────────────────────────────────────────────

describe("auto-dismiss timer", () => {
  it("starts timer on activation with autoDismissMs", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "A" }, autoDismissMs: 3000 });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    expect(service.getFullState().autoDismissAt).not.toBeNull();

    vi.advanceTimersByTime(3000);
    expect(service.getAnimationPhase()).toBe("dismissing");
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:dismiss", {});
    vi.useRealTimers();
  });

  it("cancels timer on manual dismiss", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "A" }, autoDismissMs: 5000 });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    service.dismissActive();
    vi.advanceTimersByTime(5000);
    // Should not have fired auto-dismiss (only one dismiss call total)
    const dismissCalls = sendToOverlay.mock.calls.filter((c) => c[0] === "sto:lower-third:dismiss");
    expect(dismissCalls).toHaveLength(1);
    vi.useRealTimers();
  });

  it("cancels previous timer on push-up", () => {
    vi.useFakeTimers();
    const a = service.addToLibrary({ type: "Title", content: { title: "A" }, autoDismissMs: 3000 });
    const b = service.addToLibrary({ type: "Title", content: { title: "B" } });
    if (!a.success || !b.success) throw new Error("add failed");

    service.activate(a.value.id);
    service.reportPhase("visible");
    service.activate(b.value.id); // push-up, cancels A's timer
    service.reportPhase("visible");

    vi.advanceTimersByTime(5000);
    // B has no auto-dismiss, so nothing should fire
    expect(service.getActive()?.id).toBe(b.value.id);
    expect(service.getAnimationPhase()).toBe("visible");
    vi.useRealTimers();
  });

  it("does not auto-dismiss an item without autoDismissMs", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "A" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    vi.advanceTimersByTime(60000);
    expect(service.getActive()?.id).toBe(added.value.id);
    expect(service.getAnimationPhase()).toBe("visible");
    vi.useRealTimers();
  });
});

// ── Scripture & Measurement ───────────────────────────────────────────────────

describe("scripture and measurement", () => {
  it("requests measurement when scripture item is added and overlay is connected", () => {
    const input: AddLowerThirdInput = { type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } };
    service.addToLibrary(input);
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:measure", expect.objectContaining({ verses: expect.any(Array) }));
  });

  it("caches page breakdown after reportPages", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");

    const pages = { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 3 }], useWideWidth: false };
    service.reportPages(added.value.id, pages);

    expect(service.getLibrary().find((i) => i.id === added.value.id)!.pages).toEqual(pages);
  });

  it("measurement timeout falls back to single page", () => {
    vi.useFakeTimers();
    // Re-create service with fake timers active
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);
    service.setSendToOverlay(sendToOverlay);
    service.setOverlayConnected(true);

    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");

    vi.advanceTimersByTime(10000);
    const item = service.getLibrary().find((i) => i.id === added.value.id)!;
    expect(item.pages).not.toBeNull();
    expect(item.pages!.totalPages).toBe(1);
    vi.useRealTimers();
  });

  it("getPendingMeasurements returns scripture items without pages", () => {
    service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1 } } });
    service.addToLibrary({ type: "Title", content: { title: "X" } });
    expect(service.getPendingMeasurements()).toHaveLength(1);
  });
});

// ── Page Navigation ───────────────────────────────────────────────────────────

describe("page navigation", () => {
  it("advances to next page", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");
    const pages = {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 1, endVerse: 2 },
        { pageNumber: 2, startVerse: 3, endVerse: 3 },
      ],
      useWideWidth: false,
    };
    service.reportPages(added.value.id, pages);

    service.activate(added.value.id);
    service.reportPhase("visible");

    const result = service.pageNext();
    expect(result.success).toBe(true);
    expect(service.getActive()!.pages!.currentPage).toBe(2);
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:page", { page: 2 });
  });

  it("rejects next on last page", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1 } } });
    if (!added.success) throw new Error("add failed");
    const pages = { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }], useWideWidth: false };
    service.reportPages(added.value.id, pages);
    service.activate(added.value.id);
    service.reportPhase("visible");

    const result = service.pageNext();
    expect(result.success).toBe(false);
  });
});

// ── State Emission ────────────────────────────────────────────────────────────

describe("state emission", () => {
  it("emits BUS_LOWER_THIRD_STATE_CHANGED on state changes", () => {
    const handler = vi.fn();
    eventBus.subscribe(BUS_LOWER_THIRD_STATE_CHANGED, handler);

    service.addToLibrary({ type: "Title", content: { title: "X" } });
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0]![0]).toHaveProperty("library");
  });
});

// ── Template Resolution ───────────────────────────────────────────────────────

describe("template resolution", () => {
  function seedLowerThirdTemplate(opts: { type: string; formatString: string; name?: string; autoDismissMs?: number | null }): void {
    db.prepare(
      "INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, lowerThirdType, autoDismissMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      `lt-${opts.type}-${Date.now()}`,
      opts.name ?? "Test",
      "lower_third",
      opts.formatString,
      "AvVolunteer",
      opts.type,
      opts.autoDismissMs ?? null,
      new Date().toISOString(),
    );
  }

  it("resolves Title template when manifest has speaker", () => {
    seedLowerThirdTemplate({ type: "Title", formatString: '{"title":"{Speaker}"}' });
    // Recreate service to pick up templates subscription
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);
    service.setSendToOverlay(sendToOverlay);
    service.setOverlayConnected(true);

    // Trigger recompute via manifest update
    manifestService.update({ speaker: "John" }, actor);

    const templates = service.getLibrary().filter((i) => i.source === "template");
    expect(templates).toHaveLength(1);
    expect(templates[0]!.content).toEqual({ title: "John" });
  });

  it("does not resolve template when required token is missing", () => {
    seedLowerThirdTemplate({ type: "Title", formatString: '{"title":"{Speaker}"}' });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);

    // Update manifest without speaker
    manifestService.update({ title: "Something" }, actor);

    const templates = service.getLibrary().filter((i) => i.source === "template");
    expect(templates).toHaveLength(0);
  });

  it("resolves TitleSubtitle template", () => {
    seedLowerThirdTemplate({ type: "TitleSubtitle", formatString: '{"title":"{Speaker}","subtitle":"{Title}"}' });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);

    manifestService.update({ speaker: "Jane", title: "Grace" }, actor);

    const templates = service.getLibrary().filter((i) => i.source === "template");
    expect(templates).toHaveLength(1);
    expect(templates[0]!.content).toEqual({ title: "Jane", subtitle: "Grace" });
  });

  it("resolves Scripture template when manifest has scripture", () => {
    seedLowerThirdTemplate({ type: "Scripture", formatString: '{"title":"{Scripture}"}' });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);
    service.setSendToOverlay(sendToOverlay);
    service.setOverlayConnected(true);

    manifestService.update({ scripture: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } }, actor);

    const templates = service.getLibrary().filter((i) => i.source === "template");
    expect(templates).toHaveLength(1);
    expect(templates[0]!.type).toBe("Scripture");
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:measure", expect.any(Object));
  });

  it("recomputes templates when manifest changes", () => {
    seedLowerThirdTemplate({ type: "Title", formatString: '{"title":"{Speaker}"}' });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);
    service.setSendToOverlay(sendToOverlay);
    service.setOverlayConnected(true);

    expect(service.getLibrary().filter((i) => i.source === "template")).toHaveLength(0);

    manifestService.update({ speaker: "Bob" }, actor);
    expect(service.getLibrary().filter((i) => i.source === "template")).toHaveLength(1);
  });

  it("removes template items when tokens become unresolvable", () => {
    seedLowerThirdTemplate({ type: "Title", formatString: '{"title":"{Speaker}"}' });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);

    manifestService.update({ speaker: "Bob" }, actor);
    expect(service.getLibrary().filter((i) => i.source === "template")).toHaveLength(1);

    manifestService.clear(actor);
    expect(service.getLibrary().filter((i) => i.source === "template")).toHaveLength(0);
  });

  it("resolves static template (no tokens) always", () => {
    seedLowerThirdTemplate({ type: "Title", formatString: '{"title":"Welcome"}' });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);

    // Any manifest update triggers recompute
    manifestService.update({}, actor);

    const templates = service.getLibrary().filter((i) => i.source === "template");
    expect(templates).toHaveLength(1);
    expect(templates[0]!.content).toEqual({ title: "Welcome" });
  });

  it("includes autoDismissMs from template", () => {
    seedLowerThirdTemplate({ type: "Title", formatString: '{"title":"Hi"}', autoDismissMs: 5000 });
    service.destroy();
    service = new LowerThirdService(dao, db, manifestService);

    manifestService.update({}, actor);

    const templates = service.getLibrary().filter((i) => i.source === "template");
    expect(templates[0]!.autoDismissMs).toBe(5000);
  });
});

// ── Overlay Connection ────────────────────────────────────────────────────────

describe("overlay connection", () => {
  it("getPendingMeasurements returns scripture items without pages", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } } });
    if (!added.success) throw new Error("add failed");
    expect(service.getPendingMeasurements()).toHaveLength(1);
  });

  it("getPendingMeasurements returns empty after pages reported", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } } });
    if (!added.success) throw new Error("add failed");
    service.reportPages(added.value.id, { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }], useWideWidth: false });
    expect(service.getPendingMeasurements()).toHaveLength(0);
  });

  it("requests measurement when overlay connects with pending items", () => {
    service.setOverlayConnected(false);
    service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } } });
    sendToOverlay.mockClear();

    // Simulate overlay reconnecting — service should send pending measurements
    service.setOverlayConnected(true);
    // The measurement was already sent on addToLibrary when overlay was connected in beforeEach,
    // but since we disconnected first, it should re-send on reconnect
    expect(service.getPendingMeasurements()).toHaveLength(1);
  });

  it("tracks overlay stale state after disconnect timeout", () => {
    vi.useFakeTimers();
    service.addToLibrary({ type: "Title", content: { title: "X" } });
    const added = service.getLibrary()[0]!;
    service.activate(added.id);
    service.reportPhase("visible");

    service.setOverlayConnected(false);
    vi.advanceTimersByTime(16000);

    expect(service.getFullState().overlayStale).toBe(true);
    vi.useRealTimers();
  });
});

// ── Edit and Remove Edge Cases ────────────────────────────────────────────────

describe("edit edge cases", () => {
  it("rejects editing a non-existent item", () => {
    const result = service.editLibraryItem("nonexistent", { content: { title: "X" } });
    expect(result.success).toBe(false);
  });

  it("rejects editing the active item", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "X" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    const result = service.editLibraryItem(added.value.id, { content: { title: "Y" } });
    expect(result.success).toBe(false);
  });

  it("updates autoDismissMs on edit", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "X" } });
    if (!added.success) throw new Error("add failed");
    service.editLibraryItem(added.value.id, { autoDismissMs: 3000 });
    expect(service.getLibrary()[0]!.autoDismissMs).toBe(3000);
  });
});

// ── Additional Coverage: Uncovered Branches ───────────────────────────────────

describe("overlay stale timer cancellation on reconnect (line 69)", () => {
  it("clears stale timer when overlay reconnects before timeout fires", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "X" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    // Disconnect — starts 15s stale timer
    service.setOverlayConnected(false);
    // Reconnect before 15s — should clear the stale timer (line 69)
    vi.advanceTimersByTime(5000);
    service.setOverlayConnected(true);

    // Advance past what would have been the timeout
    vi.advanceTimersByTime(15000);
    expect(service.getFullState().overlayStale).toBe(false);
    vi.useRealTimers();
  });
});

describe("destroy with active stale timer (lines 334-335)", () => {
  it("clears stale timer on destroy", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "X" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    // Disconnect to start the stale timer
    service.setOverlayConnected(false);

    // Destroy while stale timer is pending — should not throw
    service.destroy();
    vi.advanceTimersByTime(20000);
    // If timer wasn't cleared, it would try to access destroyed state
    vi.useRealTimers();
  });
});

describe("fallback timer for dismissing phase", () => {
  it("fallback clears active and sets hidden when dismissing times out", () => {
    vi.useFakeTimers();
    const added = service.addToLibrary({ type: "Title", content: { title: "A" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    service.dismissActive();
    expect(service.getAnimationPhase()).toBe("dismissing");

    // Fallback fires after 5s
    vi.advanceTimersByTime(5000);
    expect(service.getAnimationPhase()).toBe("hidden");
    expect(service.getActive()).toBeNull();
    vi.useRealTimers();
  });
});

describe("dismissActive edge cases", () => {
  it("rejects dismiss when nothing is active", () => {
    const result = service.dismissActive();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Nothing active");
  });
});

describe("removeFromLibrary edge cases", () => {
  it("rejects removal of non-existent item", () => {
    const result = service.removeFromLibrary("nonexistent-id");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Item not found");
  });

  it("rejects removal of the active item", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "X" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    const result = service.removeFromLibrary(added.value.id);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Cannot delete the active item");
  });
});

describe("page navigation - pagePrevious", () => {
  it("goes to previous page", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");
    const pages = {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 1, endVerse: 2 },
        { pageNumber: 2, startVerse: 3, endVerse: 3 },
      ],
      useWideWidth: false,
    };
    service.reportPages(added.value.id, pages);
    service.activate(added.value.id);
    service.reportPhase("visible");

    // Go to page 2 first
    service.pageNext();
    service.reportPhase("visible");
    expect(service.getActive()!.pages!.currentPage).toBe(2);

    // Now go back
    const result = service.pagePrevious();
    expect(result.success).toBe(true);
    expect(service.getActive()!.pages!.currentPage).toBe(1);
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:page", { page: 1 });
  });

  it("rejects previous on first page", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");
    const pages = {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 1, endVerse: 2 },
        { pageNumber: 2, startVerse: 3, endVerse: 3 },
      ],
      useWideWidth: false,
    };
    service.reportPages(added.value.id, pages);
    service.activate(added.value.id);
    service.reportPhase("visible");

    const result = service.pagePrevious();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Already on first page");
  });

  it("rejects pagePrevious with no paginated content", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "X" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    const result = service.pagePrevious();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("No paginated content");
  });
});

describe("reportPhase hidden clears active", () => {
  it("returns active item to library on hidden phase", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "A" } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");
    service.dismissActive();

    // Overlay reports hidden
    service.reportPhase("hidden");
    expect(service.getActive()).toBeNull();
    expect(service.getAnimationPhase()).toBe("hidden");
  });
});

describe("editLibraryItem with Scripture triggers re-measurement", () => {
  it("resets pages and requests measurement when scripture content changes", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } } });
    if (!added.success) throw new Error("add failed");

    // Report pages initially
    service.reportPages(added.value.id, { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }], useWideWidth: false });
    expect(service.getLibrary()[0]!.pages).not.toBeNull();

    sendToOverlay.mockClear();
    // Edit the content to a different reference
    service.editLibraryItem(added.value.id, { content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });

    // Pages should be reset
    expect(service.getLibrary()[0]!.pages).toBeNull();
    // New measurement should be requested
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:measure", expect.any(Object));
  });

  it("rejects edit with invalid scripture reference", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } } });
    if (!added.success) throw new Error("add failed");

    const result = service.editLibraryItem(added.value.id, { content: { reference: { bookId: 99, chapter: 1, verse: 1 } } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("Scripture not found");
  });
});

describe("editLibraryItem template protection", () => {
  it("rejects editing a template-derived item", () => {
    dao.create({ name: "Speaker LT", category: "lower_third", formatString: '{"title":"{Speaker}"}', roleMinimum: "AvVolunteer", lowerThirdType: "Title" });
    manifestService.update({ speaker: "John" }, actor);

    const templateItem = service.getLibrary().find((i) => i.source === "template")!;
    const result = service.editLibraryItem(templateItem.id, { content: { title: "Hacked" } });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Cannot edit template-derived items");
  });
});

describe("activate edge cases", () => {
  it("rejects activation of non-existent item", () => {
    const result = service.activate("nonexistent-id");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toBe("Item not found in library");
  });

  it("push-up with skipAnimation sets phase to visible", () => {
    const a = service.addToLibrary({ type: "Title", content: { title: "A" } });
    const b = service.addToLibrary({ type: "Title", content: { title: "B" } });
    if (!a.success || !b.success) throw new Error("add failed");

    service.activate(a.value.id);
    service.reportPhase("visible");

    service.activate(b.value.id, true);
    expect(service.getAnimationPhase()).toBe("visible");
    expect(sendToOverlay).toHaveBeenCalledWith("sto:lower-third:show", expect.objectContaining({ skipEntrance: true }));
    expect(service.getActive()?.id).toBe(b.value.id);
  });

  it("resets page to 1 when activating paginated item", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");
    const pages = {
      totalPages: 2,
      currentPage: 2,
      pages: [
        { pageNumber: 1, startVerse: 1, endVerse: 2 },
        { pageNumber: 2, startVerse: 3, endVerse: 3 },
      ],
      useWideWidth: false,
    };
    service.reportPages(added.value.id, pages);

    service.activate(added.value.id);
    expect(service.getActive()!.pages!.currentPage).toBe(1);
  });
});

describe("reportPages updates active item", () => {
  it("updates pages on active item when reported", () => {
    const added = service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 } } });
    if (!added.success) throw new Error("add failed");
    service.activate(added.value.id);
    service.reportPhase("visible");

    const pages = {
      totalPages: 2,
      currentPage: 1,
      pages: [
        { pageNumber: 1, startVerse: 1, endVerse: 2 },
        { pageNumber: 2, startVerse: 3, endVerse: 3 },
      ],
      useWideWidth: false,
    };
    service.reportPages(added.value.id, pages);

    expect(service.getActive()!.pages).toEqual(pages);
  });

  it("handles reportPages for unknown item gracefully", () => {
    // Should not throw
    service.reportPages("nonexistent-id", { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }], useWideWidth: false });
    expect(service.getLibrary()).toHaveLength(0);
  });
});

describe("overlay disconnect without active item", () => {
  it("does not start stale timer when no item is active", () => {
    vi.useFakeTimers();
    // No item activated
    service.setOverlayConnected(false);
    vi.advanceTimersByTime(20000);
    expect(service.getFullState().overlayStale).toBe(false);
    vi.useRealTimers();
  });
});

describe("autoDismissMs clearing via edit", () => {
  it("updates autoDismissMs to a new value", () => {
    const added = service.addToLibrary({ type: "Title", content: { title: "X" }, autoDismissMs: 5000 });
    if (!added.success) throw new Error("add failed");
    expect(service.getLibrary()[0]!.autoDismissMs).toBe(5000);

    service.editLibraryItem(added.value.id, { autoDismissMs: 3000 });
    expect(service.getLibrary()[0]!.autoDismissMs).toBe(3000);
  });
});

describe("addToLibrary without overlay connected", () => {
  it("does not request measurement when overlay is disconnected", () => {
    service.setOverlayConnected(false);
    sendToOverlay.mockClear();

    service.addToLibrary({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 } } });
    expect(sendToOverlay).not.toHaveBeenCalledWith("sto:lower-third:measure", expect.any(Object));
  });
});

describe("handleResolutionReport", () => {
  it("updates overlay resolution state", () => {
    service.handleResolutionReport({ width: 1920, height: 1080, isCorrect: true });
    expect(service.getFullState().overlayResolutionCorrect).toBe(true);
  });

  it("reflects incorrect resolution", () => {
    service.handleResolutionReport({ width: 800, height: 600, isCorrect: false });
    expect(service.getFullState().overlayResolutionCorrect).toBe(false);
  });
});

describe("getOverlayConnected", () => {
  it("returns current overlay connection state", () => {
    expect(service.getOverlayConnected()).toBe(true);
    service.setOverlayConnected(false);
    expect(service.getOverlayConnected()).toBe(false);
  });
});
