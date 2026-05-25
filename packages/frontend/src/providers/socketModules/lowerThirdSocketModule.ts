import type { Socket } from "socket.io-client";
import { STC_LOWER_THIRD_STATE } from "@invisible-av-booth/shared";
import type { LowerThirdState } from "@invisible-av-booth/shared";
import { useStore } from "../../store";

const RESOLUTION_MISMATCH_ID = "lt-resolution-mismatch";
const OVERLAY_STALE_ID = "lt-overlay-stale";

export function registerLowerThirdSocketHandlers(socket: Socket): void {
  socket.on(STC_LOWER_THIRD_STATE, (state: LowerThirdState) => {
    const previousState = useStore.getState().lowerThirdState;
    useStore.getState().setLowerThirdState(state);

    // Req 2.5: Emit resolution mismatch banner
    if (state.overlayConnected && !state.overlayResolutionCorrect && previousState.overlayResolutionCorrect !== false) {
      useStore.getState().addNotification({
        id: RESOLUTION_MISMATCH_ID,
        level: "banner",
        severity: "warning",
        message: "OBS browser source is misconfigured. Expected 1920×1080 at 16:9. Check OBS browser source settings.",
      });
    }

    // Req 2.6: Auto-clear resolution mismatch banner
    if (state.overlayConnected && state.overlayResolutionCorrect && !previousState.overlayResolutionCorrect) {
      useStore.getState().removeNotification(RESOLUTION_MISMATCH_ID);
    }

    // Clear resolution banner if overlay disconnects
    if (!state.overlayConnected && previousState.overlayConnected) {
      useStore.getState().removeNotification(RESOLUTION_MISMATCH_ID);
    }

    // Req 8.8: Show stale indicator when overlay has been disconnected >15s with active item
    if (state.overlayStale && !previousState.overlayStale) {
      useStore.getState().addNotification({
        id: OVERLAY_STALE_ID,
        level: "banner",
        severity: "warning",
        message: "Overlay disconnected — lower-third may no longer be visible on stream.",
      });
    }
    if (!state.overlayStale && previousState.overlayStale) {
      useStore.getState().removeNotification(OVERLAY_STALE_ID);
    }
  });
}
