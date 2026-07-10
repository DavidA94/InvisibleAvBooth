import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerConnectionSocketHandlers } from "./connectionSocketModule";
import { useStore } from "../../store";
import { CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";

vi.mock("../../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

function makeFakeSocket() {
  const handlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      handlers[event] = handler;
    }),
    emit: vi.fn(),
    _trigger: (event: string, ...args: unknown[]) => handlers[event]?.(...args),
  };
}

describe("connectionSocketModule", () => {
  beforeEach(() => {
    useStore.setState({ notifications: [] });
  });

  it("adds network-loss notification on disconnect", () => {
    const socket = makeFakeSocket();
    registerConnectionSocketHandlers(socket as never);
    socket._trigger("disconnect", "transport close");
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]?.id).toBe("network-loss");
  });

  it("removes network-loss notification and requests initial state on connect", () => {
    useStore.setState({ notifications: [{ id: "network-loss", level: "banner", severity: "warning", message: "Connection lost" }] });
    const socket = makeFakeSocket();
    registerConnectionSocketHandlers(socket as never);
    socket._trigger("connect");
    expect(useStore.getState().notifications).toHaveLength(0);
    expect(socket.emit).toHaveBeenCalledWith(CTS_REQUEST_INITIAL_STATE);
  });
});
