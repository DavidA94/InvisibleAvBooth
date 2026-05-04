import BetterSqlite3 from "better-sqlite3";
import { BUS_OBS_STATE_CHANGED, BUS_SESSION_MANIFEST_UPDATED } from "../eventBus/types.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { SessionManifestService, DEFAULT_STREAM_TITLE_TEMPLATE } from "./sessionManifestService.js";
import { interpolateTemplate } from "@invisible-av-booth/shared";
import { eventBus } from "../eventBus/eventBus.js";
import { applySchema } from "../database/schema.js";
import type { ObsState } from "../gateway/modules/obs/types.js";
import type { JwtPayload } from "./authService.js";
import type { Database } from "better-sqlite3";

const actor: JwtPayload = { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 };

const liveObsState: ObsState = {
  connected: true,
  streaming: true,
  recording: false,
  commandedState: { streaming: true, recording: false },
};
const recordingObsState: ObsState = {
  connected: true,
  streaming: false,
  recording: true,
  commandedState: { streaming: false, recording: true },
};
const idleObsState: ObsState = {
  connected: true,
  streaming: false,
  recording: false,
  commandedState: { streaming: false, recording: false },
};

let database: Database;
const services: SessionManifestService[] = [];
const cleanups: Array<() => void> = [];

function createDatabase(): Database {
  const database = new BetterSqlite3(":memory:");
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  return database;
}

function insertTemplate(id: string, name: string, category: string, formatString: string): void {
  database
    .prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
    .run(id, name, category, formatString, "AvVolunteer", new Date().toISOString());
}

function insertKjvVerse(bookId: number, chapter: number, verse: number, text: string): void {
  database.prepare("INSERT INTO kjv (BOOKID, CHAPTERNO, VERSENO, VERSETEXT) VALUES (?, ?, ?, ?)").run(bookId, chapter, verse, text);
}

function makeSvc(): SessionManifestService {
  const service = new SessionManifestService(database);
  services.push(service);
  return service;
}

beforeEach(() => {
  database = createDatabase();
  eventBus.emit(BUS_OBS_STATE_CHANGED, { state: idleObsState });
});

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  services.forEach((service) => service.destroy());
  services.length = 0;
  database.close();
  vi.restoreAllMocks();
});

// ── get / update / clear ──────────────────────────────────────────────────────

describe("SessionManifestService.get", () => {
  it("returns empty manifest initially", () => {
    const service = makeSvc();
    expect(service.get()).toEqual({});
  });
});

describe("SessionManifestService.update", () => {
  it("merges patch into manifest", () => {
    const service = makeSvc();
    service.update({ speaker: "John" }, actor);
    service.update({ title: "Grace" }, actor);
    expect(service.get()).toMatchObject({ speaker: "John", title: "Grace" });
  });

  it("emits session:manifest:updated on EventBus", () => {
    const service = makeSvc();
    const handler = vi.fn();
    eventBus.subscribe(BUS_SESSION_MANIFEST_UPDATED, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_SESSION_MANIFEST_UPDATED, handler));

    service.update({ speaker: "John" }, actor);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      manifest: { speaker: "John" },
      interpolatedStreamTitle: expect.any(String),
    });
  });

  it("returns the updated manifest", () => {
    const service = makeSvc();
    const result = service.update({ speaker: "John" }, actor);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.speaker).toBe("John");
  });
});

describe("SessionManifestService.clear", () => {
  it("resets manifest fields but preserves template IDs", () => {
    insertTemplate("t1", "Default", "title", "{Speaker}");
    const service = makeSvc();
    service.update({ speaker: "John", titleTemplateId: "t1" }, actor);
    service.clear(actor);
    const manifest = service.get();
    expect(manifest.speaker).toBeUndefined();
    expect(manifest.titleTemplateId).toBe("t1");
  });

  it("emits session:manifest:updated with cleared manifest", () => {
    const service = makeSvc();
    service.update({ speaker: "John" }, actor);
    const handler = vi.fn();
    eventBus.subscribe(BUS_SESSION_MANIFEST_UPDATED, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_SESSION_MANIFEST_UPDATED, handler));

    service.clear(actor);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ manifest: expect.any(Object) }));
  });

  it("is blocked while streaming", () => {
    const service = makeSvc();
    eventBus.emit(BUS_OBS_STATE_CHANGED, { state: liveObsState });
    const result = service.clear(actor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CLEAR_BLOCKED_WHILE_LIVE");
  });

  it("is blocked while recording", () => {
    const service = makeSvc();
    eventBus.emit(BUS_OBS_STATE_CHANGED, { state: recordingObsState });
    const result = service.clear(actor);
    expect(result.success).toBe(false);
  });

  it("is allowed after streaming stops", () => {
    const service = makeSvc();
    eventBus.emit(BUS_OBS_STATE_CHANGED, { state: liveObsState });
    eventBus.emit(BUS_OBS_STATE_CHANGED, { state: idleObsState });
    expect(service.clear(actor).success).toBe(true);
  });
});

