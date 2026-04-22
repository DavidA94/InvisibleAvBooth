import type { Server } from "socket.io";
import { eventBus } from "../../../eventBus/eventBus.js";
import type { SocketModule, AuthenticatedSocket } from "../socketModule.js";
import type { SessionManifestService, SessionManifest } from "../../../services/sessionManifestService.js";
import { logger } from "../../../logger.js";
import { BUS_SESSION_MANIFEST_UPDATED } from "../../../eventBus/types.js";
import { CTS_SESSION_MANIFEST_UPDATE, STC_SESSION_MANIFEST_UPDATED, interpolateStreamTitle } from "@invisible-av-booth/shared";

interface CommandResult {
  success: boolean;
  error?: string;
}

export class SessionManifestModule implements SocketModule {
  constructor(private readonly manifestService: SessionManifestService) {}

  register(io: Server): void {
    // Forward EventBus manifest events to all connected clients.
    eventBus.subscribe(BUS_SESSION_MANIFEST_UPDATED, (payload) => {
      io.emit(STC_SESSION_MANIFEST_UPDATED, payload);
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;

    // CTS_SESSION_MANIFEST_UPDATE — update the in-memory manifest
    socket.on(CTS_SESSION_MANIFEST_UPDATE, (patch: Partial<SessionManifest>, ack: (result: CommandResult) => void) => {
      logger.info("Session manifest update received", { userId: jwtPayload.sub });
      if (Object.keys(patch).length === 0) {
        const result = this.manifestService.clear(jwtPayload);
        ack(result.success ? { success: true } : { success: false, error: result.error.message });
      } else {
        const result = this.manifestService.update(patch, jwtPayload);
        ack(result.success ? { success: true } : { success: false, error: "Update failed" });
      }
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    const manifest = this.manifestService.get();
    auth.socket.emit(STC_SESSION_MANIFEST_UPDATED, {
      manifest,
      interpolatedStreamTitle: interpolateStreamTitle(manifest, this.manifestService.getTemplate()),
    });
  }
}
