import { useEffect, useRef, useCallback, useState } from "react";
import type { RefObject } from "react";
import { logger } from "../logger";

export type PreviewStreamStatus = "idle" | "connecting" | "streaming" | "error" | "reconnecting";

export interface UsePreviewStreamResult {
  videoRef: RefObject<HTMLVideoElement | null>;
  status: PreviewStreamStatus;
  reconnect: () => void;
}

const BACKOFF_DELAYS = [1000, 2000, 4000, 10000];
const MAX_FAILURES = 3;
const BUFFER_TRIM_THRESHOLD = 1;
const SEEK_THRESHOLD = 1.5;

export function usePreviewStream(endpoint: string, enabled: boolean): UsePreviewStreamResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaSourceRef = useRef<MediaSource | null>(null);
  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<PreviewStreamStatus>("idle");

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (mediaSourceRef.current && mediaSourceRef.current.readyState === "open") {
      try {
        mediaSourceRef.current.endOfStream();
      } catch {
        // ignore
      }
    }
    mediaSourceRef.current = null;
    sourceBufferRef.current = null;
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

    const mediaSource = new MediaSource();
    mediaSourceRef.current = mediaSource;

    if (videoRef.current) {
      videoRef.current.src = URL.createObjectURL(mediaSource);
    }

    const queue: ArrayBuffer[] = [];
    let staleTimer: ReturnType<typeof setTimeout> | null = null;

    const resetStaleTimer = (): void => {
      if (staleTimer) clearTimeout(staleTimer);
      staleTimer = setTimeout(() => {
        setStatus("reconnecting");
      }, 5000);
    };

    const drainQueue = (): void => {
      const sb = sourceBufferRef.current;
      if (!sb || sb.updating || queue.length === 0) return;
      const next = queue.shift()!;
      try {
        sb.appendBuffer(next);
      } catch {
        // QuotaExceededError — drop oldest data
        queue.length = 0;
      }
    };

    ws.onmessage = (event) => {
      setStatus("streaming");
      resetStaleTimer();
      queue.push(event.data as ArrayBuffer);
      drainQueue();
    };

    mediaSource.addEventListener("sourceopen", () => {
      if (mediaSource.readyState !== "open") return;
      try {
        const sb = mediaSource.addSourceBuffer('video/mp4; codecs="avc1.42E01E"');
        sourceBufferRef.current = sb;

        sb.addEventListener("updateend", () => {
          drainQueue();
          trimBuffer(sb);
          seekToLive(videoRef.current);
        });
      } catch {
        // codec not supported
      }
    });

    ws.onopen = () => {
      logger.info("Preview WS connected", { context: { endpoint } });
      retriesRef.current = 0;
      setStatus("connecting");
    };

    ws.onclose = (ev) => {
      logger.warn("Preview WS closed", { context: { endpoint, code: ev.code, reason: ev.reason } });
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
      logger.warn("Preview WS error", { context: { endpoint } });
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

  return { videoRef, status, reconnect };
}

function trimBuffer(sb: SourceBuffer): void {
  if (sb.updating || !sb.buffered.length) return;
  const end = sb.buffered.end(sb.buffered.length - 1);
  const start = sb.buffered.start(0);
  if (end - start > BUFFER_TRIM_THRESHOLD) {
    try {
      sb.remove(start, end - BUFFER_TRIM_THRESHOLD);
    } catch {
      // ignore
    }
  }
}

function seekToLive(video: HTMLVideoElement | null): void {
  if (!video || !video.buffered.length) return;
  const liveEdge = video.buffered.end(video.buffered.length - 1);
  if (liveEdge - video.currentTime > SEEK_THRESHOLD) {
    video.currentTime = liveEdge;
  }
}
