import { useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { LowerThirdItem, LowerThirdState, AnimationPhase, PageBreakdown, VerseData } from "@invisible-av-booth/shared";
import {
  STO_LOWER_THIRD_SHOW, STO_LOWER_THIRD_DISMISS, STO_LOWER_THIRD_PUSH_UP,
  STO_LOWER_THIRD_PAGE, STO_LOWER_THIRD_STATE, STO_LOWER_THIRD_MEASURE,
  STO_LOWER_THIRD_FORCE_CLEAR, OTS_LOWER_THIRD_PHASE, OTS_LOWER_THIRD_RESOLUTION, OTS_LOWER_THIRD_PAGES,
} from "@invisible-av-booth/shared";
import { BlueRhombusStyle } from "./styles/BlueRhombusStyle";
import { measureScripture } from "./measureScripture";
import "./overlay.css";

/** Configurable via VITE_OVERLAY_DISCONNECT_TIMEOUT_MS at build time. Default 15s. */
const DISCONNECT_TIMEOUT_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 5000;

const LOG_BUFFER: Array<{ level: string; message: string }> = [];
let logFlushTimer: ReturnType<typeof setTimeout> | null = null;

function sendLog(level: "info" | "warn" | "error", message: string): void {
  console.log(`[overlay] ${level}: ${message}`);
  LOG_BUFFER.push({ level, message });
  if (!logFlushTimer) {
    logFlushTimer = setTimeout(() => {
      logFlushTimer = null;
      const batch = LOG_BUFFER.splice(0, 10);
      if (batch.length === 0) return;
      fetch("/api/overlay/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(batch),
      }).catch(() => {});
    }, 5000);
  }
}

export function LowerThirdOverlay(): ReactNode {
  const [activeItem, setActiveItem] = useState<LowerThirdItem | null>(null);
  const [prevItem, setPrevItem] = useState<LowerThirdItem | null>(null);
  const [phase, setPhase] = useState<AnimationPhase>("hidden");
  const [isPushUp, setIsPushUp] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const measureAbortRef = useRef<AbortController | null>(null);

  const reportPhase = useCallback((newPhase: AnimationPhase) => {
    setPhase(newPhase);
    socketRef.current?.emit(OTS_LOWER_THIRD_PHASE, newPhase);
  }, []);

  const startDisconnectTimer = useCallback(() => {
    if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
    disconnectTimerRef.current = setTimeout(() => {
      setActiveItem((item) => {
        if (item && !item.autoDismissMs) {
          setPhase("dismissing");
          setTimeout(() => { setActiveItem(null); setPhase("hidden"); }, 1000);
        }
        return item;
      });
    }, DISCONNECT_TIMEOUT_MS);
  }, []);

  useEffect(() => {
    document.fonts.ready.then(() => { connectSocket(); });
    return () => {
      socketRef.current?.disconnect();
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectSocket = (): void => {
    const socket = io("/overlay", { transports: ["websocket"], reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 8000 });
    socketRef.current = socket;

    socket.on("connect", () => {
      if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
      const width = window.innerWidth;
      const height = window.innerHeight;
      socket.emit(OTS_LOWER_THIRD_RESOLUTION, { width, height, isCorrect: width === 1920 && height === 1080 });
      console.log("[overlay] Sending overlay-ready postMessage to parent");
      window.parent.postMessage({ type: "overlay-ready" }, "*");
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => window.parent.postMessage({ type: "overlay-heartbeat" }, "*"), HEARTBEAT_INTERVAL_MS);
      sendLog("info", "Overlay connected");
    });

    socket.on("disconnect", () => {
      startDisconnectTimer();
      if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
      sendLog("warn", "Overlay disconnected");
    });

    socket.on(STO_LOWER_THIRD_STATE, (state: LowerThirdState & { skipEntrance?: boolean }) => {
      if (state.phase === "dismissing" || state.phase === "hidden") {
        setActiveItem(null); setPrevItem(null); setIsPushUp(false); setPhase("hidden"); reportPhase("hidden");
        return;
      }
      if (state.active && state.skipEntrance) {
        setActiveItem(state.active); setPhase("visible"); reportPhase("visible");
      } else if (state.active && state.phase === "showing") {
        setActiveItem(state.active); setPhase("showing");
      }
    });

    socket.on(STO_LOWER_THIRD_SHOW, (data: { item: LowerThirdItem }) => {
      measureAbortRef.current?.abort();
      setIsPushUp(false); setPrevItem(null);
      setActiveItem(data.item); setPhase("showing"); reportPhase("showing");
    });

    socket.on(STO_LOWER_THIRD_DISMISS, () => {
      setIsPushUp(false); setPhase("dismissing"); reportPhase("dismissing");
    });

    // Task 42: Push-up — old item slides out, new slides in
    socket.on(STO_LOWER_THIRD_PUSH_UP, (data: { item: LowerThirdItem }) => {
      measureAbortRef.current?.abort();
      setActiveItem((current) => { setPrevItem(current); return data.item; });
      setIsPushUp(true); setPhase("showing"); reportPhase("showing");
    });

    socket.on(STO_LOWER_THIRD_PAGE, (data: { page: number }) => {
      setActiveItem((prev) => prev?.pages ? { ...prev, pages: { ...prev.pages, currentPage: data.page } } : prev);
      setIsPushUp(true); setPhase("showing"); reportPhase("showing");
    });

    // Task 43: Force Clear — instant hide, no animation
    socket.on(STO_LOWER_THIRD_FORCE_CLEAR, () => {
      setActiveItem(null); setPrevItem(null); setIsPushUp(false); setPhase("hidden"); reportPhase("hidden");
    });

    // Task 44: Scripture measurement
    socket.on(STO_LOWER_THIRD_MEASURE, (data: { itemId: string; verses: VerseData[]; reference: string }) => {
      measureAbortRef.current?.abort();
      const abort = new AbortController();
      measureAbortRef.current = abort;
      measureScripture(data.verses, abort.signal)
        .then((pages) => { if (!abort.signal.aborted) socket.emit(OTS_LOWER_THIRD_PAGES, { itemId: data.itemId, pages }); })
        .catch(() => {
          if (!abort.signal.aborted) {
            const fallback: PageBreakdown = { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: data.verses[0]?.verseNumber ?? 1, endVerse: data.verses[data.verses.length - 1]?.verseNumber ?? 1 }] };
            socket.emit(OTS_LOWER_THIRD_PAGES, { itemId: data.itemId, pages: fallback });
          }
        });
    });
  };

  const handleAnimationEnd = useCallback(() => {
    if (phase === "showing") { setPrevItem(null); setIsPushUp(false); reportPhase("visible"); }
    else if (phase === "dismissing") { setActiveItem(null); setPrevItem(null); setIsPushUp(false); reportPhase("hidden"); }
  }, [phase, reportPhase]);

  return (
    <div className="overlay-root">
      <div className="aspect-ratio-jail">
        {phase !== "hidden" && activeItem && (
          <div className="lower-third-container">
            <BlueRhombusStyle item={activeItem} prevItem={isPushUp ? prevItem : null} phase={phase} isPushUp={isPushUp} onAnimationEnd={handleAnimationEnd} />
          </div>
        )}
      </div>
    </div>
  );
}
