import type { Socket } from "socket.io-client";
import { CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";
import { useStore } from "../../store";

const NETWORK_LOSS_ID = "network-loss";

export function registerConnectionSocketHandlers(socket: Socket): void {
  socket.on("disconnect", () => {
    useStore.getState().addNotification({
      id: NETWORK_LOSS_ID,
      level: "banner",
      severity: "warning",
      message: "Connection lost — reconnecting…",
      autoResolve: true,
    });
  });

  socket.on("connect", () => {
    useStore.getState().removeNotification(NETWORK_LOSS_ID);
    socket.emit(CTS_REQUEST_INITIAL_STATE);
  });
}
