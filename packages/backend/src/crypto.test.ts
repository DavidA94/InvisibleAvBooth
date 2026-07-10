import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { encrypt, decrypt } from "./crypto.js";

describe("crypto", () => {
  const originalKey = process.env["DEVICE_SECRET_KEY"];

  beforeEach(() => {
    process.env["DEVICE_SECRET_KEY"] = "a".repeat(64);
  });

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env["DEVICE_SECRET_KEY"] = originalKey;
    } else {
      delete process.env["DEVICE_SECRET_KEY"];
    }
  });

  it("encrypt and decrypt round-trip", () => {
    const plaintext = "my-secret-password";
    const encrypted = encrypt(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  it("getKey falls back to empty string when env var is unset", () => {
    delete process.env["DEVICE_SECRET_KEY"];
    // With an empty key (0 bytes), encrypt will fail due to invalid key length
    expect(() => encrypt("test")).toThrow();
  });
});
