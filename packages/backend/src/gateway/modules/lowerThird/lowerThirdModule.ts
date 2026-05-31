import type { Server } from "socket.io";
import { eventBus } from "../../../eventBus/eventBus.js";
import type { SocketModule, AuthenticatedSocket } from "../socketModule.js";
import type { LowerThirdService } from "../../../services/lowerThirdService.js";
import { logger } from "../../../logger.js";
import { BUS_LOWER_THIRD_STATE_CHANGED } from "../../../eventBus/types.js";
import { CTS_LOWER_THIRD_COMMAND, STC_LOWER_THIRD_STATE } from "@invisible-av-booth/shared";
import type { LowerThirdCommand, CommandResult } from "@invisible-av-booth/shared";

export class LowerThirdModule implements SocketModule {
  constructor(private readonly service: LowerThirdService) {}

  register(io: Server): void {
    eventBus.subscribe(BUS_LOWER_THIRD_STATE_CHANGED, (state) => {
      io.emit(STC_LOWER_THIRD_STATE, state);
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    auth.socket.on(CTS_LOWER_THIRD_COMMAND, (command: LowerThirdCommand, ack: (result: CommandResult) => void) => {
      logger.info("Lower-third command received", { userId: auth.jwtPayload.sub, context: { type: command.type } });
      const result = this.handleCommand(command);
      ack(result);
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    auth.socket.emit(STC_LOWER_THIRD_STATE, this.service.getFullState());
  }

  private handleCommand(command: LowerThirdCommand): CommandResult {
    switch (command.type) {
      case "activate": {
        const result = this.service.activate(command.itemId, command.skipAnimation);
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      case "dismiss-active": {
        const result = this.service.dismissActive();
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      case "force-clear": {
        this.service.forceClear();
        return { success: true };
      }
      case "add-to-library": {
        const result = this.service.addToLibrary(command.input);
        return result.success ? { success: true, itemId: result.value.id } : { success: false, error: result.error };
      }
      case "remove-from-library": {
        const result = this.service.removeFromLibrary(command.itemId);
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      case "edit-library-item": {
        const result = this.service.editLibraryItem(command.itemId, command.patch);
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      case "page-next": {
        const result = this.service.pageNext();
        return result.success ? { success: true } : { success: false, error: result.error };
      }
      case "page-previous": {
        const result = this.service.pagePrevious();
        return result.success ? { success: true } : { success: false, error: result.error };
      }
    }
  }
}
