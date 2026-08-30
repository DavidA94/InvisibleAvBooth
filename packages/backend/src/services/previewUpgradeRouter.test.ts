import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "events";
import { PreviewUpgradeRouter, parseCookieHeader } from "./previewUpgradeRouter.js";
// (PreviewMediaHandler type is satisfied structurally by the mock handlers)

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeAuth(valid: boolean) {
  return {
    verifyToken: vi.fn(() => (valid ? { success: true, value: { sub: "u1", username: "admin", role: "ADMIN" } } : { success: false, error: new Error("bad") })),
  };
}

function makeSocket(): { write: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> } {
  return { write: vi.fn(), destroy: vi.fn() };
}

/** Extract the registered "upgrade" handler from a fake HTTP server. */
function captureUpgradeHandler(): {
  server: EventEmitter;
  invoke: (url: string, cookie?: string) => { socket: ReturnType<typeof makeSocket> };
} {
  const server = new EventEmitter();
  return {
    server,
    invoke(url: string, cookie?: string) {
      const socket = makeSocket();
      const request = { url, headers: cookie ? { cookie } : {} };
      server.emit("upgrade", request, socket, Buffer.alloc(0));
      return { socket };
    },
  };
}

describe("parseCookieHeader", () => {
  it("parses a token cookie", () => {
    expect(parseCookieHeader("token=abc; other=xyz")["token"]).toBe("abc");
  });
  it("ignores malformed pairs", () => {
    expect(parseCookieHeader("bogus")).toEqual({});
  });
});

describe("PreviewUpgradeRouter", () => {
  let video: { handleUpgrade: ReturnType<typeof vi.fn> };
  let audio: { handleUpgrade: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    video = { handleUpgrade: vi.fn() };
    audio = { handleUpgrade: vi.fn() };
  });

  it("ignores non-preview upgrade paths (leaves them for Socket.io)", () => {
    const router = new PreviewUpgradeRouter(makeAuth(true) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    const { socket } = cap.invoke("/socket.io/?EIO=4", "token=ok");
    expect(socket.destroy).not.toHaveBeenCalled();
    expect(video.handleUpgrade).not.toHaveBeenCalled();
    expect(audio.handleUpgrade).not.toHaveBeenCalled();
  });

  it("401s when no token cookie is present", () => {
    const router = new PreviewUpgradeRouter(makeAuth(true) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    const { socket } = cap.invoke("/preview/obs");
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("401"));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("401s when the token is invalid", () => {
    const router = new PreviewUpgradeRouter(makeAuth(false) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    const { socket } = cap.invoke("/preview/obs", "token=bad");
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("401"));
    expect(socket.destroy).toHaveBeenCalled();
  });

  it("dispatches /preview/obs to the video manager with the verified user", () => {
    const router = new PreviewUpgradeRouter(makeAuth(true) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    cap.invoke("/preview/obs", "token=ok");
    expect(video.handleUpgrade).toHaveBeenCalledTimes(1);
    expect(video.handleUpgrade.mock.calls[0]![3]).toEqual({ id: "u1", username: "admin", role: "ADMIN" });
    expect(audio.handleUpgrade).not.toHaveBeenCalled();
  });

  it("dispatches /preview/camera/:id to the video manager", () => {
    const router = new PreviewUpgradeRouter(makeAuth(true) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    cap.invoke("/preview/camera/cam1", "token=ok");
    expect(video.handleUpgrade).toHaveBeenCalledTimes(1);
  });

  it("dispatches /preview/mixer/* to the audio manager", () => {
    const router = new PreviewUpgradeRouter(makeAuth(true) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    cap.invoke("/preview/mixer/mix1/channel/2", "token=ok");
    expect(audio.handleUpgrade).toHaveBeenCalledTimes(1);
    expect(video.handleUpgrade).not.toHaveBeenCalled();
  });

  it("404s an authenticated but unmatched preview path", () => {
    const router = new PreviewUpgradeRouter(makeAuth(true) as never, video as never, audio as never);
    const cap = captureUpgradeHandler();
    router.registerUpgrade(cap.server as never);
    const { socket } = cap.invoke("/preview/bogus/path", "token=ok");
    expect(socket.write).toHaveBeenCalledWith(expect.stringContaining("404"));
    expect(socket.destroy).toHaveBeenCalled();
  });
});
