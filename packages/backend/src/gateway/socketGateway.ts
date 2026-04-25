import { Server as SocketServer } from "socket.io";
import type { Server as HttpServer } from "http";
import type { AuthService, JwtPayload } from "../services/authService.js";
import type { SocketModule } from "./modules/socketModule.js";
import { logger } from "../logger.js";
import { CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";

// SocketGateway is responsible for:
//   1. Establishing the Socket.io server
//   2. JWT authentication on every connection and reconnect handshake
//   3. Delegating lifecycle calls to each registered SocketModule
//
// SocketGateway has no knowledge of specific services or event names.
// Adding or removing a module requires only changing the modules array passed
// to the constructor — no changes to this file.
export class SocketGateway {
  private readonly io: SocketServer;

  constructor(
    httpServer: HttpServer,
    private readonly authService: AuthService,
    private readonly modules: SocketModule[],
  ) {
    this.io = new SocketServer(httpServer, { cors: { origin: "*" } });

    // Register each module's io-level event subscriptions (EventBus → broadcast).
    for (const module of this.modules) {
      module.register(this.io);
    }

    this.setupConnectionHandler();
  }

  private setupConnectionHandler(): void {
    // Validate JWT on every connection and reconnect handshake.
    // Modules never see unauthenticated sockets.
    this.io.use((socket, next) => {
      const token = (socket.handshake.auth as { token?: string }).token;

      if (!token) {
        next(new Error("Unauthorized"));
        return;
      }

      const result = this.authService.verifyToken(token);
      if (!result.success) {
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
      const jwtPayload = (socket.data as { jwtPayload: JwtPayload }).jwtPayload;
      const auth = { socket, jwtPayload };

      logger.info("Socket connected", { userId: jwtPayload.sub });

      // Register per-socket event handlers for each module.
      for (const module of this.modules) {
        module.registerSocket(auth);
      }

      // Initial state is NOT emitted automatically on connect — the client must
      // emit cts:request:initial:state after its listeners are ready. This avoids
      // the race condition where the server emits before the client is listening.
      socket.on(CTS_REQUEST_INITIAL_STATE, () => {
        for (const module of this.modules) {
          module.emitInitialState(auth);
        }
      });

      socket.on("disconnect", () => {
        logger.info("Socket disconnected", { userId: jwtPayload.sub });
      });
    });
  }

  getIo(): SocketServer {
    return this.io;
  }
}
