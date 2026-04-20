import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED, STC_SESSION_MANIFEST_UPDATED, CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";
import { useStore } from "../store";
import type { ObsState, SessionManifest, Notification } from "../types";

const SocketContext = createContext<Socket | null>(null);

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

const NETWORK_LOSS_ID = "network-loss";

export function SocketProvider({ children }: SocketProviderProps): ReactNode {
  const [socket, setSocket] = useState<Socket | null>(null);
  const user = useStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const newSocket = io({ withCredentials: true });
    setSocket(newSocket);

    newSocket.on(STC_OBS_STATE, (state: ObsState) => {
      useStore.getState().setObsState(state);
    });

    newSocket.on(STC_SESSION_MANIFEST_UPDATED, (payload: { manifest: SessionManifest; interpolatedStreamTitle: string }) => {
      useStore.getState().setManifest(payload.manifest, payload.interpolatedStreamTitle);
    });

    newSocket.on("notification", (notification: Notification) => {
      useStore.getState().addNotification(notification);
    });

    newSocket.on(STC_OBS_ERROR_RESOLVED, (payload: { errorCode: string }) => {
      useStore.getState().removeNotification(payload.errorCode);
    });

    newSocket.on("disconnect", () => {
      useStore.getState().addNotification({
        id: NETWORK_LOSS_ID,
        level: "banner",
        severity: "warning",
        message: "Connection lost — reconnecting…",
        autoResolve: true,
      });
    });

    newSocket.on("connect", () => {
      useStore.getState().removeNotification(NETWORK_LOSS_ID);
      newSocket.emit(CTS_REQUEST_INITIAL_STATE);
    });

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
