import { describe, it, expect } from "vitest";
import { formatScripture, interpolateStreamTitle } from "./interpolation";

describe("formatScripture", () => {
  it("formats a single verse", () => {
    expect(formatScripture({ bookId: 43, chapter: 3, verse: 16 })).toBe("John 3:16");
  });

  it("formats a verse range", () => {
    expect(formatScripture({ bookId: 43, chapter: 3, verse: 16, verseEnd: 17 })).toBe("John 3:16-17");
  });

  it("uses Roman numeral prefix for numbered books", () => {
    expect(formatScripture({ bookId: 62, chapter: 1, verse: 1 })).toBe("I John 1:1");
  });

  it("falls back to 'Book N' for unknown bookId", () => {
    expect(formatScripture({ bookId: 999, chapter: 1, verse: 1 })).toBe("Book 999 1:1");
  });
});

describe("interpolateStreamTitle", () => {
  it("uses default template when none provided", () => {
    const result = interpolateStreamTitle({ speaker: "John", title: "Grace" });
    expect(result).toContain("John");
    expect(result).toContain("Grace");
  });

  it("shows placeholders for missing fields", () => {
    const result = interpolateStreamTitle({});
    expect(result).toContain("[No Speaker]");
    expect(result).toContain("[No Title]");
  });

  it("interpolates scripture when present", () => {
    const result = interpolateStreamTitle(
      { speaker: "John", title: "Grace", scripture: { bookId: 43, chapter: 3, verse: 16 } },
      "{Speaker} – {Scripture}",
    );
    expect(result).toBe("John – John 3:16");
  });

  it("shows [No Scripture] when scripture is absent", () => {
    const result = interpolateStreamTitle({ speaker: "John" }, "{Speaker} – {Scripture}");
    expect(result).toBe("John – [No Scripture]");
  });

  it("interpolates {Date} with today's ISO date", () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = interpolateStreamTitle({}, "{Date}");
    expect(result).toBe(today);
  });

  it("uses provided template", () => {
    const result = interpolateStreamTitle({ speaker: "Jane", title: "Hope" }, "{Title} by {Speaker}");
    expect(result).toBe("Hope by Jane");
  });

  it("falls back to default template when template is empty string", () => {
    const result = interpolateStreamTitle({ speaker: "Jane", title: "Hope" }, "");
    expect(result).toContain("Jane");
    expect(result).toContain("Hope");
  });

  it("replaces multiple occurrences of the same token", () => {
    const result = interpolateStreamTitle({ speaker: "Jane" }, "{Speaker} and {Speaker}");
    expect(result).toBe("Jane and Jane");
  });
});
