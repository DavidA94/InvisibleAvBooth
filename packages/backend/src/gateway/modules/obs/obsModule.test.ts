import { CTS_OBS_COMMAND, CTS_OBS_RECONNECT, STC_DEVICE_CAPABILITIES, STC_OBS_ERROR, STC_OBS_ERROR_RESOLVED, STC_OBS_STATE } from "@invisible-av-booth/shared";
import type { Server, Socket } from "socket.io";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eventBus } from "../../../eventBus/eventBus.js";
import type { JwtPayload } from "../../../services/authService.js";
import type { ObsService } from "../../../services/obsService.js";
import { BUS_DEVICE_CAPABILITIES_UPDATED, BUS_OBS_ERROR, BUS_OBS_ERROR_RESOLVED, BUS_OBS_STATE_CHANGED } from "../../../eventBus/types.js";
import type { AuthenticatedSocket } from "../socketModule.js";
import { ObsModule } from "./obsModule.js";
import type { ObsState } from "./types.js";

const idleState: ObsState = {
  connected: true,
  streaming: false,
  recording: false,
  commandedState: { streaming: false, recording: false },
};

const fakeUser: JwtPayload = { sub: "u1", username: "user", role: "ADMIN", iat: 0, exp: 9999999999 };

function makeMockObsService(): ObsService {
  return {
    getState: vi.fn().mockReturnValue(idleState),
    startStream: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    stopStream: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    startRecording: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    stopRecording: vi.fn().mockResolvedValue({ success: true, value: idleState }),
    reconnect: vi.fn().mockResolvedValue({ success: true, value: undefined }),
  } as unknown as ObsService;
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
    event                              | emitEvent
    ${BUS_OBS_STATE_CHANGED}           | ${STC_OBS_STATE}
    ${BUS_OBS_ERROR}                   | ${STC_OBS_ERROR}
    ${BUS_OBS_ERROR_RESOLVED}          | ${STC_OBS_ERROR_RESOLVED}
    ${BUS_DEVICE_CAPABILITIES_UPDATED} | ${STC_DEVICE_CAPABILITIES}
  `("register subscribes to $event and emits a $emitEvent when received with the same payload", ({ event, emitEvent }) => {
    const module: ObsModule = new ObsModule(makeMockObsService());
    const expectedPayload = { myPayload: "value" };
    const payload = event === BUS_OBS_STATE_CHANGED ? { state: expectedPayload } : expectedPayload;

    module.register(ioServerMock);

    eventBus.emit(event, payload);
    expect(ioEmitMock).toHaveBeenCalledOnce();
    expect(ioEmitMock).toHaveBeenLastCalledWith(emitEvent, expectedPayload);
  });
});

describe("registerSocket", () => {
  it.each`
    command             | errorMessage           | successState
    ${"startStream"}    | ${undefined}           | ${"successful"}
    ${"startStream"}    | ${"StartStreamBad"}    | ${"unsuccessful"}
    ${"stopStream"}     | ${undefined}           | ${"successful"}
    ${"stopStream"}     | ${"StopStreamBad"}     | ${"unsuccessful"}
    ${"startRecording"} | ${undefined}           | ${"successful"}
    ${"startRecording"} | ${"startRecordingBad"} | ${"unsuccessful"}
    ${"stopRecording"}  | ${undefined}           | ${"successful"}
    ${"stopRecording"}  | ${"stopRecordingBad"}  | ${"unsuccessful"}
  `("registerSocket calls obsService.$command when $command is received and is $successState", async ({ command, errorMessage }) => {
    const obsService: ObsService = makeMockObsService();
    const module: ObsModule = new ObsModule(obsService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type is too complex to bother with
    let callback: any;
    socketOnMock.mockImplementation((event, func) => {
      if (event === CTS_OBS_COMMAND) {
        callback = func;
      }
    });
    const auth: AuthenticatedSocket = { socket: socketMock, jwtPayload: fakeUser };

    module.registerSocket(auth);
    expect(socketOnMock).toHaveBeenCalledWith(CTS_OBS_COMMAND, expect.anything());

    if (errorMessage) {
      // @ts-expect-error TS doesn't understand that we can reference function calls like this
      obsService[command] = vi.fn().mockResolvedValue({ success: false, error: { message: errorMessage } });
    }

    const ackCallback = vi.fn();
    await callback({ type: command }, ackCallback);
    if (errorMessage) {
      expect(ackCallback).toHaveBeenCalledWith({ success: false, error: errorMessage });
    } else {
      expect(ackCallback).toHaveBeenCalledWith({ success: true, state: idleState });
    }
    // @ts-expect-error TS doesn't understand that we can reference function calls like this
    expect(obsService[command]).toHaveBeenCalledOnce();
  });

  it.each([true, false])(`registerSocket will attempt a reconnect when ${CTS_OBS_RECONNECT} is received with success=%s`, async (success) => {
    const obsService: ObsService = makeMockObsService();
    const module: ObsModule = new ObsModule(obsService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Type is too complex to bother with
    let callback: any;
    socketOnMock.mockImplementation((event, func) => {
      if (event === CTS_OBS_RECONNECT) {
        callback = func;
      }
    });
    const auth: AuthenticatedSocket = { socket: socketMock, jwtPayload: fakeUser };

    module.registerSocket(auth);
    expect(socketOnMock).toHaveBeenCalledWith(CTS_OBS_RECONNECT, expect.anything());

    if (!success) {
      obsService.reconnect = vi.fn().mockResolvedValue({ success: false, error: { message: "failed" } });
    }

    const ackCallback = vi.fn();
    await callback(ackCallback);
    if (success) {
      expect(ackCallback).toHaveBeenCalledWith({ success: true });
    } else {
      expect(ackCallback).toHaveBeenCalledWith({ success: false, error: "failed" });
    }
  });
});

describe("emitInitialState", () => {
  it("correctly sends the OBS state for the initial state", () => {
    const module: ObsModule = new ObsModule(makeMockObsService());
    const auth: AuthenticatedSocket = { socket: socketMock, jwtPayload: fakeUser };

    module.emitInitialState(auth);
    expect(socketEmitMock).toHaveBeenCalledWith(STC_OBS_STATE, idleState);
  });
});