// ── multi-template interpolation ──────────────────────────────────────────────

describe("multi-template interpolation", () => {
  it("uses title template from DAO when titleTemplateId is set", () => {
    insertTemplate("t1", "Custom", "title", "{Speaker} preaches {Title}");
    const service = makeSvc();
    service.update({ titleTemplateId: "t1", speaker: "John", title: "Grace" }, actor);
    expect(service.getInterpolated().interpolatedStreamTitle).toBe("John preaches Grace");
  });

  it("falls back to DEFAULT_STREAM_TITLE_TEMPLATE when no titleTemplateId", () => {
    const service = makeSvc();
    service.update({ speaker: "John", title: "Grace" }, actor);
    const { interpolatedStreamTitle } = service.getInterpolated();
    expect(interpolatedStreamTitle).toContain("John");
    expect(interpolatedStreamTitle).toContain("Grace");
    expect(interpolatedStreamTitle).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("interpolates description template when descriptionTemplateId is set", () => {
    insertTemplate("d1", "Desc", "description", "Sermon by {Speaker}");
    const service = makeSvc();
    service.update({ descriptionTemplateId: "d1", speaker: "John" }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("Sermon by John");
  });

  it("returns empty description when no descriptionTemplateId", () => {
    const service = makeSvc();
    service.update({ speaker: "John" }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("");
  });

  it("returns empty description when description template has empty formatString", () => {
    insertTemplate("d1", "None", "description", "");
    const service = makeSvc();
    service.update({ descriptionTemplateId: "d1", speaker: "John" }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("");
  });
});

// ── manifestReady ─────────────────────────────────────────────────────────────

describe("manifestReady", () => {
  it("is false when no titleTemplateId is set", () => {
    const service = makeSvc();
    service.update({ speaker: "John", title: "Grace" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(false);
  });

  it("is true when titleTemplateId is set and all tokens are filled", () => {
    insertTemplate("t1", "Default", "title", "{Date} – {Speaker} – {Title}");
    const service = makeSvc();
    service.update({ titleTemplateId: "t1", speaker: "John", title: "Grace" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(true);
  });

  it("is false when a required token is missing", () => {
    insertTemplate("t1", "Default", "title", "{Speaker} – {Title}");
    const service = makeSvc();
    service.update({ titleTemplateId: "t1", speaker: "John" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(false);
  });

  it("considers description template tokens too", () => {
    insertTemplate("t1", "Title", "title", "{Date}");
    insertTemplate("d1", "Desc", "description", "{Speaker} on {Title}");
    const service = makeSvc();
    service.update({ titleTemplateId: "t1", descriptionTemplateId: "d1", speaker: "John" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(false);
    service.update({ title: "Grace" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(true);
  });

  it("requires scripture when {Scripture} token is present", () => {
    insertTemplate("t1", "Default", "title", "{Scripture} – {Speaker}");
    const service = makeSvc();
    service.update({ titleTemplateId: "t1", speaker: "John" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(false);
    service.update({ scripture: { bookId: 43, chapter: 3, verse: 16 } }, actor);
    expect(service.getInterpolated().manifestReady).toBe(true);
  });

  it("requires scripture when {verseText} token is present", () => {
    insertTemplate("t1", "Default", "title", "{Speaker}");
    insertTemplate("d1", "Desc", "description", "{verseText}");
    const service = makeSvc();
    service.update({ titleTemplateId: "t1", descriptionTemplateId: "d1", speaker: "John" }, actor);
    expect(service.getInterpolated().manifestReady).toBe(false);
    service.update({ scripture: { bookId: 43, chapter: 3, verse: 16 } }, actor);
    expect(service.getInterpolated().manifestReady).toBe(true);
  });
});

// ── verseTextResolver ─────────────────────────────────────────────────────────

describe("verseTextResolver", () => {
  it("resolves single verse from KJV table", () => {
    insertTemplate("d1", "Desc", "description", "{verseText}");
    insertKjvVerse(43, 3, 16, "For God so loved the world");
    const service = makeSvc();
    service.update({ descriptionTemplateId: "d1", scripture: { bookId: 43, chapter: 3, verse: 16 } }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("For God so loved the world");
  });

  it("resolves verse range from KJV table", () => {
    insertTemplate("d1", "Desc", "description", "{verseText}");
    insertKjvVerse(43, 3, 16, "For God so loved the world");
    insertKjvVerse(43, 3, 17, "For God sent not his Son");
    const service = makeSvc();
    service.update({ descriptionTemplateId: "d1", scripture: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("For God so loved the world For God sent not his Son");
  });

  it("returns [Verse not found] for missing verse", () => {
    insertTemplate("d1", "Desc", "description", "{verseText}");
    const service = makeSvc();
    service.update({ descriptionTemplateId: "d1", scripture: { bookId: 99, chapter: 1, verse: 1 } }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("[Verse not found]");
  });

  it("resolves whole chapter when verse is 0", () => {
    insertTemplate("d1", "Desc", "description", "{verseText}");
    insertKjvVerse(19, 23, 1, "The LORD is my shepherd");
    insertKjvVerse(19, 23, 2, "He maketh me to lie down");
    const service = makeSvc();
    service.update({ descriptionTemplateId: "d1", scripture: { bookId: 19, chapter: 23, verse: 0 } }, actor);
    expect(service.getInterpolated().interpolatedDescription).toBe("The LORD is my shepherd He maketh me to lie down");
  });
});

// ── interpolate (shared) ──────────────────────────────────────────────────────

describe("interpolateStreamTitle (shared)", () => {
  it("replaces {Speaker}, {Title}, {Date}", () => {
    const result = interpolateTemplate({ speaker: "John", title: "Grace" }, DEFAULT_STREAM_TITLE_TEMPLATE);
    expect(result).toContain("John");
    expect(result).toContain("Grace");
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("uses placeholders for missing fields", () => {
    const result = interpolateTemplate({}, DEFAULT_STREAM_TITLE_TEMPLATE);
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
  });

  it("formats single verse scripture", () => {
    const result = interpolateTemplate({ scripture: { bookId: 43, chapter: 3, verse: 16 } }, "{Scripture}");
    expect(result).toBe("John 3:16");
  });

  it("formats verse range scripture", () => {
    const result = interpolateTemplate({ scripture: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } }, "{Scripture}");
    expect(result).toBe("John 3:16-17");
  });

  it("uses [No Scripture] when scripture is absent", () => {
    expect(interpolateTemplate({}, "{Scripture}")).toBe("[No Scripture]");
  });

  it("{Date} is always today — never [No Date]", () => {
    const result = interpolateTemplate({}, "{Date}");
    expect(result).not.toContain("[No Date]");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("Property: interpolateStreamTitle", () => {
  it("handles arbitrary manifest field combinations", () => {
    fc.assert(
      fc.property(
        fc.record({
          speaker: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          title: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        }),
        (raw) => {
          const manifest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as {
            speaker?: string;
            title?: string;
          };
          const result = interpolateTemplate(manifest, DEFAULT_STREAM_TITLE_TEMPLATE);
          expect(typeof result).toBe("string");
          expect(result.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("handles arbitrary template strings — always produces a string", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.record({
          speaker: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          title: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        }),
        (template, raw) => {
          const manifest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as {
            speaker?: string;
            title?: string;
          };
          const result = interpolateTemplate(manifest, template);
          expect(typeof result).toBe("string");
        },
      ),
    );
  });

  it("missing fields always produce visible placeholders, never empty tokens", () => {
    const result = interpolateTemplate({}, "{Speaker} {Title} {Scripture}");
    expect(result).not.toContain("{}");
    expect(result).not.toMatch(/\{\w+\}/);
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
    expect(result).toContain("[No Scripture]");
  });
});

// ── Property: manifestReady determinism (P26) ─────────────────────────────────

describe("Property: manifestReady determinism", () => {
  it("manifestReady is deterministic for the same manifest and templates", () => {
    fc.assert(
      fc.property(
        fc.record({
          speaker: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          title: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        }),
        fc.boolean(),
        (raw, hasTitleTemplate) => {
          const freshDatabase = createDatabase();
          try {
            if (hasTitleTemplate) {
              freshDatabase
                .prepare("INSERT INTO metadata_templates (id, name, category, formatString, roleMinimum, createdAt) VALUES (?, ?, ?, ?, ?, ?)")
                .run("t1", "Test", "title", "{Speaker} – {Title}", "AvVolunteer", new Date().toISOString());
            }
            const service1 = new SessionManifestService(freshDatabase);
            const service2 = new SessionManifestService(freshDatabase);
            const manifest = {
              ...Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)),
              ...(hasTitleTemplate ? { titleTemplateId: "t1" } : {}),
            };
            service1.update(manifest, actor);
            service2.update(manifest, actor);
            expect(service1.getInterpolated().manifestReady).toBe(service2.getInterpolated().manifestReady);
            service1.destroy();
            service2.destroy();
          } finally {
            freshDatabase.close();
          }
        },
      ),
    );
  });
});
