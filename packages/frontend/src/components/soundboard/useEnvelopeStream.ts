import { useEffect, useRef, useState } from "react";
import { decodeEnvelopeFrame } from "@invisible-av-booth/shared";
import type { EnvelopePair } from "@invisible-av-booth/shared";
import { logger } from "../../logger";

export interface EnvelopeStream {
  /** The latest decoded envelope pair, or null before any frame arrives. */
  latest: EnvelopePair | null;
  /** True once the stream stalled/crashed while open (Req 15.6 — flip to slider). */
  stalled: boolean;
}

/**
 * Opens the binary envelope WebSocket (/preview/mixer/:mixerId/channel/:channel)
 * while `active`, decodes frames via the shared codec, and exposes the latest
 * pair plus a `stalled` flag. When the socket closes unexpectedly while active
 * (capture crash, Req 15.6) it sets `stalled` so the modal can flip to the
 * slider tier — it NEVER respawns capture (that is the backend's job).
 *
 * WebSocket is guarded for jsdom (unit tests): if unavailable, the hook is inert
 * and Playwright covers real streaming (Phase 10).
 */
export function useEnvelopeStream(mixerId: string, channel: number, active: boolean): EnvelopeStream {
  const [latest, setLatest] = useState<EnvelopePair | null>(null);
  const [stalled, setStalled] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!active) return;
    if (typeof WebSocket === "undefined") return; // jsdom / SSR guard

    setStalled(false);
    let closedByUs = false;
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/preview/mixer/${encodeURIComponent(mixerId)}/channel/${channel}`;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      logger.warn("Envelope WS open failed", { context: { mixerId, channel, error: String(error) } });
      setStalled(true);
      return;
    }
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.onmessage = (event: MessageEvent): void => {
      const pairs = decodeEnvelopeFrame(event.data as ArrayBuffer);
      const last = pairs[pairs.length - 1];
      if (last) setLatest(last);
    };
    socket.onclose = (): void => {
      // An unexpected close while active means capture stopped (crash/unavailable).
      if (!closedByUs) setStalled(true);
    };
    socket.onerror = (): void => {
      setStalled(true);
    };

    return () => {
      closedByUs = true;
      try {
        socket.close();
      } catch {
        // ignore
      }
      socketRef.current = null;
    };
  }, [mixerId, channel, active]);

  return { latest, stalled };
}
