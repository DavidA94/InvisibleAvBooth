import type { Server } from "socket.io";
import { eventBus } from "../../../eventBus/eventBus.js";
import type { SocketModule, AuthenticatedSocket } from "../socketModule.js";
import type { StreamingPlatformService } from "../../../services/streamingPlatformService.js";
import type { RelayService } from "../../../services/relayService.js";
import { logger } from "../../../logger.js";
import { BUS_PLATFORM_STATE_CHANGED, BUS_PLATFORM_HEALTH_UPDATED, BUS_RELAY_STATE_CHANGED, BUS_PLATFORM_READINESS_CHANGED } from "../../../eventBus/types.js";
import { CTS_PLATFORM_COMMAND, STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";

interface PlatformCommand {
  type: "startAll" | "startPlatform" | "stopAll" | "stopPlatform";
  platformType?: string;
}

interface CommandResult {
  success: boolean;
  error?: string;
}

export class StreamingPlatformModule implements SocketModule {
  constructor(
    private readonly platformService: StreamingPlatformService,
    private readonly relayService: RelayService,
  ) {}

  register(io: Server): void {
    eventBus.subscribe(BUS_PLATFORM_STATE_CHANGED, (payload) => io.emit(STC_PLATFORM_STATE, payload));
    eventBus.subscribe(BUS_PLATFORM_HEALTH_UPDATED, (payload) => io.emit(STC_PLATFORM_HEALTH, payload));
    eventBus.subscribe(BUS_RELAY_STATE_CHANGED, (payload) => io.emit(STC_RELAY_STATE, payload));
    eventBus.subscribe(BUS_PLATFORM_READINESS_CHANGED, (payload) => io.emit(STC_PLATFORM_READINESS, payload));
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;

    socket.on(CTS_PLATFORM_COMMAND, async (command: PlatformCommand, ack: (result: CommandResult) => void) => {
      logger.info("Platform command received", { userId: jwtPayload.sub, context: { command } });
      try {
        switch (command.type) {
          case "startAll":
            await this.platformService.startAll();
            break;
          case "startPlatform":
            if (!command.platformType) throw new Error("platformType required");
            await this.platformService.startPlatform(command.platformType);
            break;
          case "stopAll":
            await this.platformService.stopAll();
            break;
          case "stopPlatform":
            if (!command.platformType) throw new Error("platformType required");
            await this.platformService.stopPlatform(command.platformType);
            break;
          default:
            throw new Error(`Unknown command type: ${(command as { type: string }).type}`);
        }
        ack({ success: true });
      } catch (error: unknown) {
        ack({ success: false, error: error instanceof Error ? error.message : String(error) });
      }
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    for (const [platformType, state] of this.platformService.getPlatformStates()) {
      auth.socket.emit(STC_PLATFORM_STATE, { platformType, state });
    }
    auth.socket.emit(STC_RELAY_STATE, this.relayService.getRelayState());
    auth.socket.emit(STC_PLATFORM_READINESS, { platforms: this.platformService.getPlatformHealth() });
  }
}
