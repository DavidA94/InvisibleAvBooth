import { useEffect, useRef, useState, useCallback } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import type { LowerThirdItem, LowerThirdState, AnimationPhase, PageBreakdown } from "@invisible-av-booth/shared";
import {
  STO_LOWER_THIRD_SHOW,
  STO_LOWER_THIRD_DISMISS,
  STO_LOWER_THIRD_PUSH_UP,
  STO_LOWER_THIRD_PAGE,
  STO_LOWER_THIRD_STATE,
  STO_LOWER_THIRD_MEASURE,
  STO_LOWER_THIRD_FORCE_CLEAR,
  OTS_LOWER_THIRD_PHASE,
  OTS_LOWER_THIRD_RESOLUTION,
  OTS_LOWER_THIRD_PAGES,
} from "@invisible-av-booth/shared";
import { BlueRhombusStyle } from "./styles/BlueRhombusStyle";
import "./overlay.css";

const DISCONNECT_TIMEOUT_MS = 15000;
const HEARTBEAT_INTERVAL_MS = 5000;
const LOG_ENDPOINT = "/api/overlay/logs";

function sendLog(level: "info" | "warn" | "error", message: string, context?: Record<string, unknown>): void {
  fetch(LOG_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify([{ level, message, context }]),
  }).catch(() => {}); // fire-and-forget
}

export function LowerThirdOverlay(): ReactNode {
  const [activeItem, setActiveItem] = useState<LowerThirdItem | null>(null);
  const [phase, setPhase] = useState<AnimationPhase>("hidden");
  const socketRef = useRef<Socket | null>(null);
  const disconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fontsReady = useRef(false);

  const reportPhase = useCallback((p: AnimationPhase) => {
    setPhase(p);
    socketRef.current?.emit(OTS_LOWER_THIRD_PHASE, p);
  }, []);

  // Send resolution telemetry
  const sendResolution = useCallback((socket: Socket) => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ratio = width / height;
    const isCorrect = width === 1920 && height === 1080 && Math.abs(ratio - 16 / 9) < 0.02;
    socket.emit(OTS_LOWER_THIRD_RESOLUTION, { width, height, isCorrect });
  }, []);

  // Disconnect timeout — dismiss stuck graphic after 15s
  const startDisconnectTimer = useCallback(() => {
    clearDisconnectTimer();
    disconnectTimerRef.current = setTimeout(() => {
      if (activeItem && !activeItem.autoDismissMs) {
        setPhase("dismissing");
        // After animation, go to hidden
        setTimeout(() => {
          setActiveItem(null);
          setPhase("hidden");
        }, 1000);
      }
    }, DISCONNECT_TIMEOUT_MS);
  }, [activeItem]);

  const clearDisconnectTimer = (): void => {
    if (disconnectTimerRef.current) {
      clearTimeout(disconnectTimerRef.current);
      disconnectTimerRef.current = null;
    }
  };

  useEffect(() => {
    // Wait for fonts before connecting
    document.fonts.ready.then(() => {
      fontsReady.current = true;
      connectSocket();
    });

    return () => {
      socketRef.current?.disconnect();
      clearDisconnectTimer();
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectSocket = (): void => {
    const socket = io("/overlay", {
      transports: ["websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      clearDisconnectTimer();
      sendResolution(socket);

      // Signal ready to parent (static wrapper)
      window.parent.postMessage({ type: "overlay-ready" }, "*");

      // Start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => {
        window.parent.postMessage({ type: "overlay-heartbeat" }, "*");
      }, HEARTBEAT_INTERVAL_MS);

      sendLog("info", "Overlay connected");
    });

    socket.on("disconnect", () => {
      startDisconnectTimer();
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      sendLog("warn", "Overlay disconnected");
    });

    // Initial state
    socket.on(STO_LOWER_THIRD_STATE, (state: LowerThirdState & { skipEntrance?: boolean }) => {
      if (state.phase === "dismissing" || state.phase === "hidden") {
        setActiveItem(null);
        setPhase("hidden");
        reportPhase("hidden");
        return;
      }
      if (state.active && state.skipEntrance) {
        setActiveItem(state.active);
        setPhase("visible");
        reportPhase("visible");
      } else if (state.active && state.phase === "showing") {
        setActiveItem(state.active);
        setPhase("showing");
        // Animation will report visible on completion
      }
    });

    // Show command
    socket.on(STO_LOWER_THIRD_SHOW, (data: { item: LowerThirdItem }) => {
      setActiveItem(data.item);
      setPhase("showing");
      reportPhase("showing");
    });

    // Dismiss command
    socket.on(STO_LOWER_THIRD_DISMISS, () => {
      setPhase("dismissing");
      reportPhase("dismissing");
    });

    // Push-up command
    socket.on(STO_LOWER_THIRD_PUSH_UP, (data: { item: LowerThirdItem }) => {
      setActiveItem(data.item);
      setPhase("showing");
      reportPhase("showing");
    });

    // Page command
    socket.on(STO_LOWER_THIRD_PAGE, (data: { page: number }) => {
      setActiveItem((prev) => {
        if (!prev?.pages) return prev;
        return { ...prev, pages: { ...prev.pages, currentPage: data.page } };
      });
      setPhase("showing");
      reportPhase("showing");
    });

    // Force clear
    socket.on(STO_LOWER_THIRD_FORCE_CLEAR, () => {
      setActiveItem(null);
      setPhase("hidden");
      reportPhase("hidden");
    });

    // Measurement request
    socket.on(STO_LOWER_THIRD_MEASURE, (data: { itemId: string; verses: Array<{ verseNumber: number; text: string }>; reference: string }) => {
      // Measurement will be implemented in task 44 with the hidden measurement container
      // For now, report single-page fallback
      const pages: PageBreakdown = {
        totalPages: 1,
        currentPage: 1,
        pages: [{ pageNumber: 1, startVerse: data.verses[0]?.verseNumber ?? 1, endVerse: data.verses[data.verses.length - 1]?.verseNumber ?? 1 }],
      };
      socket.emit(OTS_LOWER_THIRD_PAGES, { itemId: data.itemId, pages });
    });
  };

  // Handle animation completion — report phase to backend
  const handleAnimationEnd = useCallback(() => {
    if (phase === "showing") {
      reportPhase("visible");
    } else if (phase === "dismissing") {
      setActiveItem(null);
      reportPhase("hidden");
    }
  }, [phase, reportPhase]);

  return (
    <div className="overlay-root">
      <div className="aspect-ratio-jail">
        {activeItem && phase !== "hidden" && (
          <div className="lower-third-container">
            <BlueRhombusStyle item={activeItem} phase={phase} onAnimationEnd={handleAnimationEnd} />
          </div>
        )}
      </div>
    </div>
  );
}
