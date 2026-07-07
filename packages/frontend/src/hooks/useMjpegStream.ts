import { useEffect, useRef, useCallback, useState } from "react";
import type { RefObject } from "react";
import { logger } from "../logger";

export type MjpegStreamStatus = "idle" | "connecting" | "streaming" | "error" | "reconnecting";

export interface UseMjpegStreamResult {
  imgRef: RefObject<HTMLImageElement | null>;
  status: MjpegStreamStatus;
  reconnect: () => void;
}

const BACKOFF_DELAYS = [1000, 2000, 4000, 10000];
const MAX_FAILURES = 3;
const STALE_TIMEOUT_MS = 3000;

/**
 * MJPEG preview hook — receives individual JPEG frames over WebSocket
 * and displays them via an <img> element. Much lower latency than fMP4+MSE
 * because there's no container format, no MediaSource buffering, and no
 * codec negotiation — just raw frames rendered immediately.
 */
export function useMjpegStream(endpoint: string, enabled: boolean): UseMjpegStreamResult {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<MjpegStreamStatus>("idle");

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (staleTimerRef.current) {
      clearTimeout(staleTimerRef.current);
      staleTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    cleanup();
    if (!enabled) {
      setStatus("idle");
      return;
    }

    setStatus(retriesRef.current > 0 ? "reconnecting" : "connecting");

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${window.location.host}${endpoint}`);
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    const resetStaleTimer = (): void => {
      if (staleTimerRef.current) clearTimeout(staleTimerRef.current);
      staleTimerRef.current = setTimeout(() => {
        logger.warn("MJPEG preview stale — reconnecting", { context: { endpoint } });
        connect();
      }, STALE_TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      setStatus("streaming");
      resetStaleTimer();

      // Each message is a complete JPEG frame — display it immediately
      const blob = new Blob([event.data as ArrayBuffer], { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);

      if (imgRef.current) {
        imgRef.current.src = url;
      }

      // Revoke the previous blob URL to prevent memory leak
      if (lastBlobUrlRef.current) {
        URL.revokeObjectURL(lastBlobUrlRef.current);
      }
      lastBlobUrlRef.current = url;
    };

    ws.onopen = () => {
      logger.info("MJPEG preview WS connected", { context: { endpoint } });
      retriesRef.current = 0;
      setStatus("connecting");
      resetStaleTimer();
    };

    ws.onclose = (ev) => {
      logger.warn("MJPEG preview WS closed", { context: { endpoint, code: ev?.code, reason: ev?.reason } });
      if (staleTimerRef.current) {
        clearTimeout(staleTimerRef.current);
        staleTimerRef.current = null;
      }
      if (!enabled) return;
      retriesRef.current++;
      if (retriesRef.current > MAX_FAILURES) {
        setStatus("error");
        return;
      }
      const delay = BACKOFF_DELAYS[Math.min(retriesRef.current - 1, BACKOFF_DELAYS.length - 1)];
      setStatus("reconnecting");
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      logger.warn("MJPEG preview WS error", { context: { endpoint } });
    };
  }, [endpoint, enabled, cleanup]);

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    if (enabled) {
      connect();
    } else {
      cleanup();
      setStatus("idle");
    }
    return cleanup;
  }, [enabled, endpoint, connect, cleanup]);

  return { imgRef, status, reconnect };
}
