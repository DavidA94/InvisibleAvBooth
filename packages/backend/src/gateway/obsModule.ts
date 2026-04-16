import type { Server } from "socket.io";
import { eventBus } from "../eventBus.js";
import type { SocketModule, AuthenticatedSocket } from "./socketModule.js";
import type { ObsService } from "../services/obsService.js";
import { logger } from "../logger.js";

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
    eventBus.subscribe("bus:obs:state:changed", ({ state }) => {
      io.emit("stc:obs:state", state);
    });

    eventBus.subscribe("bus:obs:error", (errorEvent) => {
      io.emit("stc:obs:error", errorEvent);
    });

    eventBus.subscribe("bus:obs:error:resolved", (payload) => {
      io.emit("stc:obs:error:resolved", payload);
    });

    eventBus.subscribe("bus:device:capabilities:updated", (payload) => {
      io.emit("stc:device:capabilities", payload);
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;

    // cts:obs:command — route to ObsService
    socket.on("cts:obs:command", async (command: ObsCommand, ack: (result: CommandResult) => void) => {
      logger.info("OBS command received", { userId: jwtPayload.sub, context: { type: command.type } });

      try {
        let result;
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
        ack(result.success ? { success: true } : { success: false, error: result.error.message });
      } catch (err: unknown) {
        ack({ success: false, error: err instanceof Error ? err.message : String(err) });
      }
    });

    // cts:obs:reconnect — available to all authenticated roles
    socket.on("cts:obs:reconnect", async (ack: (result: CommandResult) => void) => {
      logger.info("OBS reconnect requested", { userId: jwtPayload.sub });
      const result = await this.obsService.reconnect();
      ack(result.success ? { success: true } : { success: false, error: result.error.message });
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    auth.socket.emit("stc:obs:state", this.obsService.getState());
  }
}
