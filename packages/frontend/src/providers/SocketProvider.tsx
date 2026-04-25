import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { io } from "socket.io-client";
import type { Socket } from "socket.io-client";
import { useStore } from "../store";
import { getAuthToken, apiUrl } from "../api/client";
import { registerObsSocketHandlers } from "./socketModules/obsSocketModule";
import { registerSessionManifestSocketHandlers } from "./socketModules/sessionManifestSocketModule";
import { registerNotificationSocketHandlers } from "./socketModules/notificationSocketModule";
import { registerConnectionSocketHandlers } from "./socketModules/connectionSocketModule";

const SocketContext = createContext<Socket | null>(null);

export function useSocket(): Socket | null {
  return useContext(SocketContext);
}

interface SocketProviderProps {
  children: ReactNode;
}

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

    const token = getAuthToken();
    if (!token) return;

    const newSocket = io(apiUrl(""), {
      auth: { token },
      transports: ["websocket"],
    });
    setSocket(newSocket);

    registerObsSocketHandlers(newSocket);
    registerSessionManifestSocketHandlers(newSocket);
    registerNotificationSocketHandlers(newSocket);
    registerConnectionSocketHandlers(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>;
}
