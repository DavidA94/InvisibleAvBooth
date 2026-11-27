import { describe, it, expect, afterEach } from "vitest";
import { remToPx, rootFontSizePx } from "./rem";

afterEach(() => {
  document.documentElement.style.fontSize = "";
});

describe("rem helpers", () => {
  it("reads the current root font size", () => {
    document.documentElement.style.fontSize = "14.5px";
    expect(rootFontSizePx()).toBe(14.5);
  });

  it("converts rem at the current scale, not a fixed 16", () => {
    document.documentElement.style.fontSize = "16px";
    expect(remToPx(12.5)).toBe(200);
    document.documentElement.style.fontSize = "12px";
    expect(remToPx(12.5)).toBe(150);
  });

  it("falls back to 16 when the root size cannot be read", () => {
    document.documentElement.style.fontSize = "not-a-size";
    expect(rootFontSizePx()).toBeGreaterThan(0);
  });
});
