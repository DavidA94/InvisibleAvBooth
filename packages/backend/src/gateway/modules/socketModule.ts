import type { Socket, Server } from "socket.io";
import type { JwtPayload } from "../../services/authService.js";

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
//   1. register(io)           — called once at gateway startup; subscribe to EventBus
//                               events and set up io-level broadcasts (stc: events)
//   2. registerSocket(auth)   — called per authenticated connection; set up per-socket
//                               cts: event handlers
//   3. emitInitialState(auth) — called when the client emits cts:request:initial:state;
//                               push current state to the requesting client
//
// Initial state is NOT emitted automatically on connect. The client must explicitly
// request it after setting up its listeners. This eliminates the race condition where
// the server emits before the client is listening.
export interface SocketModule {
  register(io: Server): void;
  registerSocket(auth: AuthenticatedSocket): void;
  emitInitialState(auth: AuthenticatedSocket): void;
}
