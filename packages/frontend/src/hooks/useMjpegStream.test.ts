import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMjpegStream } from "./useMjpegStream";

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

let mockInstances: MockWebSocket[];

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;

  binaryType = "blob";
  readyState = MockWebSocket.OPEN;
  onopen: ((ev: unknown) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: unknown) => void) | null = null;
  close = vi.fn();

  constructor() {
    mockInstances.push(this);
  }
}

beforeEach(() => {
  mockInstances = [];
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake"), revokeObjectURL: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useMjpegStream", () => {
  it("returns idle status when not enabled", () => {
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", false));
    expect(result.current.status).toBe("idle");
    expect(mockInstances).toHaveLength(0);
  });

  it("connects when enabled", () => {
    renderHook(() => useMjpegStream("/preview/cam1", true));
    expect(mockInstances).toHaveLength(1);
  });

  it("sets status to connecting on initial connect", () => {
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));
    expect(result.current.status).toBe("connecting");
  });

  it("sets status to streaming on first message", () => {
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onmessage?.({ data: new ArrayBuffer(10) });
    });
    expect(result.current.status).toBe("streaming");
  });

  it("resets retries on successful open", () => {
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onopen?.({});
    });
    expect(result.current.status).toBe("connecting");
  });

  it("reconnects with backoff on close", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onclose?.({ code: 1006, reason: "" });
    });
    expect(result.current.status).toBe("reconnecting");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    // Should have created a second WebSocket
    expect(mockInstances.length).toBe(2);
  });

  it("sets error status after MAX_FAILURES", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));

    // Close 4 times (MAX_FAILURES = 3, so > 3 closes triggers error)
    for (let i = 0; i < 4; i++) {
      const ws = mockInstances[mockInstances.length - 1]!;
      act(() => {
        ws.onclose?.({ code: 1006, reason: "" });
      });
      if (i < 3) {
        act(() => {
          vi.advanceTimersByTime(10000);
        });
      }
    }
    expect(result.current.status).toBe("error");
  });

  it("reconnect() resets retries and connects fresh", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onclose?.({ code: 1006, reason: "" });
    });

    act(() => {
      result.current.reconnect();
    });
    expect(result.current.status).toBe("connecting");
  });

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    unmount();
    expect(ws.close).toHaveBeenCalled();
  });

  it("handles onerror without crashing", () => {
    renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onerror?.({});
    });
    // Should not throw
  });

  it("revokes previous blob URL on new frame", () => {
    const { result } = renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onmessage?.({ data: new ArrayBuffer(10) });
    });
    act(() => {
      ws.onmessage?.({ data: new ArrayBuffer(20) });
    });
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    expect(result.current.status).toBe("streaming");
  });

  it("reconnects when stream goes stale (no messages for 3s)", () => {
    vi.useFakeTimers();
    renderHook(() => useMjpegStream("/preview/cam1", true));
    const ws = mockInstances[0]!;

    // Trigger onopen to start the stale timer
    act(() => {
      ws.onopen?.({});
    });

    // Advance past STALE_TIMEOUT_MS (3000ms) without any messages
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    // Should have reconnected — a second WebSocket instance created
    expect(mockInstances.length).toBe(2);
  });

  it("does not reconnect if disabled during close", () => {
    const { rerender } = renderHook(({ enabled }) => useMjpegStream("/preview/cam1", enabled), {
      initialProps: { enabled: true },
    });
    const ws = mockInstances[0]!;

    // Disable the hook
    rerender({ enabled: false });

    // Close the websocket — should NOT reconnect since disabled
    act(() => {
      ws.onclose?.({ code: 1006 });
    });

    // Only 1 instance — no reconnect
    expect(mockInstances.length).toBe(1);
  });
});
