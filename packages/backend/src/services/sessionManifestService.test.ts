import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fc from "fast-check";
import { SessionManifestService, DEFAULT_STREAM_TITLE_TEMPLATE } from "./sessionManifestService.js";
import { eventBus } from "../eventBus.js";
import type { ObsState } from "../eventBus.js";
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
  const svc = new SessionManifestService(template);
  services.push(svc);
  return svc;
}

beforeEach(() => {
  // Emit idle state to reset any cached OBS state from previous tests
  eventBus.emit("obs:state:changed", { state: idleObsState });
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
    const svc = makeSvc();
    expect(svc.get()).toEqual({});
  });
});

describe("SessionManifestService.update", () => {
  it("merges patch into manifest", () => {
    const svc = makeSvc();
    svc.update({ speaker: "John" }, actor);
    svc.update({ title: "Grace" }, actor);
    expect(svc.get()).toMatchObject({ speaker: "John", title: "Grace" });
  });

  it("emits session:manifest:updated on EventBus", () => {
    const svc = makeSvc();
    const handler = vi.fn();
    eventBus.subscribe("session:manifest:updated", handler);
    cleanups.push(() => eventBus.unsubscribe("session:manifest:updated", handler));

    svc.update({ speaker: "John" }, actor);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0]?.[0]).toMatchObject({
      manifest: { speaker: "John" },
      interpolatedStreamTitle: expect.any(String),
    });
  });

  it("returns the updated manifest", () => {
    const svc = makeSvc();
    const result = svc.update({ speaker: "John" }, actor);
    expect(result.success).toBe(true);
    if (result.success) expect(result.value.speaker).toBe("John");
  });
});

describe("SessionManifestService.clear", () => {
  it("resets manifest to empty", () => {
    const svc = makeSvc();
    svc.update({ speaker: "John" }, actor);
    svc.clear(actor);
    expect(svc.get()).toEqual({});
  });

  it("emits session:manifest:updated with empty manifest", () => {
    const svc = makeSvc();
    svc.update({ speaker: "John" }, actor);
    const handler = vi.fn();
    eventBus.subscribe("session:manifest:updated", handler);
    cleanups.push(() => eventBus.unsubscribe("session:manifest:updated", handler));

    svc.clear(actor);

    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ manifest: {} }));
  });

  it("is blocked while streaming", () => {
    const svc = makeSvc();
    eventBus.emit("obs:state:changed", { state: liveObsState });
    const result = svc.clear(actor);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CLEAR_BLOCKED_WHILE_LIVE");
  });

  it("is blocked while recording", () => {
    const svc = makeSvc();
    eventBus.emit("obs:state:changed", { state: recordingObsState });
    const result = svc.clear(actor);
    expect(result.success).toBe(false);
  });

  it("is allowed after streaming stops", () => {
    const svc = makeSvc();
    eventBus.emit("obs:state:changed", { state: liveObsState });
    eventBus.emit("obs:state:changed", { state: idleObsState });
    expect(svc.clear(actor).success).toBe(true);
  });
});

// ── interpolate ───────────────────────────────────────────────────────────────

describe("SessionManifestService.interpolate", () => {
  it("replaces {Speaker}, {Title}, {Date}", () => {
    const svc = makeSvc();
    const result = svc.interpolate({ speaker: "John", title: "Grace" }, DEFAULT_STREAM_TITLE_TEMPLATE);
    expect(result).toContain("John");
    expect(result).toContain("Grace");
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}/); // today's date
  });

  it("uses placeholders for missing fields", () => {
    const svc = makeSvc();
    const result = svc.interpolate({}, DEFAULT_STREAM_TITLE_TEMPLATE);
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
  });

  it("formats single verse scripture", () => {
    const svc = makeSvc();
    const result = svc.interpolate({ scripture: { bookId: 43, chapter: 3, verse: 16 } }, "{Scripture}");
    expect(result).toBe("John 3:16");
  });

  it("formats verse range scripture", () => {
    const svc = makeSvc();
    const result = svc.interpolate({ scripture: { bookId: 43, chapter: 3, verse: 16, verseEnd: 17 } }, "{Scripture}");
    expect(result).toBe("John 3:16-17");
  });

  it("uses [No Scripture] when scripture is absent", () => {
    const svc = makeSvc();
    expect(svc.interpolate({}, "{Scripture}")).toBe("[No Scripture]");
  });

  it("{Date} is always today — never [No Date]", () => {
    const svc = makeSvc();
    const result = svc.interpolate({}, "{Date}");
    expect(result).not.toContain("[No Date]");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ── Property-based tests ──────────────────────────────────────────────────────
// Feature: livestream-control-system, Property 1: Manifest propagation
// Feature: livestream-control-system, Property 2: Template interpolation completeness + placeholders

describe("Property: interpolate never returns undefined or throws", () => {
  it("handles arbitrary manifest field combinations", () => {
    const svc = makeSvc();
    fc.assert(
      fc.property(
        fc.record({
          speaker: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          title: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        }),
        (raw) => {
          // Strip undefined values to satisfy exactOptionalPropertyTypes
          const manifest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as { speaker?: string; title?: string };
          const result = svc.interpolate(manifest, DEFAULT_STREAM_TITLE_TEMPLATE);
          expect(typeof result).toBe("string");
          expect(result.length).toBeGreaterThan(0);
        },
      ),
    );
  });

  it("handles arbitrary template strings — always produces a string", () => {
    const svc = makeSvc();
    fc.assert(
      fc.property(
        fc.string(),
        fc.record({
          speaker: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
          title: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
        }),
        (template, raw) => {
          const manifest = Object.fromEntries(Object.entries(raw).filter(([, v]) => v !== undefined)) as { speaker?: string; title?: string };
          const result = svc.interpolate(manifest, template);
          expect(typeof result).toBe("string");
        },
      ),
    );
  });

  it("missing fields always produce visible placeholders, never empty tokens", () => {
    const svc = makeSvc();
    const result = svc.interpolate({}, "{Speaker} {Title} {Scripture}");
    expect(result).not.toContain("{}");
    expect(result).not.toMatch(/\{\w+\}/); // no unreplaced tokens
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
    expect(result).toContain("[No Scripture]");
  });
});
