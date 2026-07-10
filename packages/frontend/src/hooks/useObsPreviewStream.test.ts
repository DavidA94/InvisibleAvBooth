import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useObsPreviewStream } from "./useObsPreviewStream";

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

const mockConnect = vi.fn();
const mockStart = vi.fn();
const mockGetChannelData = vi.fn(() => new Float32Array(882));
const mockCreateBuffer = vi.fn(() => ({ getChannelData: mockGetChannelData }));
const mockCreateBufferSource = vi.fn(() => ({ buffer: null, connect: mockConnect, start: mockStart }));
const mockResume = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

let mockAudioState = "running";

class MockAudioContext {
  get state() {
    return mockAudioState;
  }
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createBuffer = mockCreateBuffer;
  createBufferSource = mockCreateBufferSource;
  resume = mockResume;
  close = mockClose;
}

beforeEach(() => {
  mockInstances = [];
  mockAudioState = "running";
  vi.clearAllMocks();
  vi.stubGlobal("WebSocket", MockWebSocket);
  vi.stubGlobal("AudioContext", MockAudioContext);
  vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:fake-url"), revokeObjectURL: vi.fn() });
  vi.stubGlobal(
    "Blob",
    class {
      constructor() {}
    },
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Build a valid audio message (type 0x02 + PCM S16LE data, 2-byte aligned after slice) */
function buildAudioMessage(samples = 882): ArrayBuffer {
  // 1 type byte + samples*2 audio bytes
  const buffer = new ArrayBuffer(1 + samples * 2);
  const view = new Uint8Array(buffer);
  view[0] = 0x02; // PREVIEW_MSG_AUDIO
  // Fill with valid S16LE PCM
  const pcm = new DataView(buffer);
  for (let i = 0; i < samples; i++) {
    pcm.setInt16(1 + i * 2, Math.floor(Math.sin(i / 10) * 16000), true);
  }
  return buffer;
}

describe("useObsPreviewStream", () => {
  it("returns idle when not enabled", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", false));
    expect(result.current.status).toBe("idle");
    expect(result.current.muted).toBe(true);
    expect(mockInstances).toHaveLength(0);
  });

  it("connects when enabled", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    expect(result.current.status).toBe("connecting");
    expect(mockInstances).toHaveLength(1);
  });

  it("video frame updates imgRef.src and creates blob URL", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;

    // Set imgRef to a mock element
    const mockImg = { src: "" } as HTMLImageElement;
    (result.current.imgRef as { current: HTMLImageElement | null }).current = mockImg;

    const frame = new Uint8Array([0x01, 0xff, 0xd8, 0x00, 0xff, 0xd9]);
    act(() => {
      ws.onmessage?.({ data: frame.buffer });
    });

    expect(result.current.status).toBe("streaming");
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(mockImg.src).toBe("blob:fake-url");
  });

  it("revokes previous blob URL on second video frame", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    (result.current.imgRef as { current: HTMLImageElement | null }).current = { src: "" } as HTMLImageElement;

    act(() => {
      ws.onmessage?.({ data: new Uint8Array([0x01, 0xff, 0xd8]).buffer });
    });
    act(() => {
      ws.onmessage?.({ data: new Uint8Array([0x01, 0xff, 0xd8]).buffer });
    });
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("ignores messages with less than 2 bytes", () => {
    renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onmessage?.({ data: new ArrayBuffer(1) });
    });
    // No blob created for tiny messages
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("audio when muted is ignored (no AudioContext created)", () => {
    renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    act(() => {
      ws.onmessage?.({ data: buildAudioMessage() });
    });
    expect(mockCreateBuffer).not.toHaveBeenCalled();
  });

  it("audio when unmuted creates AudioContext and plays buffer", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    act(() => {
      result.current.setMuted(false);
    });

    act(() => {
      ws.onmessage?.({ data: buildAudioMessage() });
    });

    expect(mockCreateBuffer).toHaveBeenCalledWith(1, 882, 44100);
    expect(mockCreateBufferSource).toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
  });

  it("audio resumes suspended AudioContext", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    act(() => {
      result.current.setMuted(false);
    });
    mockAudioState = "suspended";

    act(() => {
      ws.onmessage?.({ data: buildAudioMessage() });
    });

    expect(mockResume).toHaveBeenCalled();
  });

  it("audio skip-to-live resets when behind", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    act(() => {
      result.current.setMuted(false);
    });

    // Send two chunks — second one exercises the scheduling path
    act(() => {
      ws.onmessage?.({ data: buildAudioMessage() });
    });
    act(() => {
      ws.onmessage?.({ data: buildAudioMessage() });
    });

    expect(mockStart).toHaveBeenCalledTimes(2);
  });

  it("cleanup closes AudioContext when it exists", () => {
    const { result, unmount } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    act(() => {
      result.current.setMuted(false);
    });
    act(() => {
      ws.onmessage?.({ data: buildAudioMessage() });
    });

    unmount();
    expect(mockClose).toHaveBeenCalled();
    expect(ws.close).toHaveBeenCalled();
  });

  it("cleanup revokes blob URL when it exists", () => {
    const { result, unmount } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    const ws = mockInstances[0]!;
    (result.current.imgRef as { current: HTMLImageElement | null }).current = { src: "" } as HTMLImageElement;

    act(() => {
      ws.onmessage?.({ data: new Uint8Array([0x01, 0xff, 0xd8]).buffer });
    });
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
  });

  it("muted toggle works", () => {
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    expect(result.current.muted).toBe(true);
    act(() => {
      result.current.setMuted(false);
    });
    expect(result.current.muted).toBe(false);
    act(() => {
      result.current.setMuted(true);
    });
    expect(result.current.muted).toBe(true);
  });

  it("reconnects on close with backoff", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    act(() => {
      mockInstances[0]!.onclose?.({ code: 1006 });
    });
    expect(result.current.status).toBe("reconnecting");
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(mockInstances).toHaveLength(2);
  });

  it("sets error after max failures", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    for (let i = 0; i < 4; i++) {
      act(() => {
        mockInstances[mockInstances.length - 1]!.onclose?.({ code: 1006 });
      });
      if (i < 3)
        act(() => {
          vi.advanceTimersByTime(10000);
        });
    }
    expect(result.current.status).toBe("error");
  });

  it("does not reconnect on close when disabled", () => {
    const { rerender } = renderHook(({ enabled }) => useObsPreviewStream("/preview/obs", enabled), {
      initialProps: { enabled: true },
    });
    rerender({ enabled: false });
    act(() => {
      mockInstances[0]!.onclose?.({ code: 1006 });
    });
    expect(mockInstances.length).toBe(1);
  });

  it("reconnect() resets retries", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useObsPreviewStream("/preview/obs", true));
    act(() => {
      mockInstances[0]!.onclose?.({ code: 1006 });
    });
    act(() => {
      result.current.reconnect();
    });
    expect(result.current.status).toBe("connecting");
  });

  it("stale timer reconnects after timeout with no messages", () => {
    vi.useFakeTimers();
    renderHook(() => useObsPreviewStream("/preview/obs", true));
    act(() => {
      mockInstances[0]!.onopen?.({});
    });
    act(() => {
      vi.advanceTimersByTime(5100);
    });
    expect(mockInstances.length).toBe(2);
  });

  it("onerror does not crash", () => {
    renderHook(() => useObsPreviewStream("/preview/obs", true));
    act(() => {
      mockInstances[0]!.onerror?.({});
    });
  });
});
