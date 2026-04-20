import { BUS_OBS_STATE_CHANGED, BUS_SESSION_MANIFEST_UPDATED } from "./../eventBus/types.js";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { SessionManifestService, DEFAULT_STREAM_TITLE_TEMPLATE } from "./sessionManifestService.js";
import { interpolateStreamTitle } from "@invisible-av-booth/shared";
import { eventBus } from "../eventBus/eventBus.js";
import type { ObsState } from "../gateway/modules/obs/types.js";
import type { JwtPayload } from "./authService.js";

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

// Track subscribed handlers and service instances so we can clean up after each test
const cleanups: Array<() => void> = [];
const services: SessionManifestService[] = [];

function makeSvc(template?: string) {
  const service = new SessionManifestService(template);
  services.push(service);
  return service;
}

beforeEach(() => {
  // Emit idle state to reset any cached OBS state from previous tests
  eventBus.emit(BUS_OBS_STATE_CHANGED, { state: idleObsState });
});

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  services.forEach((s) => s.destroy());
  services.length = 0;
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
  it("resets manifest to empty", () => {
    const service = makeSvc();
    service.update({ speaker: "John" }, actor);
    service.clear(actor);
    expect(service.get()).toEqual({});
  });

  it("emits session:manifest:updated with empty manifest", () => {
    const service = makeSvc();
    service.update({ speaker: "John" }, actor);
    const handler = vi.fn();
    eventBus.subscribe(BUS_SESSION_MANIFEST_UPDATED, handler);
    cleanups.push(() => eventBus.unsubscribe(BUS_SESSION_MANIFEST_UPDATED, handler));

    service.clear(actor);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ manifest: {} }));
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

// ── interpolate ───────────────────────────────────────────────────────────────

describe("interpolateStreamTitle (shared)", () => {
  it("replaces {Speaker}, {Title}, {Date}", () => {
    const result = interpolateStreamTitle({ speaker: "John", title: "Grace" }, DEFAULT_STREAM_TITLE_TEMPLATE);
    expect(result).toContain("John");
    expect(result).toContain("Grace");
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it("uses placeholders for missing fields", () => {
    const result = interpolateStreamTitle({}, DEFAULT_STREAM_TITLE_TEMPLATE);
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
  });

  it("formats single verse scripture", () => {
    const result = interpolateStreamTitle({ scripture: { bookId: 43, chapter: 3, verse: 16 } }, "{Scripture}");
    expect(result).toBe("John 3:16");
  });

  it("formats verse range scripture", () => {
    const result = interpolateStreamTitle({ scripture: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } }, "{Scripture}");
    expect(result).toBe("John 3:16-17");
  });

  it("uses [No Scripture] when scripture is absent", () => {
    expect(interpolateStreamTitle({}, "{Scripture}")).toBe("[No Scripture]");
  });

  it("{Date} is always today — never [No Date]", () => {
    const result = interpolateStreamTitle({}, "{Date}");
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
          const manifest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as { speaker?: string; title?: string };
          const result = interpolateStreamTitle(manifest, DEFAULT_STREAM_TITLE_TEMPLATE);
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
          const manifest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as { speaker?: string; title?: string };
          const result = interpolateStreamTitle(manifest, template);
          expect(typeof result).toBe("string");
        },
      ),
    );
  });

  it("missing fields always produce visible placeholders, never empty tokens", () => {
    const result = interpolateStreamTitle({}, "{Speaker} {Title} {Scripture}");
    expect(result).not.toContain("{}");
    expect(result).not.toMatch(/\{\w+\}/);
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
    expect(result).toContain("[No Scripture]");
  });
});
