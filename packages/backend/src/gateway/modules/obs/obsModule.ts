import type { Server } from "socket.io";
import { eventBus } from "../../../eventBus/eventBus.js";
import type { SocketModule, AuthenticatedSocket } from "./../socketModule.js";
import type { ObsError, ObsService, ObsState, Result } from "../../../services/obsService.js";
import { logger } from "../../../logger.js";
import { BUS_OBS_STATE_CHANGED, BUS_OBS_ERROR, BUS_OBS_ERROR_RESOLVED, BUS_DEVICE_CAPABILITIES_UPDATED } from "../../../eventBus/types.js";
import { CTS_OBS_COMMAND, CTS_OBS_RECONNECT, STC_OBS_STATE, STC_OBS_ERROR, STC_OBS_ERROR_RESOLVED, STC_DEVICE_CAPABILITIES } from "@invisible-av-booth/shared";

interface ObsCommand {
  type: "startStream" | "stopStream" | "startRecording" | "stopRecording";
}

interface CommandResult {
  success: boolean;
  error?: string;
}

export class ObsModule implements SocketModule {
  constructor(private readonly obsService: ObsService) {}

  register(io: Server): void {
    // Forward EventBus OBS events to all connected clients.
    eventBus.subscribe(BUS_OBS_STATE_CHANGED, ({ state }) => {
      io.emit(STC_OBS_STATE, state);
    });

    eventBus.subscribe(BUS_OBS_ERROR, (errorEvent) => {
      io.emit(STC_OBS_ERROR, errorEvent);
    });

    eventBus.subscribe(BUS_OBS_ERROR_RESOLVED, (payload) => {
      io.emit(STC_OBS_ERROR_RESOLVED, payload);
    });

    eventBus.subscribe(BUS_DEVICE_CAPABILITIES_UPDATED, (payload) => {
      io.emit(STC_DEVICE_CAPABILITIES, payload);
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;

    socket.on(CTS_OBS_COMMAND, async (command: ObsCommand, ack: (result: CommandResult) => void) => {
      const baseLogPayload = { userId: jwtPayload.sub, context: { type: command.type } };
      logger.info("OBS command received", baseLogPayload);

      try {
        let result: Result<ObsState, ObsError>;
        switch (command.type) {
          case "startStream":
            result = await this.obsService.startStream();
            break;
          case "stopStream":
            result = await this.obsService.stopStream();
            break;
          case "startRecording":
            result = await this.obsService.startRecording();
            break;
          case "stopRecording":
            result = await this.obsService.stopRecording();
            break;
          default:
            ack({ success: false, error: "Unknown command" });
            return;
        }
        logger.info("OBS Command finished", { ...baseLogPayload, result });
        ack(result.success ? { success: true } : { success: false, error: result.error.message });
      } catch (err: unknown) {
        logger.info("OBS Command Failed", { ...baseLogPayload, err });
        ack({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    });

    socket.on(CTS_OBS_RECONNECT, async (ack: (result: CommandResult) => void) => {
      logger.info("OBS reconnect requested", { userId: jwtPayload.sub });
      const result = await this.obsService.reconnect();
      ack(result.success ? { success: true } : { success: false, error: result.error.message });
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    auth.socket.emit(STC_OBS_STATE, this.obsService.getState());
  }
}
