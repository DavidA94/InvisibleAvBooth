import { useEffect, useRef, useCallback, useState } from "react";
import type { RefObject } from "react";
import { logger } from "../logger";
import {
  PREVIEW_MSG_VIDEO,
  PREVIEW_MSG_AUDIO,
  PREVIEW_AUDIO_SAMPLE_RATE,
  PREVIEW_AUDIO_CHANNELS,
  PREVIEW_AUDIO_CHUNK_MS,
  PREVIEW_AUDIO_SKIP_THRESHOLD_MS,
} from "@invisible-av-booth/shared";

export type ObsPreviewStatus = "idle" | "connecting" | "streaming" | "error" | "reconnecting";

export interface UseObsPreviewStreamResult {
  imgRef: RefObject<HTMLImageElement | null>;
  status: ObsPreviewStatus;
  reconnect: () => void;
  muted: boolean;
  setMuted: (muted: boolean) => void;
}

const BACKOFF_DELAYS = [1000, 2000, 4000, 10000];
const MAX_FAILURES = 3;
const STALE_TIMEOUT_MS = 5000;

// Audio chunk size in samples (matches backend chunk duration)
const SAMPLES_PER_CHUNK = (PREVIEW_AUDIO_SAMPLE_RATE * PREVIEW_AUDIO_CHUNK_MS) / 1000;

/**
 * Combined MJPEG video + PCM audio preview hook for OBS.
 *
 * Receives binary WebSocket messages prefixed with a type byte:
 *   0x01 = JPEG video frame → displayed via <img>
 *   0x02 = PCM audio chunk (S16LE) → played via AudioContext with skip-to-live
 *
 * Audio uses a simple scheduling model: each chunk is scheduled to play at the
 * next available time. If the scheduled time falls behind the live edge by more
 * than PREVIEW_AUDIO_SKIP_THRESHOLD_MS, old chunks are dropped and playback
 * resets to the current time (skip-to-live).
 */
export function useObsPreviewStream(endpoint: string, enabled: boolean): UseObsPreviewStreamResult {
  const imgRef = useRef<HTMLImageElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef(0);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const staleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ObsPreviewStatus>("idle");
  const [muted, setMutedState] = useState(true);
  const mutedRef = useRef(true);

  const setMuted = useCallback((m: boolean) => {
    setMutedState(m);
    mutedRef.current = m;
  }, []);

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
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }
    nextPlayTimeRef.current = 0;
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
        logger.warn("OBS preview stale — reconnecting", { context: { endpoint } });
        connect();
      }, STALE_TIMEOUT_MS);
    };

    ws.onmessage = (event) => {
      setStatus("streaming");
      resetStaleTimer();

      const data = event.data as ArrayBuffer;
      if (data.byteLength < 2) return;

      const view = new Uint8Array(data);
      const msgType = view[0];

      if (msgType === PREVIEW_MSG_VIDEO) {
        // JPEG frame — display immediately
        const jpegData = data.slice(1);
        const blob = new Blob([jpegData], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);

        if (imgRef.current) {
          imgRef.current.src = url;
        }

        if (lastBlobUrlRef.current) {
          URL.revokeObjectURL(lastBlobUrlRef.current);
        }
        lastBlobUrlRef.current = url;
      } else if (msgType === PREVIEW_MSG_AUDIO) {
        // PCM audio chunk — play via AudioContext
        if (mutedRef.current) return;

        if (!audioCtxRef.current) {
          audioCtxRef.current = new AudioContext({ sampleRate: PREVIEW_AUDIO_SAMPLE_RATE });
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === "suspended") {
          ctx.resume().catch(() => {});
        }

        // Decode S16LE PCM to float32
        const audioBytes = new Uint8Array(data, 1); // skip type byte
        const pcmView = new Int16Array(audioBytes.buffer, audioBytes.byteOffset, audioBytes.byteLength / 2);
        const floatData = new Float32Array(pcmView.length);
        for (let i = 0; i < pcmView.length; i++) {
          floatData[i] = pcmView[i]! / 32768;
        }

        // Create audio buffer
        const audioBuffer = ctx.createBuffer(PREVIEW_AUDIO_CHANNELS, SAMPLES_PER_CHUNK, PREVIEW_AUDIO_SAMPLE_RATE);
        if (PREVIEW_AUDIO_CHANNELS === 1) {
          audioBuffer.getChannelData(0).set(floatData.subarray(0, SAMPLES_PER_CHUNK));
        } else {
          // Interleaved stereo → deinterleave
          const left = audioBuffer.getChannelData(0);
          const right = audioBuffer.getChannelData(1);
          for (let i = 0; i < SAMPLES_PER_CHUNK; i++) {
            left[i] = floatData[i * 2]!;
            right[i] = floatData[i * 2 + 1]!;
          }
        }

        const now = ctx.currentTime;
        const chunkDuration = PREVIEW_AUDIO_CHUNK_MS / 1000;

        // Skip-to-live: if we're too far behind, reset playback to now
        if (nextPlayTimeRef.current < now || nextPlayTimeRef.current - now > PREVIEW_AUDIO_SKIP_THRESHOLD_MS / 1000) {
          nextPlayTimeRef.current = now;
        }

        const source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.start(nextPlayTimeRef.current);

        nextPlayTimeRef.current += chunkDuration;
      }
    };

    ws.onopen = () => {
      logger.info("OBS preview WS connected", { context: { endpoint } });
      retriesRef.current = 0;
      setStatus("connecting");
      resetStaleTimer();
    };

    ws.onclose = (ev) => {
      logger.warn("OBS preview WS closed", { context: { endpoint, code: ev?.code, reason: ev?.reason } });
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
      logger.warn("OBS preview WS error", { context: { endpoint } });
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

  return { imgRef, status, reconnect, muted, setMuted };
}
