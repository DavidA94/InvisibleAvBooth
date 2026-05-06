import { describe, it, expect, beforeEach } from "vitest";
import { readUserFromCookie } from "./authCookie";

function setCookie(value: string): void {
  // jsdom allows direct assignment; each assignment adds/updates a cookie.
  document.cookie = value;
}

function clearCookies(): void {
  // Expire every existing cookie.
  document.cookie.split("; ").forEach((c) => {
    const name = c.split("=")[0];
    if (name) document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });
}

beforeEach(() => {
  clearCookies();
});

describe("readUserFromCookie", () => {
  it("returns null when no user_info cookie is present", () => {
    expect(readUserFromCookie()).toBeNull();
  });

  it("returns null when cookie has other values but no user_info", () => {
    setCookie("other=foo");
    setCookie("another=bar");
    expect(readUserFromCookie()).toBeNull();
  });

  it("returns parsed user from a valid JSON cookie", () => {
    const user = { id: "u1", username: "admin", role: "ADMIN" };
    setCookie(`user_info=${encodeURIComponent(JSON.stringify(user))}`);
    expect(readUserFromCookie()).toEqual(user);
  });

  it("returns null when cookie JSON is malformed", () => {
    setCookie(`user_info=${encodeURIComponent("{not valid json")}`);
    expect(readUserFromCookie()).toBeNull();
  });

  it("decodes URL-encoded cookie values", () => {
    const user = { id: "u1", username: "admin user", role: "ADMIN" };
    setCookie(`user_info=${encodeURIComponent(JSON.stringify(user))}`);
    expect(readUserFromCookie()).toEqual(user);
  });

  it("preserves '=' characters inside the JSON payload", () => {
    // A JSON value containing '=' (e.g. base64 padding) must not be truncated by split("=")
    const user = { id: "u1", username: "admin", role: "ADMIN", token: "abc==" };
    setCookie(`user_info=${encodeURIComponent(JSON.stringify(user))}`);
    expect(readUserFromCookie()).toEqual(user);
  });
});
