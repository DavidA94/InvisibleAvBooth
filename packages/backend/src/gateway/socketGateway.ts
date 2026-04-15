import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { eventBus } from "../eventBus.js";
import type { ObsService } from "../services/obsService.js";
import type { SessionManifestService } from "../services/sessionManifestService.js";
import type { AuthService } from "../services/authService.js";
import { logger } from "../logger.js";

interface ObsCommand {
  type: "startStream" | "stopStream" | "startRecording" | "stopRecording";
}

interface CommandResult {
  success: boolean;
  error?: string;
}

export class SocketGateway {
  private io: SocketServer;

  constructor(
    httpServer: HttpServer,
    private readonly authService: AuthService,
    private readonly obsService: ObsService,
    private readonly manifestService: SessionManifestService,
  ) {
    this.io = new SocketServer(httpServer, { cors: { origin: "*" } });
    this.setupEventBusForwarding();
    this.setupConnectionHandler();
  }

  private setupEventBusForwarding(): void {
    // Forward EventBus events to all connected Socket.io clients.
    eventBus.subscribe("obs:state:changed", ({ state }) => {
      this.io.emit("obs:state", state);
    });

    eventBus.subscribe("session:manifest:updated", (payload) => {
      this.io.emit("session:manifest:updated", payload);
    });

    eventBus.subscribe("obs:error", (errorEvent) => {
      this.io.emit("obs:error", errorEvent);
    });

    eventBus.subscribe("obs:error:resolved", (payload) => {
      this.io.emit("obs:error:resolved", payload);
    });

    eventBus.subscribe("device:capabilities:updated", (payload) => {
      this.io.emit("device:capabilities", payload);
    });
  }

  private setupConnectionHandler(): void {
    this.io.use((socket, next) => {
      // Validate JWT on every connection and reconnect handshake.
      const token =
        (socket.handshake.auth as { token?: string }).token ??
        (socket.handshake.headers.cookie ?? "")
          .split(";")
          .find((c) => c.trim().startsWith("token="))
          ?.split("=")[1];

      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }

      const result = this.authService.verifyToken(token);
      if (!result.success) {
        // Token expired mid-session — emit a modal notification prompting re-login.
        if (result.error.code === "INVALID_TOKEN") {
          logger.warn("Socket reconnect rejected: TOKEN_EXPIRED", { context: { socketId: socket.id } });
        }
        next(new Error("Unauthorized"));
        return;
      }

      (socket.data as { jwtPayload: unknown }).jwtPayload = result.value;
      next();
    });

    this.io.on("connection", (socket) => {
      const payload = (socket.data as { jwtPayload: { sub: string; username: string } }).jwtPayload;
      logger.info("Socket connected", { userId: payload.sub });

      // Send current state to the newly connected client.
      socket.emit("obs:state", this.obsService.getState());
      socket.emit("session:manifest:updated", {
        manifest: this.manifestService.get(),
        interpolatedStreamTitle: this.manifestService.interpolate(this.manifestService.get(), "{Date} – {Speaker} – {Title}"),
      });

      // obs:command — route to ObsService
      socket.on("obs:command", async (command: ObsCommand, ack: (result: CommandResult) => void) => {
        logger.info("OBS command received", { userId: payload.sub, context: { type: command.type } });

        let result;
        try {
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
          const message = err instanceof Error ? err.message : String(err);
          ack({ success: false, error: message });
        }
      });

      // session:manifest:update
      socket.on("session:manifest:update", (patch: Record<string, unknown>, ack: (result: CommandResult) => void) => {
        const jwtPayload = payload as Parameters<typeof this.manifestService.update>[1];
        const result = this.manifestService.update(patch as never, jwtPayload);
        ack(result.success ? { success: true } : { success: false, error: "Update failed" });
      });

      // obs:reconnect — available to all authenticated roles
      socket.on("obs:reconnect", async (ack: (result: CommandResult) => void) => {
        logger.info("OBS reconnect requested", { userId: payload.sub });
        const result = await this.obsService.reconnect();
        ack(result.success ? { success: true } : { success: false, error: result.error.message });
      });

      socket.on("disconnect", () => {
        logger.info("Socket disconnected", { userId: payload.sub });
      });
    });
  }

  // Expose the io instance for testing
  getIo(): SocketServer {
    return this.io;
  }
}
