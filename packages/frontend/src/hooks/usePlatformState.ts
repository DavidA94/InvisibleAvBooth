import { useCallback } from "react";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { CTS_PLATFORM_COMMAND } from "@invisible-av-booth/shared";
import type { PlatformConnectionState, PlatformHealthSummary } from "../store/platformSlice";

export interface PlatformCommand {
  type: "startAll" | "stopAll" | "startPlatform" | "stopPlatform";
  platformType?: string;
  privacyOverride?: string;
}

export type { PlatformConnectionState, PlatformHealthSummary };

export function usePlatformState(): {
  platformStates: Map<string, PlatformConnectionState>;
  relayState: { running: boolean; obsConnected: boolean };
  platformReadiness: PlatformHealthSummary[];
  isAnyStarting: boolean;
  isAnyStopping: boolean;
  isAnyStreaming: boolean;
  sendCommand: (command: PlatformCommand) => void;
} {
  const platformStates = useStore((s) => s.platformStates);
  const relayState = useStore((s) => s.relayState);
  const platformReadiness = useStore((s) => s.platformReadiness);
  const socket = useSocket();

  const isAnyStarting = [...platformStates.values()].some((p) => p.state === "starting");
  const isAnyStopping = [...platformStates.values()].some((p) => p.state === "stopping");
  const isAnyStreaming = [...platformStates.values()].some((p) => p.state === "streaming");

  const sendCommand = useCallback(
    (command: PlatformCommand) => {
      socket?.emit(CTS_PLATFORM_COMMAND, command);
    },
    [socket],
  );

  return { platformStates, relayState, platformReadiness, isAnyStarting, isAnyStopping, isAnyStreaming, sendCommand };
}
