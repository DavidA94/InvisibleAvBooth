import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LowerThirdModule } from "./lowerThirdModule.js";
import { eventBus } from "../../../eventBus/eventBus.js";
import { BUS_LOWER_THIRD_STATE_CHANGED } from "../../../eventBus/types.js";
import { CTS_LOWER_THIRD_COMMAND, STC_LOWER_THIRD_STATE } from "@invisible-av-booth/shared";
import type { LowerThirdState } from "@invisible-av-booth/shared";

const mockService = {
  activate: vi.fn((): { success: boolean; value?: undefined; error?: string } => ({ success: true, value: undefined })),
  dismissActive: vi.fn((): { success: boolean; value?: undefined; error?: string } => ({ success: true, value: undefined })),
  forceClear: vi.fn(),
  addToLibrary: vi.fn(() => ({ success: true, value: { id: "new" } })),
  removeFromLibrary: vi.fn(() => ({ success: true, value: undefined })),
  editLibraryItem: vi.fn(() => ({ success: true, value: { id: "edited" } })),
  pageNext: vi.fn(() => ({ success: true, value: undefined })),
  pagePrevious: vi.fn(() => ({ success: true, value: undefined })),
  getFullState: vi.fn(() => ({
    active: null,
    library: [],
    phase: "hidden",
    autoDismissAt: null,
    overlayConnected: false,
    overlayResolutionCorrect: false,
    transitionLocked: false,
    overlayStale: false,
  })),
};

let module: LowerThirdModule;

beforeEach(() => {
  module = new LowerThirdModule(mockService as never);
  vi.clearAllMocks();
});

afterEach(() => {
  eventBus.removeAllListeners();
});

describe("LowerThirdModule", () => {
  describe("register", () => {
    it("subscribes to BUS_LOWER_THIRD_STATE_CHANGED and emits STC_LOWER_THIRD_STATE", () => {
      const io = { emit: vi.fn() };
      module.register(io as never);

      const state: LowerThirdState = {
        active: null,
        library: [],
        phase: "hidden",
        autoDismissAt: null,
        overlayConnected: false,
        overlayResolutionCorrect: false,
        transitionLocked: false,
        overlayStale: false,
      };
      eventBus.emit(BUS_LOWER_THIRD_STATE_CHANGED, state);

      expect(io.emit).toHaveBeenCalledWith(STC_LOWER_THIRD_STATE, state);
    });
  });

  describe("registerSocket", () => {
    it("handles activate command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);

      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "activate", itemId: "item1" }, ack);

      expect(mockService.activate).toHaveBeenCalledWith("item1", undefined);
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("handles force-clear command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);

      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "force-clear" }, ack);

      expect(mockService.forceClear).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("handles dismiss-active command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "dismiss-active" }, ack);
      expect(mockService.dismissActive).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("handles add-to-library command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "add-to-library", input: { type: "Title", content: { title: "X" } } }, ack);
      expect(mockService.addToLibrary).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ success: true, itemId: "new" });
    });

    it("handles remove-from-library command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "remove-from-library", itemId: "x" }, ack);
      expect(mockService.removeFromLibrary).toHaveBeenCalledWith("x");
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("handles edit-library-item command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "edit-library-item", itemId: "x", patch: { content: { title: "Y" } } }, ack);
      expect(mockService.editLibraryItem).toHaveBeenCalledWith("x", { content: { title: "Y" } });
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("handles page-next command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "page-next" }, ack);
      expect(mockService.pageNext).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("handles page-previous command", () => {
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "page-previous" }, ack);
      expect(mockService.pagePrevious).toHaveBeenCalled();
      expect(ack).toHaveBeenCalledWith({ success: true });
    });

    it("returns error on failed command", () => {
      mockService.activate.mockReturnValueOnce({ success: false, error: "Transition in progress" });
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);

      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "activate", itemId: "x" }, ack);

      expect(ack).toHaveBeenCalledWith({ success: false, error: "Transition in progress" });
    });

    it("returns error on failed dismiss", () => {
      mockService.dismissActive.mockReturnValueOnce({ success: false, error: "Nothing active" });
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "dismiss-active" }, ack);
      expect(ack).toHaveBeenCalledWith({ success: false, error: "Nothing active" });
    });

    it("returns error on failed add-to-library", () => {
      mockService.addToLibrary.mockReturnValueOnce({ success: false, error: "Scripture not found" } as never);
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "add-to-library", input: { type: "Title", content: { title: "X" } } }, ack);
      expect(ack).toHaveBeenCalledWith({ success: false, error: "Scripture not found" });
    });

    it("returns error on failed page-next", () => {
      mockService.pageNext.mockReturnValueOnce({ success: false, error: "Already on last page" } as never);
      const socket = { on: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.registerSocket(auth as never);
      const handler = socket.on.mock.calls.find((c) => c[0] === CTS_LOWER_THIRD_COMMAND)?.[1] as (cmd: unknown, ack: (r: unknown) => void) => void;
      const ack = vi.fn();
      handler({ type: "page-next" }, ack);
      expect(ack).toHaveBeenCalledWith({ success: false, error: "Already on last page" });
    });
  });

  describe("emitInitialState", () => {
    it("emits full state to the socket", () => {
      const socket = { emit: vi.fn() };
      const auth = { socket, jwtPayload: { sub: "u1", username: "admin", role: "ADMIN", iat: 0, exp: 9999999999 } };
      module.emitInitialState(auth as never);

      expect(socket.emit).toHaveBeenCalledWith(STC_LOWER_THIRD_STATE, expect.objectContaining({ phase: "hidden" }));
    });
  });
});
