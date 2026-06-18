import { useRef, useCallback, useEffect } from "react";
import { useSocket } from "../providers/SocketProvider";
import { CTS_CAMERA_PTZ_MOVE_START, CTS_CAMERA_PTZ_MOVE_KEEPALIVE, CTS_CAMERA_PTZ_MOVE_STOP } from "@invisible-av-booth/shared";
import { logger } from "../logger";

const KEEPALIVE_INTERVAL_MS = 200;

export interface UsePtzMoveResult {
  startMove: (cameraId: string, pan: number, tilt: number) => void;
  updateMove: (pan: number, tilt: number) => void;
  stopMove: () => void;
}

export function usePtzMove(): UsePtzMoveResult {
  const socket = useSocket();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const cameraIdRef = useRef<string>("");
  const speedRef = useRef({ pan: 0, tilt: 0 });
  const activeRef = useRef(false);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    activeRef.current = false;
  }, []);

  const startMove = useCallback(
    (cameraId: string, pan: number, tilt: number) => {
      if (!socket) { logger.warn("PTZ move:start — no socket"); return; }
      if (!socket.connected) { logger.warn("PTZ move:start — socket disconnected"); return; }
      cleanup();
      cameraIdRef.current = cameraId;
      speedRef.current = { pan, tilt };
      activeRef.current = true;
      socket.emit(CTS_CAMERA_PTZ_MOVE_START, { cameraId, pan, tilt });
      logger.debug("PTZ move:start", { context: { cameraId, pan, tilt } });

      intervalRef.current = setInterval(() => {
        if (!activeRef.current) return;
        socket.emit(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, { cameraId: cameraIdRef.current, pan: speedRef.current.pan, tilt: speedRef.current.tilt });
      }, KEEPALIVE_INTERVAL_MS);
    },
    [socket, cleanup],
  );

  const updateMove = useCallback((pan: number, tilt: number) => {
    speedRef.current = { pan, tilt };
  }, []);

  const stopMove = useCallback(() => {
    if (!socket || !activeRef.current) return;
    cleanup();
    socket.emit(CTS_CAMERA_PTZ_MOVE_STOP, { cameraId: cameraIdRef.current });
    logger.debug("PTZ move:stop", { context: { cameraId: cameraIdRef.current } });
  }, [socket, cleanup]);

  useEffect(() => cleanup, [cleanup]);

  return { startMove, updateMove, stopMove };
}
