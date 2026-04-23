import type { Socket } from "socket.io-client";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED } from "@invisible-av-booth/shared";
import type { ObsState } from "../../types";
import { useStore } from "../../store";

export function registerObsSocketHandlers(socket: Socket): void {
  socket.on(STC_OBS_STATE, (state: ObsState) => {
    useStore.getState().setObsState(state);
  });

  socket.on(STC_OBS_ERROR_RESOLVED, (payload: { errorCode: string }) => {
    useStore.getState().removeNotification(payload.errorCode);
  });
}
