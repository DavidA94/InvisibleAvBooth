import { describe, it, expect, vi, beforeEach } from "vitest";

// We need fresh module state for each test
let loadNdi: () => Promise<boolean>;
let getNdiModule: () => unknown;
let isNdiAvailable: () => boolean;

const mockEmit = vi.fn();

beforeEach(async () => {
  vi.resetModules();
  mockEmit.mockClear();
  vi.mock("../logger.js", () => ({
    logger: { info: vi.fn(), error: vi.fn() },
  }));
  vi.mock("../eventBus/eventBus.js", () => ({
    eventBus: { emit: mockEmit, subscribe: vi.fn() },
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
    // No Banner emitted on success
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("returns false and emits Banner when grandiose is unavailable", async () => {
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
    // Banner emitted on failure
    expect(mockEmit).toHaveBeenCalledWith(
      "bus:device:capabilities:updated",
      expect.objectContaining({
        deviceId: "ndi",
        capabilities: expect.objectContaining({ features: { ndi: false } }),
      }),
    );
  });

  it("returns cached result on second call without re-emitting Banner", async () => {
    vi.doMock("grandiose", () => ({ default: { find: vi.fn() } }));
    const mod = await import("./ndiLoader.js");
    loadNdi = mod.loadNdi;
    isNdiAvailable = mod.isNdiAvailable;

    await loadNdi();
    expect(isNdiAvailable()).toBe(true);
    // Second call should return same result without re-importing
    const result = await loadNdi();
    expect(result).toBe(true);
    expect(mockEmit).not.toHaveBeenCalled();
  });
});
