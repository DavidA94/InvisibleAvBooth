import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildTestServer, destroyServer, loginAsAdmin } from "../harness.js";
import type { TestServer } from "../harness.js";

let s: TestServer;
let cookie: string;

beforeAll(async () => {
  s = await buildTestServer({ seedKjv: true });
  cookie = await loginAsAdmin(s.agent, s.ctx.authService);
});
afterAll(() => destroyServer(s));

describe("GET /api/kjv/validate", () => {
  it("returns valid for John 3:16", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16 }).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
  });

  it("returns valid for a verse range John 3:16-17", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16, verseEnd: 17 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: true });
  });

  it("returns BOOK_NOT_FOUND for bookId 0", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 0, chapter: 1, verse: 1 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "BOOK_NOT_FOUND" });
  });

  it("returns BOOK_NOT_FOUND for bookId 67", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 67, chapter: 1, verse: 1 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "BOOK_NOT_FOUND" });
  });

  it("returns CHAPTER_NOT_FOUND for a chapter that does not exist", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 43, chapter: 999, verse: 1 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "CHAPTER_NOT_FOUND" });
  });

  it("returns VERSE_NOT_FOUND for a verse that does not exist", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 999 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "VERSE_NOT_FOUND" });
  });

  it("returns VERSE_END_NOT_FOUND when verseEnd does not exist", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16, verseEnd: 999 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "VERSE_END_NOT_FOUND" });
  });

  it("returns 401 without auth", async () => {
    const res = await s.agent.get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16 });
    expect(res.status).toBe(401);
  });
});
