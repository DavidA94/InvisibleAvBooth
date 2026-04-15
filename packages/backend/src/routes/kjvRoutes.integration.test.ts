import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import { getDb, resetDb } from "../db/database.js";
import { AuthService } from "../services/authService.js";
import { createAuthRouter } from "./authRoutes.js";
import { createKjvRouter } from "./kjvRoutes.js";

// Use the real KJV database so we can test actual book/chapter/verse existence.
// getDb() with no args uses the real bibledb_kjv.sql path.
// We reset before the suite to ensure a clean singleton.
let cookie = "";

beforeAll(async () => {
  resetDb();
  const database = getDb(); // loads real KJV data
  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", createAuthRouter(authService));
  app.use("/api/kjv", createKjvRouter(database, authService));

  // Create a user and log in once for all tests
  await authService.createUser(
    { username: "admin", password: "pass", role: "ADMIN" },
    { sub: "seed", username: "seed", role: "ADMIN", iat: 0, exp: 9999999999 },
  );
  const res = await request(app).post("/auth/login").send({ username: "admin", password: "pass" });
  cookie = (res.headers["set-cookie"] as unknown as string[])[0] ?? "";

  // Store app on module scope for tests
  (globalThis as Record<string, unknown>)["__kjvApp"] = app;
});

function getApp(): express.Express {
  return (globalThis as Record<string, unknown>)["__kjvApp"] as express.Express;
}

describe("GET /api/kjv/validate", () => {
  it("returns valid for John 3:16", async () => {
    // John = bookId 43
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16 }).set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ valid: true });
  });

  it("returns valid for a verse range John 3:16-17", async () => {
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16, verseEnd: 17 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: true });
  });

  it("returns BOOK_NOT_FOUND for bookId 0", async () => {
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 0, chapter: 1, verse: 1 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "BOOK_NOT_FOUND" });
  });

  it("returns BOOK_NOT_FOUND for bookId 67", async () => {
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 67, chapter: 1, verse: 1 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "BOOK_NOT_FOUND" });
  });

  it("returns CHAPTER_NOT_FOUND for a chapter that does not exist", async () => {
    // John has 21 chapters
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 999, verse: 1 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "CHAPTER_NOT_FOUND" });
  });

  it("returns VERSE_NOT_FOUND for a verse that does not exist", async () => {
    // John 3 has 36 verses
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 999 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "VERSE_NOT_FOUND" });
  });

  it("returns VERSE_END_NOT_FOUND when verseEnd does not exist", async () => {
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16, verseEnd: 999 }).set("Cookie", cookie);
    expect(res.body).toEqual({ valid: false, reason: "VERSE_END_NOT_FOUND" });
  });

  it("returns 401 without auth", async () => {
    const res = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16 });
    expect(res.status).toBe(401);
  });
});
