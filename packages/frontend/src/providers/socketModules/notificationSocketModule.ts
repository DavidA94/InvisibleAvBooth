import type { Socket } from "socket.io-client";
import type { Notification } from "../../types";
import { useStore } from "../../store";

export function registerNotificationSocketHandlers(socket: Socket): void {
  socket.on("notification", (notification: Notification) => {
    useStore.getState().addNotification(notification);
  });
}
