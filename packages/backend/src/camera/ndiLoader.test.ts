import { describe, it, expect, vi, beforeEach } from "vitest";

// We need fresh module state for each test
let loadNdi: () => Promise<boolean>;
let getNdiModule: () => unknown;
let isNdiAvailable: () => boolean;

beforeEach(async () => {
  vi.resetModules();
  vi.mock("../logger.js", () => ({
    logger: { info: vi.fn(), error: vi.fn() },
  }));
});

describe("ndiLoader", () => {
  it("returns true and sets module when grandiose loads successfully", async () => {
    vi.doMock("grandiose", () => ({ default: { find: vi.fn() } }));
    const mod = await import("./ndiLoader.js");
    loadNdi = mod.loadNdi;
    getNdiModule = mod.getNdiModule;
    isNdiAvailable = mod.isNdiAvailable;

    const result = await loadNdi();
    expect(result).toBe(true);
    expect(isNdiAvailable()).toBe(true);
    expect(getNdiModule()).toBeDefined();
  });

  it("returns false when grandiose is unavailable", async () => {
    vi.doMock("grandiose", () => {
      throw new Error("Cannot find module 'grandiose'");
    });
    const mod = await import("./ndiLoader.js");
    loadNdi = mod.loadNdi;
    getNdiModule = mod.getNdiModule;
    isNdiAvailable = mod.isNdiAvailable;

    const result = await loadNdi();
    expect(result).toBe(false);
    expect(isNdiAvailable()).toBe(false);
    expect(getNdiModule()).toBeNull();
  });

  it("returns cached result on second call", async () => {
    vi.doMock("grandiose", () => ({ default: { find: vi.fn() } }));
    const mod = await import("./ndiLoader.js");
    loadNdi = mod.loadNdi;
    isNdiAvailable = mod.isNdiAvailable;

    await loadNdi();
    expect(isNdiAvailable()).toBe(true);
    // Second call should return same result without re-importing
    const result = await loadNdi();
    expect(result).toBe(true);
  });
});
