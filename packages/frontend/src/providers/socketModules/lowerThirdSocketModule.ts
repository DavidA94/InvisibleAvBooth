import type { Socket } from "socket.io-client";
import { STC_LOWER_THIRD_STATE } from "@invisible-av-booth/shared";
import type { LowerThirdState } from "@invisible-av-booth/shared";
import { useStore } from "../../store";

export function registerLowerThirdSocketHandlers(socket: Socket): void {
  socket.on(STC_LOWER_THIRD_STATE, (state: LowerThirdState) => {
    useStore.getState().setLowerThirdState(state);
  });
}
