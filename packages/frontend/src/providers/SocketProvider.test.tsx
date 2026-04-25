import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { SocketProvider } from "./SocketProvider";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED, STC_SESSION_MANIFEST_UPDATED, CTS_REQUEST_INITIAL_STATE } from "@invisible-av-booth/shared";
import type { ObsState, Notification } from "../types";

// ── Mock socket.io-client ─────────────────────────────────────────────────────

type EventHandler = (...args: unknown[]) => void;

const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
};

const mockIo = vi.fn(() => mockSocket);

vi.mock("../api/client", () => ({
  getAuthToken: () => "mock-token",
  apiUrl: (path: string) => path,
}));
vi.mock("socket.io-client", () => ({
  io: () => mockIo(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function getHandler(event: string): EventHandler | undefined {
  const call = mockSocket.on.mock.calls.find(([e]: [string]) => e === event);
  return call?.[1] as EventHandler | undefined;
}

function resetStore(): void {
  useStore.setState({
    user: null,
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  mockSocket.connected = false;
});

afterEach(() => {
  resetStore();
});

describe("SocketProvider", () => {
  it("does not connect when user is null", () => {
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );
    expect(mockIo).not.toHaveBeenCalled();
  });

  it("connects when user is set", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );
    expect(mockIo).toHaveBeenCalledOnce();
  });

  it("disconnects when user is cleared", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    const { rerender } = render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    act(() => {
      useStore.getState().clearUser();
    });
    rerender(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it("stc:obs:state event updates obsSlice", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    const handler = getHandler(STC_OBS_STATE);
    expect(handler).toBeDefined();

    const newState: ObsState = {
      connected: true,
      streaming: true,
      recording: false,
      commandedState: { streaming: true, recording: false },
    };
    act(() => handler!(newState));

    expect(useStore.getState().obsState).toEqual(newState);
  });

  it("stc:session:manifest:updated event updates sessionManifestSlice", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    const handler = getHandler(STC_SESSION_MANIFEST_UPDATED);
    expect(handler).toBeDefined();

    act(() =>
      handler!({
        manifest: { speaker: "John" },
        interpolatedStreamTitle: "Apr 18 – John",
      }),
    );

    expect(useStore.getState().manifest).toEqual({ speaker: "John" });
    expect(useStore.getState().interpolatedStreamTitle).toBe("Apr 18 – John");
  });

  it("notification event adds to notificationSlice", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    const handler = getHandler("notification");
    expect(handler).toBeDefined();

    const notification: Notification = {
      id: "n1",
      level: "toast",
      severity: "info",
      message: "Test",
    };
    act(() => handler!(notification));

    expect(useStore.getState().notifications).toHaveLength(1);
    expect(useStore.getState().notifications[0]?.id).toBe("n1");
  });

  it("stc:obs:error:resolved event removes notification", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    useStore.getState().addNotification({
      id: "OBS_UNREACHABLE",
      level: "modal",
      severity: "error",
      message: "OBS disconnected",
      errorCode: "OBS_UNREACHABLE",
    });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    const handler = getHandler(STC_OBS_ERROR_RESOLVED);
    expect(handler).toBeDefined();

    act(() => handler!({ errorCode: "OBS_UNREACHABLE" }));

    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("disconnect event adds network loss banner", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    const handler = getHandler("disconnect");
    expect(handler).toBeDefined();

    act(() => handler!());

    const banner = useStore.getState().notifications.find((n) => n.id === "network-loss");
    expect(banner).toBeDefined();
    expect(banner?.level).toBe("banner");
    expect(banner?.severity).toBe("warning");
  });

  it("connect event removes network loss banner and requests initial state", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    useStore.getState().addNotification({
      id: "network-loss",
      level: "banner",
      severity: "warning",
      message: "Connection lost — reconnecting…",
    });
    render(
      <SocketProvider>
        <div />
      </SocketProvider>,
    );

    const handler = getHandler("connect");
    expect(handler).toBeDefined();

    act(() => handler!());

    expect(useStore.getState().notifications.find((n) => n.id === "network-loss")).toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(CTS_REQUEST_INITIAL_STATE);
  });
});
