import { Router } from "express";
import type { Request, Response } from "express";
import type { Database } from "better-sqlite3";
import type { AuthService } from "../services/authService.js";

type ReasonCode = "BOOK_NOT_FOUND" | "CHAPTER_NOT_FOUND" | "VERSE_NOT_FOUND" | "VERSE_END_NOT_FOUND";

export function createKjvRouter(database: Database, authService: AuthService): Router {
  const router = Router();
  void authService;

  // GET /api/kjv/validate?bookId=&chapter=&verse=&verseEnd=
  // Authentication is applied at mount time in src/index.ts so request.jwtPayload
  // is already present for all routes in this router.
  router.get("/validate", (request: Request, response: Response): void => {
    const bookId = parseInt(request.query["bookId"] as string, 10);
    const chapter = parseInt(request.query["chapter"] as string, 10);
    const verse = parseInt(request.query["verse"] as string, 10);
    const verseEndRaw = request.query["verseEnd"] as string | undefined;
    const verseEnd = verseEndRaw ? parseInt(verseEndRaw, 10) : undefined;

    const invalid = (reason: ReasonCode): void => {
      response.json({ valid: false, reason });
    };

    // Check book exists (bookId 1–66)
    const bookExists = database.prepare("SELECT 1 FROM kjv WHERE BOOKID = ? LIMIT 1").get(bookId);
    if (!bookExists) {
      invalid("BOOK_NOT_FOUND");
      return;
    }

    // Check chapter exists for this book
    const chapterExists = database.prepare("SELECT 1 FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? LIMIT 1").get(bookId, chapter);
    if (!chapterExists) {
      invalid("CHAPTER_NOT_FOUND");
      return;
    }

    // Check verse exists for this book/chapter
    const verseExists = database.prepare("SELECT 1 FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? AND VERSENO = ? LIMIT 1").get(bookId, chapter, verse);
    if (!verseExists) {
      invalid("VERSE_NOT_FOUND");
      return;
    }

    // Check verseEnd if provided
    if ((verseEnd ?? 0) > 0) {
      const verseEndExists = database.prepare("SELECT 1 FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? AND VERSENO = ? LIMIT 1").get(bookId, chapter, verseEnd);
      if (!verseEndExists) {
        invalid("VERSE_END_NOT_FOUND");
        return;
      }
    }

    response.json({ valid: true });
  });

  return router;
}
