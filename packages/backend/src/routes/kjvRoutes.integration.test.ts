import { describe, it, expect, beforeAll } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";
import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { applySchema } from "../db/schema.js";
import { seedKjv } from "../db/database.js";
import { AuthService } from "../services/authService.js";
import { createAuthRouter } from "./authRoutes.js";
import { createKjvRouter } from "./kjvRoutes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const KJV_SQL_PATH = join(__dirname, "..", "..", "..", "..", "bibledb_kjv.sql");

// Use a dedicated in-memory database for this test file — avoids singleton
// interference with database.test.ts which calls resetDb() in beforeEach.
let cookie = "";

beforeAll(async () => {
  const database = new Database(":memory:");
  database.pragma("foreign_keys = ON");
  applySchema(database);
  seedKjv(database, KJV_SQL_PATH); // loads real KJV data

  const authService = new AuthService(database);
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/auth", createAuthRouter(authService));
  app.use("/api/kjv", createKjvRouter(database, authService));

  // Create a user, log in, then change password (new users require password change)
  await authService.createUser(
    { username: "admin", password: "pass", role: "ADMIN" },
    { sub: "seed", username: "seed", role: "ADMIN", iat: 0, exp: 9999999999 },
  );
  const loginResponse = await request(app).post("/auth/login").send({ username: "admin", password: "pass" });
  const tempCookie = (loginResponse.headers["set-cookie"] as unknown as string[])[0] ?? "";
  const changeResponse = await request(app).post("/auth/change-password").set("Cookie", tempCookie).send({ newPassword: "pass" });
  cookie = (changeResponse.headers["set-cookie"] as unknown as string[])[0] ?? "";

  (globalThis as Record<string, unknown>)["__kjvApp"] = app;
});

function getApp(): express.Express {
  return (globalThis as Record<string, unknown>)["__kjvApp"] as express.Express;
}

describe("GET /api/kjv/validate", () => {
  it("returns valid for John 3:16", async () => {
    // John = bookId 43
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16 }).set("Cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ valid: true });
  });

  it("returns valid for a verse range John 3:16-17", async () => {
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16, verseEnd: 17 }).set("Cookie", cookie);
    expect(response.body).toEqual({ valid: true });
  });

  it("returns BOOK_NOT_FOUND for bookId 0", async () => {
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 0, chapter: 1, verse: 1 }).set("Cookie", cookie);
    expect(response.body).toEqual({ valid: false, reason: "BOOK_NOT_FOUND" });
  });

  it("returns BOOK_NOT_FOUND for bookId 67", async () => {
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 67, chapter: 1, verse: 1 }).set("Cookie", cookie);
    expect(response.body).toEqual({ valid: false, reason: "BOOK_NOT_FOUND" });
  });

  it("returns CHAPTER_NOT_FOUND for a chapter that does not exist", async () => {
    // John has 21 chapters
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 999, verse: 1 }).set("Cookie", cookie);
    expect(response.body).toEqual({ valid: false, reason: "CHAPTER_NOT_FOUND" });
  });

  it("returns VERSE_NOT_FOUND for a verse that does not exist", async () => {
    // John 3 has 36 verses
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 999 }).set("Cookie", cookie);
    expect(response.body).toEqual({ valid: false, reason: "VERSE_NOT_FOUND" });
  });

  it("returns VERSE_END_NOT_FOUND when verseEnd does not exist", async () => {
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16, verseEnd: 999 }).set("Cookie", cookie);
    expect(response.body).toEqual({ valid: false, reason: "VERSE_END_NOT_FOUND" });
  });

  it("returns 401 without auth", async () => {
    const response = await request(getApp()).get("/api/kjv/validate").query({ bookId: 43, chapter: 3, verse: 16 });
    expect(response.status).toBe(401);
  });
});
