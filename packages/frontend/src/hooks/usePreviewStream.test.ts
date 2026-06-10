import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePreviewStream } from "./usePreviewStream";

// Mock WebSocket
class MockWebSocket {
  static instances: MockWebSocket[] = [];
  binaryType = "";
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  close = vi.fn();
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
}

// Mock MediaSource
class MockSourceBuffer {
  updating = false;
  buffered = { length: 1, start: () => 0, end: () => 1 };
  appendBuffer = vi.fn();
  remove = vi.fn();
  addEventListener = vi.fn();
}

class MockMediaSource {
  static instances: MockMediaSource[] = [];
  readyState = "open";
  sourceBuffers = { length: 0 };
  addEventListener = vi.fn();
  addSourceBuffer = vi.fn(() => new MockSourceBuffer());
  endOfStream = vi.fn();
  constructor() {
    MockMediaSource.instances.push(this);
  }
}

vi.stubGlobal("WebSocket", MockWebSocket);
vi.stubGlobal("MediaSource", MockMediaSource);
vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:mock") });

beforeEach(() => {
  MockWebSocket.instances = [];
  MockMediaSource.instances = [];
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("usePreviewStream", () => {
  it("returns idle status when disabled", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", false));
    expect(result.current.status).toBe("idle");
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("connects when enabled", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.url).toContain("/preview/cam1");
  });

  it("sets status to streaming on ws open", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    act(() => {
      MockWebSocket.instances[0]!.onopen!();
    });
    expect(result.current.status).toBe("streaming");
  });

  it("sets status to connecting initially", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    expect(result.current.status).toBe("connecting");
  });

  it("reconnects with backoff on close", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    act(() => {
      MockWebSocket.instances[0]!.onclose!();
    });
    expect(result.current.status).toBe("reconnecting");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(MockWebSocket.instances).toHaveLength(2);
  });

  it("sets error after MAX_FAILURES closes", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    // Close 4 times (MAX_FAILURES = 3, so 4th close triggers error)
    for (let i = 0; i < 4; i++) {
      act(() => {
        MockWebSocket.instances[MockWebSocket.instances.length - 1]!.onclose!();
      });
      if (i < 3) {
        act(() => {
          vi.advanceTimersByTime(10000);
        });
      }
    }
    expect(result.current.status).toBe("error");
  });

  it("reconnect() resets retries and reconnects", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    // Get into error state
    for (let i = 0; i < 4; i++) {
      act(() => {
        MockWebSocket.instances[MockWebSocket.instances.length - 1]!.onclose!();
      });
      if (i < 3) act(() => vi.advanceTimersByTime(10000));
    }
    expect(result.current.status).toBe("error");

    const countBefore = MockWebSocket.instances.length;
    act(() => {
      result.current.reconnect();
    });
    expect(MockWebSocket.instances.length).toBe(countBefore + 1);
    expect(result.current.status).toBe("connecting");
  });

  it("cleans up on disable", () => {
    const { rerender } = renderHook(({ enabled }) => usePreviewStream("/preview/cam1", enabled), {
      initialProps: { enabled: true },
    });
    const ws = MockWebSocket.instances[0]!;
    rerender({ enabled: false });
    expect(ws.close).toHaveBeenCalled();
  });

  it("cleanup nulls ws handlers before close fires", () => {
    const { rerender } = renderHook(({ enabled }) => usePreviewStream("/preview/cam1", enabled), {
      initialProps: { enabled: true },
    });
    const ws = MockWebSocket.instances[0]!;
    rerender({ enabled: false });
    // After cleanup, handlers are nulled
    expect(ws.onopen).toBeNull();
    expect(ws.onclose).toBeNull();
    expect(ws.onmessage).toBeNull();
  });

  it("handles ws message by appending to source buffer", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    // Trigger sourceopen
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    const ws = MockWebSocket.instances[0]!;
    const data = new ArrayBuffer(8);
    act(() => {
      ws.onmessage!({ data });
    });
    expect(sb.appendBuffer).toHaveBeenCalledWith(data);
  });

  it("trimBuffer removes old data when buffer exceeds threshold", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    // Set buffer to exceed threshold (>2 seconds)
    sb.buffered = { length: 1, start: () => 0, end: () => 5 };
    // Trigger updateend
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    act(() => updateEndCb());
    expect(sb.remove).toHaveBeenCalledWith(0, 3); // end(5) - threshold(2) = 3
  });

  it("trimBuffer does not remove when buffer is small", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    // Buffer within threshold
    sb.buffered = { length: 1, start: () => 0, end: () => 1.5 };
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    act(() => updateEndCb());
    expect(sb.remove).not.toHaveBeenCalled();
  });

  it("trimBuffer skips when buffer is empty", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    sb.buffered = { length: 0, start: () => 0, end: () => 0 };
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    act(() => updateEndCb());
    expect(sb.remove).not.toHaveBeenCalled();
  });

  it("trimBuffer skips when updating", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    sb.updating = true;
    sb.buffered = { length: 1, start: () => 0, end: () => 5 };
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    act(() => updateEndCb());
    expect(sb.remove).not.toHaveBeenCalled();
  });

  it("seekToLive seeks video when far behind live edge", () => {
    const mockVideo = { buffered: { length: 1, end: () => 10 }, currentTime: 3 } as unknown as HTMLVideoElement;
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    // Attach mock video to the ref
    Object.defineProperty(result.current.videoRef, "current", { value: mockVideo, writable: true });

    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    sb.buffered = { length: 1, start: () => 0, end: () => 1 };
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    act(() => updateEndCb());
    // seekToLive checks video.buffered, not sb.buffered
    // With video.currentTime=3 and video.buffered.end=10, gap=7 > SEEK_THRESHOLD(3)
    expect(mockVideo.currentTime).toBe(10);
  });

  it("seekToLive does not seek when close to live edge", () => {
    const mockVideo = { buffered: { length: 1, end: () => 5 }, currentTime: 4 } as unknown as HTMLVideoElement;
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    Object.defineProperty(result.current.videoRef, "current", { value: mockVideo, writable: true });

    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    sb.buffered = { length: 1, start: () => 0, end: () => 1 };
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    act(() => updateEndCb());
    // gap = 5 - 4 = 1 < SEEK_THRESHOLD(3), should not seek
    expect(mockVideo.currentTime).toBe(4);
  });

  it("seekToLive handles null video ref", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    const updateEndCb = sb.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "updateend")?.[1] as () => void;
    // Should not throw with null video ref
    expect(() => act(() => updateEndCb())).not.toThrow();
  });

  it("skips append when source buffer is updating", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    sb.updating = true;
    const ws = MockWebSocket.instances[0]!;
    act(() => {
      ws.onmessage!({ data: new ArrayBuffer(8) });
    });
    expect(sb.appendBuffer).not.toHaveBeenCalled();
  });

  it("handles appendBuffer throwing gracefully", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());

    const sb = ms.addSourceBuffer.mock.results[0]!.value as MockSourceBuffer;
    sb.appendBuffer.mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const ws = MockWebSocket.instances[0]!;
    expect(() => act(() => ws.onmessage!({ data: new ArrayBuffer(8) }))).not.toThrow();
  });

  it("sourceopen does nothing when readyState is not open", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    ms.readyState = "closed";
    const sourceOpenCb = ms.addEventListener.mock.calls.find((c: unknown[]) => c[0] === "sourceopen")?.[1] as () => void;
    act(() => sourceOpenCb());
    expect(ms.addSourceBuffer).not.toHaveBeenCalled();
  });

  it("calls endOfStream on cleanup when mediaSource is open", () => {
    const { unmount } = renderHook(() => usePreviewStream("/preview/cam1", true));
    const ms = MockMediaSource.instances[0]!;
    unmount();
    expect(ms.endOfStream).toHaveBeenCalled();
  });

  it("constructs WebSocket URL with current host", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    const url = MockWebSocket.instances[0]!.url;
    expect(url).toContain("/preview/cam1");
    expect(url).toMatch(/^wss?:\/\//);
  });

  it("onerror handler exists but does not throw", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    expect(() => {
      act(() => {
        MockWebSocket.instances[0]!.onerror!();
      });
    }).not.toThrow();
  });

  it("increments backoff delay on successive failures", () => {
    renderHook(() => usePreviewStream("/preview/cam1", true));
    // First close
    act(() => MockWebSocket.instances[0]!.onclose!());
    act(() => vi.advanceTimersByTime(1000)); // 1s
    expect(MockWebSocket.instances).toHaveLength(2);

    // Second close
    act(() => MockWebSocket.instances[1]!.onclose!());
    act(() => vi.advanceTimersByTime(1999));
    expect(MockWebSocket.instances).toHaveLength(2); // not yet
    act(() => vi.advanceTimersByTime(1));
    expect(MockWebSocket.instances).toHaveLength(3); // 2s
  });

  it("sets reconnecting status when retries > 0", () => {
    const { result } = renderHook(() => usePreviewStream("/preview/cam1", true));
    act(() => MockWebSocket.instances[0]!.onclose!());
    act(() => vi.advanceTimersByTime(1000));
    // New connection attempt should show reconnecting
    expect(result.current.status).toBe("reconnecting");
  });
});
