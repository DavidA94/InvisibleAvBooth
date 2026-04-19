import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "./logger";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  logger._reset();
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  logger._reset();
  vi.useRealTimers();
});

describe("frontend logger", () => {
  it("buffers entries and POSTs to /api/logs on flush", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    logger.info("test message", { userId: "u1" });
    expect(logger._bufferLength()).toBe(1);

    await logger.flush();

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/logs");
    expect(options.method).toBe("POST");
    expect(options.credentials).toBe("include");

    const body = JSON.parse(options.body as string) as unknown[];
    expect(body).toHaveLength(1);
    expect((body[0] as Record<string, unknown>).message).toBe("test message");
    expect((body[0] as Record<string, unknown>).source).toBe("frontend");
    expect((body[0] as Record<string, unknown>).level).toBe("info");
    expect((body[0] as Record<string, unknown>).userId).toBe("u1");
  });

  it("retries up to 3 times on failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce({ ok: true });

    logger.error("fail message");

    // Advance timers for retry delays
    const flushPromise = logger.flush();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromise;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(logger._bufferLength()).toBe(0);
  });

  it("re-buffers entries when all retries are exhausted", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(new Error("network")).mockRejectedValueOnce(new Error("network"));

    logger.warn("lost message");

    const flushPromise = logger.flush();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromise;

    expect(mockFetch).toHaveBeenCalledTimes(3);
    // Entries are re-buffered for next flush
    expect(logger._bufferLength()).toBe(1);
  });

  it("does not POST when buffer is empty", async () => {
    await logger.flush();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("supports all log levels", () => {
    logger.debug("d");
    logger.info("i");
    logger.warn("w");
    logger.error("e");
    expect(logger._bufferLength()).toBe(4);
  });
});
