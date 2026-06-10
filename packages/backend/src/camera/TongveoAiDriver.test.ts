import { describe, it, expect, vi, beforeEach } from "vitest";
import { TongveoAiDriver } from "./TongveoAiDriver.js";

const mockFetch = vi.fn().mockResolvedValue({ ok: true });

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockClear();
});

describe("TongveoAiDriver", () => {
  const driver = new TongveoAiDriver("192.168.1.100", "session=abc123", "cred-id-456");

  it("enable sends aiControl AND setPTZCmd", async () => {
    await driver.setAiState(true, true, false);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // First call: aiControl
    const [url1, opts1] = mockFetch.mock.calls[0]!;
    expect(url1).toBe("http://192.168.1.100/api/aiControl");
    expect(opts1.method).toBe("POST");
    expect(opts1.headers.Cookie).toBe("session=abc123");
    const body1 = JSON.parse(opts1.body);
    expect(body1.ai_on).toBe("1");
    expect(body1.ai_auto_tilt).toBe("1");
    expect(body1.ai_auto_zoom).toBe("0");

    // Second call: setPTZCmd
    const [url2, opts2] = mockFetch.mock.calls[1]!;
    expect(url2).toBe("http://192.168.1.100/api/setPTZCmd");
    expect(opts2.method).toBe("POST");
    expect(opts2.headers.Cookie).toBe("session=abc123");
    const body2 = JSON.parse(opts2.body);
    expect(body2.ID).toBe("cred-id-456");
    expect(body2.PtzCmd).toBe(15);
  });

  it("disable sends only aiControl (never setPTZCmd)", async () => {
    await driver.setAiState(false, false, false);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url1, opts1] = mockFetch.mock.calls[0]!;
    expect(url1).toBe("http://192.168.1.100/api/aiControl");
    const body1 = JSON.parse(opts1.body);
    expect(body1.ai_on).toBe("0");
    expect(body1.ai_enable).toBe("0");
  });

  it("passes cookie in headers", async () => {
    await driver.setAiState(true, false, true);
    const [, opts] = mockFetch.mock.calls[0]!;
    expect(opts.headers.Cookie).toBe("session=abc123");
  });

  it("throws on fetch failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    await expect(driver.setAiState(true, true, true)).rejects.toThrow("Network error");
  });
});
