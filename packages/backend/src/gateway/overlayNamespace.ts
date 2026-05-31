import type { Server, Socket } from "socket.io";
import type { LowerThirdService } from "../services/lowerThirdService.js";
import type { AnimationPhase, PageBreakdown } from "@invisible-av-booth/shared";
import {
  OTS_LOWER_THIRD_PHASE,
  OTS_LOWER_THIRD_RESOLUTION,
  OTS_LOWER_THIRD_PAGES,
  STO_LOWER_THIRD_STATE,
  STO_LOWER_THIRD_MEASURE,
} from "@invisible-av-booth/shared";
import { logger } from "../logger.js";

interface LogEntry {
  level?: "debug" | "info" | "warn" | "error";
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Registers the /overlay Socket.io namespace — unauthenticated, single-client.
 * This is NOT a SocketModule because it doesn't use JWT auth.
 */
export function registerOverlayNamespace(io: Server, service: LowerThirdService): void {
  const overlay = io.of("/overlay");
  let currentSocket: Socket | null = null;

  // Wire service's sendToOverlay to emit on the current overlay socket
  service.setSendToOverlay((event: string, data?: unknown) => {
    if (currentSocket) {
      currentSocket.emit(event, data);
    }
  });

  overlay.on("connection", (socket) => {
    if (currentSocket) {
      logger.warn("Previous overlay client forcibly disconnected", { context: { oldId: currentSocket.id, newId: socket.id } });
      currentSocket.disconnect(true);
    }
    currentSocket = socket;
    service.setOverlayConnected(true);
    logger.info("Overlay client connected", { context: { socketId: socket.id } });

    // Send initial state
    const state = service.getFullState();
    const skipEntrance = state.phase === "visible";
    socket.emit(STO_LOWER_THIRD_STATE, { ...state, skipEntrance });

    // Send pending measurement requests
    for (const item of service.getPendingMeasurements()) {
      const content = item.content as { verses?: Array<{ verseNumber: number; text: string }>; formattedReference?: string };
      socket.emit(STO_LOWER_THIRD_MEASURE, { itemId: item.id, verses: content.verses, reference: content.formattedReference });
    }

    // Phase reports from overlay
    socket.on(OTS_LOWER_THIRD_PHASE, (phase: AnimationPhase) => {
      service.reportPhase(phase);
    });

    // Resolution telemetry
    socket.on(OTS_LOWER_THIRD_RESOLUTION, (data: { width: number; height: number; isCorrect: boolean }) => {
      service.handleResolutionReport(data);
    });

    // Page breakdown reports
    socket.on(OTS_LOWER_THIRD_PAGES, (data: { itemId: string; pages: PageBreakdown }) => {
      service.reportPages(data.itemId, data.pages);
    });

    // Overlay logging via socket (supplementary to POST endpoint)
    socket.on("ots:lower-third:log", (entries: LogEntry[]) => {
      if (!Array.isArray(entries)) return;
      for (const entry of entries.slice(0, 10)) {
        const level = entry.level ?? "info";
        if (!["debug", "info", "warn", "error"].includes(level)) continue;
        logger[level](entry.message, { source: "overlay", ...(entry.context ? { context: entry.context } : {}) });
      }
    });

    socket.on("disconnect", () => {
      if (currentSocket === socket) {
        currentSocket = null;
        service.setOverlayConnected(false);
        logger.info("Overlay client disconnected", { context: { socketId: socket.id } });
      }
    });
  });
}
