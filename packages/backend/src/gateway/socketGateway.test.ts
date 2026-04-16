// SocketGateway unit tests cover only gateway-level responsibilities:
//   1. JWT authentication (reject / accept connections)
//   2. Delegation — each module's register/registerSocket/emitInitialState is called
//
// Command routing, EventBus forwarding, and per-socket event handling are
// tested in obsModule.test.ts and sessionManifestModule.test.ts.

import { describe, it, expect, vi, afterEach } from "vitest";
import { createServer } from "http";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import Database from "better-sqlite3";
import { applySchema } from "../database/schema.js";
import { AuthService } from "../services/authService.js";
import { SocketGateway } from "./socketGateway.js";
import type { SocketModule, AuthenticatedSocket } from "./modules/socketModule.js";

const seedActor = { sub: "seed", username: "seed", role: "ADMIN" as const, iat: 0, exp: 9999999999 };

function makeMockModule(): SocketModule & { registerCalls: AuthenticatedSocket[] } {
  const registerCalls: AuthenticatedSocket[] = [];
  return {
    registerCalls,
    register: vi.fn(),
    registerSocket: vi.fn().mockImplementation((auth: AuthenticatedSocket) => registerCalls.push(auth)),
    emitInitialState: vi.fn(),
  };
}

async function buildGateway(modules: SocketModule[]) {
  const database = new Database(":memory:");
  applySchema(database);
  const authService = new AuthService(database);
  await authService.createUser({ username: "admin", password: "pass", role: "ADMIN" }, seedActor);
  const loginResult = await authService.login("admin", "pass");
  const token = loginResult.success ? loginResult.value.token : "";

  const httpServer = createServer();
  new SocketGateway(httpServer, authService, modules);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  return { httpServer, token, port };
}

function connectClient(port: number, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${port}`, { auth: { token } });
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.forEach((fn) => fn());
  cleanups.length = 0;
  vi.restoreAllMocks();
});

describe("SocketGateway — JWT validation", () => {
  it("rejects connection without token", async () => {
    const { httpServer, port } = await buildGateway([]);
    cleanups.push(() => httpServer.close());

    await new Promise<void>((resolve) => {
      const client = ioClient(`http://localhost:${port}`);
      client.on("connect_error", () => {
        client.close();
        resolve();
      });
    });
  });

  it("rejects connection with invalid token", async () => {
    const { httpServer, port } = await buildGateway([]);
    cleanups.push(() => httpServer.close());

    await new Promise<void>((resolve) => {
      const client = ioClient(`http://localhost:${port}`, { auth: { token: "bad.token" } });
      client.on("connect_error", () => {
        client.close();
        resolve();
      });
    });
  });

  it("accepts connection with valid token", async () => {
    const { httpServer, token, port } = await buildGateway([]);
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());
    expect(client.connected).toBe(true);
  });
});

describe("SocketGateway — module delegation", () => {
  it("calls register on each module at startup", async () => {
    const moduleA = makeMockModule();
    const moduleB = makeMockModule();
    const { httpServer } = await buildGateway([moduleA, moduleB]);
    cleanups.push(() => httpServer.close());

    expect(moduleA.register).toHaveBeenCalledOnce();
    expect(moduleB.register).toHaveBeenCalledOnce();
    expect((moduleA.register as ReturnType<typeof vi.fn>).mock.calls[0]![0]).toBeDefined(); // io passed
  });

  it("calls registerSocket and emitInitialState on each module per connection", async () => {
    const moduleA = makeMockModule();
    const moduleB = makeMockModule();
    const { httpServer, token, port } = await buildGateway([moduleA, moduleB]);
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    // Give the server a tick to process the connection handlers
    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(moduleA.registerSocket).toHaveBeenCalledOnce();
    expect(moduleA.emitInitialState).toHaveBeenCalledOnce();
    expect(moduleB.registerSocket).toHaveBeenCalledOnce();
    expect(moduleB.emitInitialState).toHaveBeenCalledOnce();
  });

  it("passes an AuthenticatedSocket with jwtPayload to modules", async () => {
    const module = makeMockModule();
    const { httpServer, token, port } = await buildGateway([module]);
    cleanups.push(() => httpServer.close());
    const client = await connectClient(port, token);
    cleanups.push(() => client.close());

    await new Promise<void>((resolve) => setTimeout(resolve, 20));

    expect(module.registerCalls[0]!.jwtPayload.username).toBe("admin");
  });
});
