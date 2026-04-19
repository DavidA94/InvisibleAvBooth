import { createContext, useContext, useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED, STC_SESSION_MANIFEST_UPDATED, CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";
import { useStore } from "../store";
import type { ObsState, SessionManifest, Notification } from "../types";

// The socket context exposes the raw socket for command emission.
// Only SocketProvider touches the socket directly — all other components
// interact with device state through store hooks.
const SocketContext = createContext<Socket | null>(null);

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

// Network-loss banner notification ID — stable so we can add/remove it reliably.
const NETWORK_LOSS_ID = "network-loss";

export function SocketProvider({ children }: SocketProviderProps): ReactNode {
  const socketRef = useRef<Socket | null>(null);
  const user = useStore((s) => s.user);

  useEffect(() => {
    // Only connect when authenticated
    if (!user) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socket = io({ withCredentials: true });
    socketRef.current = socket;

    // ── Event → store wiring ──────────────────────────────────────────────

    socket.on(STC_OBS_STATE, (state: ObsState) => {
      useStore.getState().setObsState(state);
    });

    socket.on(STC_SESSION_MANIFEST_UPDATED, (payload: { manifest: SessionManifest; interpolatedStreamTitle: string }) => {
      useStore.getState().setManifest(payload.manifest, payload.interpolatedStreamTitle);
    });

    socket.on("notification", (notification: Notification) => {
      useStore.getState().addNotification(notification);
    });

    socket.on(STC_OBS_ERROR_RESOLVED, (payload: { errorCode: string }) => {
      useStore.getState().removeNotification(payload.errorCode);
    });

    // ── Network loss handling ─────────────────────────────────────────────

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
      // Re-request initial state after listeners are ready
      socket.emit(CTS_REQUEST_INITIAL_STATE);
    });

    // Request initial state on first connect
    if (socket.connected) {
      socket.emit(CTS_REQUEST_INITIAL_STATE);
    }

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  return <SocketContext.Provider value={socketRef.current}>{children}</SocketContext.Provider>;
}
