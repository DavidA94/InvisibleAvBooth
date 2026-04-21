import { CTS_SESSION_MANIFEST_UPDATE, STC_SESSION_MANIFEST_UPDATED } from "@invisible-av-booth/shared";
import type { Server, Socket } from "socket.io";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../../eventBus/eventBus.js";
import type { JwtPayload } from "../../../services/authService.js";
import type { SessionManifest, SessionManifestService } from "../../../services/sessionManifestService.js";
import { BUS_SESSION_MANIFEST_UPDATED } from "../../../eventBus/types.js";
import { SessionManifestModule } from "../sessionManifest/sessionManifestModule.js";
import type { AuthenticatedSocket } from "../socketModule.js";

const fakeUser: JwtPayload = { sub: "u1", username: "user", role: "ADMIN", iat: 0, exp: 9999999999 };

function makeMockManifestService(): SessionManifestService {
  return {
    get: vi.fn().mockReturnValue({ speaker: "John" }),
    update: vi.fn().mockReturnValue({ success: true, value: { speaker: "John" } }),
    getTemplate: vi.fn().mockReturnValue("{Date} – {Speaker} – {Title}"),
  } as unknown as SessionManifestService;
}

const ioEmitMock = vi.fn();
const ioOnMock = vi.fn();
const ioServerMock = {
  emit: ioEmitMock,
  on: ioOnMock,
} as unknown as Server;

const socketEmitMock = vi.fn();
const socketOnMock = vi.fn();
const socketMock = {
  emit: socketEmitMock,
  on: socketOnMock,
} as unknown as Socket;

beforeEach(() => {
  vi.resetAllMocks();
  eventBus.removeAllListeners();
});

describe("register", () => {
  it.each`
    event                           | emitEvent
    ${BUS_SESSION_MANIFEST_UPDATED} | ${STC_SESSION_MANIFEST_UPDATED}
  `("register subscribes to $event and emits a $emitEvent when received with the same payload", ({ event, emitEvent }) => {
    const module: SessionManifestModule = new SessionManifestModule(makeMockManifestService());
    const payload = { myPayload: "value" };

    module.register(ioServerMock);

    eventBus.emit(event, payload);
    expect(ioEmitMock).toHaveBeenCalledOnce();
    expect(ioEmitMock).toHaveBeenCalledWith(emitEvent, payload);
  });
});

describe("registerSocket", () => {
  it.each([true, false])(`${CTS_SESSION_MANIFEST_UPDATE} correctly updates the manifest with success=%s`, (success: boolean) => {
    const service: SessionManifestService = makeMockManifestService();
    const module: SessionManifestModule = new SessionManifestModule(service);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type complex enough to not bother with
    let callback: any;
    socketOnMock.mockImplementation((_, func) => (callback = func));
    const auth: AuthenticatedSocket = { socket: socketMock, jwtPayload: fakeUser };

    module.registerSocket(auth);
    expect(socketOnMock).toHaveBeenCalledWith(CTS_SESSION_MANIFEST_UPDATE, expect.anything());

    if (!success) {
      service.update = vi.fn().mockReturnValue({ success: false });
    }

    const ackCallback = vi.fn();
    callback({ speaker: "Pastor John" } as Partial<SessionManifest>, ackCallback);
    expect(service.update).toHaveBeenCalledWith({ speaker: "Pastor John" }, fakeUser);

    if (success) {
      expect(ackCallback).toHaveBeenCalledWith({ success: true });
    } else {
      expect(ackCallback).toHaveBeenCalledWith({ success: false, error: "Update failed" });
    }
  });
});

describe("emitInitialState", () => {
  it("correctly sends the OBS state for the initial state", () => {
    const module: SessionManifestModule = new SessionManifestModule(makeMockManifestService());
    const auth: AuthenticatedSocket = { socket: socketMock, jwtPayload: fakeUser };

    module.emitInitialState(auth);
    expect(socketEmitMock).toHaveBeenCalledWith(STC_SESSION_MANIFEST_UPDATED, {
      manifest: { speaker: "John" },
      interpolatedStreamTitle: expect.any(String),
    });
  });
});
