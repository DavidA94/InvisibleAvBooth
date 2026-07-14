import type { Socket } from "socket.io-client";
import { CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";
import { useStore } from "../../store";
import { logger } from "../../logger";

const NETWORK_LOSS_ID = "network-loss";

export function registerConnectionSocketHandlers(socket: Socket): void {
  socket.on("disconnect", (reason) => {
    logger.warn("Socket disconnected", { context: { reason } });
    useStore.getState().setSocketConnected(false);
    useStore.getState().addNotification({
      id: NETWORK_LOSS_ID,
      level: "banner",
      severity: "warning",
      message: "Connection lost — reconnecting…",
      autoResolve: true,
    });
  });

  socket.on("connect", () => {
    logger.info("Socket connected, requesting initial state");
    useStore.getState().setSocketConnected(true);
    useStore.getState().removeNotification(NETWORK_LOSS_ID);
    socket.emit(CTS_REQUEST_INITIAL_STATE);
  });
}
