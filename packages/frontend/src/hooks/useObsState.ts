import { useCallback } from "react";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { CTS_OBS_COMMAND } from "@invisible-av-booth/shared";
import type { ObsState, ObsCommand, CommandResult } from "../types";

export function useObsState(): {
  state: ObsState;
  isPending: boolean;
  sendCommand: (command: ObsCommand) => Promise<CommandResult>;
} {
  const state = useStore((s) => s.obsState);
  const isPending = useStore((s) => s.obsPending);
  const socket = useSocket();

  const sendCommand = useCallback(
    (command: ObsCommand): Promise<CommandResult> => {
      useStore.getState().setObsPending(true);

      return new Promise<CommandResult>((resolve) => {
        if (!socket) {
          useStore.getState().setObsPending(false);
          resolve({ success: false, error: "Not connected" });
          return;
        }

        socket.emit(CTS_OBS_COMMAND, command, (result: CommandResult) => {
          if (!result.success) {
            useStore.getState().setObsPending(false);
          }
          // On success, pending is cleared by the next stc:obs:state event
          resolve(result);
        });
      });
    },
    [socket],
  );

  return { state, isPending, sendCommand };
}
