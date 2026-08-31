import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEnvelopeStream } from "./useEnvelopeStream";
import { encodeEnvelopeFrame } from "@invisible-av-booth/shared";

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  onmessage: ((e: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  binaryType = "arraybuffer";
  readyState = 1;
  close = vi.fn();
  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }
}

describe("useEnvelopeStream", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    MockWebSocket.instances = [];
  });

  it("is inert when inactive (opens no socket)", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    renderHook(() => useEnvelopeStream("mix1", 1, false));
    expect(MockWebSocket.instances).toHaveLength(0);
  });

  it("opens a socket when active and exposes the decoded burst of envelope frames", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const { result } = renderHook(() => useEnvelopeStream("mix1", 2, true));
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0]!.url).toContain("/preview/mixer/mix1/channel/2");
    act(() => {
      MockWebSocket.instances[0]!.onmessage?.({
        data: encodeEnvelopeFrame([
          { minDb: -42, maxDb: -14 },
          { minDb: -40, maxDb: -12 },
        ]),
      });
    });
    expect(result.current.burst).toEqual([
      { minDb: -42, maxDb: -14 },
      { minDb: -40, maxDb: -12 },
    ]);
    expect(result.current.stalled).toBe(false);
  });

  it("sets stalled=true on an unexpected socket close (capture crash)", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const { result } = renderHook(() => useEnvelopeStream("mix1", 1, true));
    act(() => MockWebSocket.instances[0]!.onclose?.());
    expect(result.current.stalled).toBe(true);
  });

  it("sets stalled=true on socket error", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const { result } = renderHook(() => useEnvelopeStream("mix1", 1, true));
    act(() => MockWebSocket.instances[0]!.onerror?.());
    expect(result.current.stalled).toBe(true);
  });

  it("closes the socket on unmount without marking stalled", () => {
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const { result, unmount } = renderHook(() => useEnvelopeStream("mix1", 1, true));
    const socket = MockWebSocket.instances[0]!;
    unmount();
    expect(socket.close).toHaveBeenCalled();
    expect(result.current.stalled).toBe(false);
  });

  it("does not mark stalled when error/close fire after our own cleanup (StrictMode remount)", () => {
    // React StrictMode (dev) mounts → cleans up → remounts. Closing the first,
    // still-CONNECTING socket fires onerror/onclose with "closed before the
    // connection is established" — that must NOT flip to the stalled slider tier.
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    const { result, unmount } = renderHook(() => useEnvelopeStream("mix1", 1, true));
    const socket = MockWebSocket.instances[0]!;
    unmount(); // our cleanup closes the socket
    act(() => {
      socket.onerror?.(); // fired by the browser for the aborted connect
      socket.onclose?.();
    });
    expect(result.current.stalled).toBe(false);
  });

  it("is inert when WebSocket is unavailable (jsdom/SSR guard)", () => {
    vi.stubGlobal("WebSocket", undefined);
    const { result } = renderHook(() => useEnvelopeStream("mix1", 1, true));
    expect(result.current.burst).toEqual([]);
  });
});
