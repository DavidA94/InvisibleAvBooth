import { useCallback } from "react";
import { useStore } from "../store";
import { useSocket } from "../providers/SocketProvider";
import { CTS_LOWER_THIRD_COMMAND } from "@invisible-av-booth/shared";
import type { LowerThirdState, LowerThirdCommand, CommandResult } from "@invisible-av-booth/shared";

export function useLowerThirdState(): {
  state: LowerThirdState;
  sendCommand: (command: LowerThirdCommand) => Promise<CommandResult>;
} {
  const state = useStore((store) => store.lowerThirdState);
  const socket = useSocket();

  const sendCommand = useCallback(
    (command: LowerThirdCommand): Promise<CommandResult> => {
      return new Promise<CommandResult>((resolve) => {
        if (!socket) {
          resolve({ success: false, error: "Not connected" });
          return;
        }
        socket.emit(CTS_LOWER_THIRD_COMMAND, command, (result: CommandResult) => {
          resolve(result);
        });
      });
    },
    [socket],
  );

  return { state, sendCommand };
}
