import { useRef, useCallback } from "react";
import { useSocket } from "../providers/SocketProvider";
import { CTS_CAMERA_PTZ_TAP_TO_CENTER } from "@invisible-av-booth/shared";
import type { CameraState } from "@invisible-av-booth/shared";

const DOUBLE_TAP_THRESHOLD_MS = 400;

export interface UseDoubleTapToCenterOpts {
  cameraId: string;
  cameraState: CameraState | null;
  onToast?: (message: string) => void;
}

export function useDoubleTapToCenter({
  cameraId,
  cameraState,
  onToast,
}: UseDoubleTapToCenterOpts): (e: { clientX: number; clientY: number; currentTarget: Element }) => void {
  const socket = useSocket();
  const lastTapRef = useRef(0);
  const lastCoordsRef = useRef({ x: 0, y: 0 });

  return useCallback(
    (e: { clientX: number; clientY: number; currentTarget: Element }) => {
      const now = Date.now();
      const timeSince = now - lastTapRef.current;

      if (timeSince < DOUBLE_TAP_THRESHOLD_MS) {
        // Double tap detected — use second tap coordinates
        if (!cameraState?.capabilities.tapToCenter) {
          onToast?.("VISCA not configured — tap-to-center unavailable");
          lastTapRef.current = 0;
          return;
        }
        if (cameraState.aiTracking) {
          onToast?.("Disable AI tracking to use tap-to-center");
          lastTapRef.current = 0;
          return;
        }

        const rect = e.currentTarget.getBoundingClientRect();
        const offsetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const offsetY = ((e.clientY - rect.top) / rect.height) * 2 - 1;

        socket?.emit(CTS_CAMERA_PTZ_TAP_TO_CENTER, { cameraId, offsetX, offsetY });
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
        lastCoordsRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [socket, cameraId, cameraState, onToast],
  );
}
