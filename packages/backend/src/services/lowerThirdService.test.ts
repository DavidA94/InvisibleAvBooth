import BetterSqlite3 from "better-sqlite3";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LowerThirdService } from "./lowerThirdService.js";
import { MetadataTemplateDao } from "../dao/metadataTemplateDao.js";
import { SessionManifestService } from "./sessionManifestService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_LOWER_THIRD_STATE_CHANGED } from "../eventBus/types.js";
import { applySchema } from "../database/schema.js";
import type { Database } from "better-sqlite3";
import type { AddLowerThirdInput, AnimationPhase } from "@invisible-av-booth/shared";
import type { JwtPayload } from "./authService.js";

const actor: JwtPayload = { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 };

function createDatabase(): Database {
  const db = new BetterSqlite3(":memory:");
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  // Seed a title template so SessionManifestService doesn't complain
  db.prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)").run(
    "t1", "Default", "title", "{Date} – {Speaker}", "AvVolunteer", new Date().toISOString(),
  );
  return db;
}

function seedKjv(db: Database): void {
  db.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(1, 1, 1, "In the beginning God created the heaven and the earth.");
  db.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(1, 1, 2, "And the earth was without form, and void.");
  db.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(1, 1, 3, "And God said, Let there be light: and there was light.");
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
    const pages = { totalPages: 2, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }, { pageNumber: 2, startVerse: 3, endVerse: 3 }], useWideWidth: false };
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
