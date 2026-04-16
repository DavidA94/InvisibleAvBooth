import type { Socket, Server } from "socket.io";
import type { JwtPayload } from "../services/authService.js";

// A socket that has already passed JWT validation in SocketGateway.
// Modules receive this type — they never need to check auth themselves.
export interface AuthenticatedSocket {
  readonly socket: Socket;
  readonly jwtPayload: JwtPayload;
}

// Every socket module implements this interface.
// SocketGateway calls each method at the appropriate lifecycle point.
//
// Lifecycle:
//   1. register(io)         — called once at gateway startup; subscribe to EventBus
//                             events and set up io-level broadcasts (stc: events)
//   2. registerSocket(auth) — called per authenticated connection; set up per-socket
//                             cts: event handlers
//   3. emitInitialState(auth) — called per authenticated connection after registerSocket;
//                               push current state to the newly connected client
//
// Order of emitInitialState calls across modules is not guaranteed and should not matter.
// If ordering ever becomes significant, document it explicitly in the module.
export interface SocketModule {
  register(io: Server): void;
  registerSocket(auth: AuthenticatedSocket): void;
  emitInitialState(auth: AuthenticatedSocket): void;
}
