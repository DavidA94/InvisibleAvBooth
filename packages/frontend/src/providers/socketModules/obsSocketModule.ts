import type { Socket } from "socket.io-client";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED } from "@invisible-av-booth/shared";
import type { ObsState } from "../../types";
import { useStore } from "../../store";
import { logger } from "../../logger";

export function registerObsSocketHandlers(socket: Socket): void {
  socket.on(STC_OBS_STATE, (state: ObsState) => {
    logger.debug("OBS state received", { context: { connected: state.connected, streaming: state.streaming, recording: state.recording } });
    useStore.getState().setObsState(state);
  });

  socket.on(STC_OBS_ERROR_RESOLVED, (payload: { errorCode: string }) => {
    useStore.getState().removeNotification(payload.errorCode);
  });
}
