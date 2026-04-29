import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePlatformState } from "./usePlatformState";
import { useStore } from "../store";
import { INITIAL_RELAY_STATE } from "../store/platformSlice";
import { CTS_PLATFORM_COMMAND } from "@invisible-av-booth/shared";

const mockEmit = vi.fn();

vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

beforeEach(() => {
  useStore.setState({
    platformStates: new Map(),
    relayState: INITIAL_RELAY_STATE,
    platformReadiness: false,
  });
  vi.clearAllMocks();
});

describe("usePlatformState", () => {
  it("returns initial state with all derived booleans false", () => {
    const { result } = renderHook(() => usePlatformState());
    expect(result.current.platformStates.size).toBe(0);
    expect(result.current.relayState).toEqual(INITIAL_RELAY_STATE);
    expect(result.current.platformReadiness).toBe(false);
    expect(result.current.isAnyStarting).toBe(false);
    expect(result.current.isAnyStopping).toBe(false);
    expect(result.current.isAnyStreaming).toBe(false);
  });

  it("isAnyStarting is true when at least one platform is starting", () => {
    const states = new Map([
      ["youtube", { state: "starting" as const }],
      ["facebook", { state: "idle" as const }],
    ]);
    useStore.setState({ platformStates: states });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.isAnyStarting).toBe(true);
    expect(result.current.isAnyStopping).toBe(false);
    expect(result.current.isAnyStreaming).toBe(false);
  });

  it("isAnyStopping is true when at least one platform is stopping", () => {
    const states = new Map([
      ["youtube", { state: "streaming" as const }],
      ["facebook", { state: "stopping" as const }],
    ]);
    useStore.setState({ platformStates: states });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.isAnyStopping).toBe(true);
    expect(result.current.isAnyStarting).toBe(false);
  });

  it("isAnyStreaming is true when at least one platform is streaming", () => {
    const states = new Map([["youtube", { state: "streaming" as const }]]);
    useStore.setState({ platformStates: states });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.isAnyStreaming).toBe(true);
  });

  it("all derived booleans can be true simultaneously", () => {
    const states = new Map([
      ["youtube", { state: "starting" as const }],
      ["facebook", { state: "stopping" as const }],
      ["twitch", { state: "streaming" as const }],
    ]);
    useStore.setState({ platformStates: states });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.isAnyStarting).toBe(true);
    expect(result.current.isAnyStopping).toBe(true);
    expect(result.current.isAnyStreaming).toBe(true);
  });

  it("derived booleans are false for non-matching states", () => {
    const states = new Map([
      ["youtube", { state: "error" as const }],
      ["facebook", { state: "no_source" as const }],
      ["twitch", { state: "recovering" as const }],
    ]);
    useStore.setState({ platformStates: states });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.isAnyStarting).toBe(false);
    expect(result.current.isAnyStopping).toBe(false);
    expect(result.current.isAnyStreaming).toBe(false);
  });

  it("sendCommand emits CTS_PLATFORM_COMMAND with the command payload", () => {
    const { result } = renderHook(() => usePlatformState());
    const command = { action: "startAll" as const };

    result.current.sendCommand(command);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith(CTS_PLATFORM_COMMAND, command);
  });

  it("sendCommand includes optional fields when provided", () => {
    const { result } = renderHook(() => usePlatformState());
    const command = { action: "startPlatform" as const, platformType: "youtube", privacyOverride: "public" };

    result.current.sendCommand(command);

    expect(mockEmit).toHaveBeenCalledWith(CTS_PLATFORM_COMMAND, command);
  });

  it("reflects platformReadiness from store", () => {
    useStore.setState({ platformReadiness: true });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.platformReadiness).toBe(true);
  });

  it("reflects relayState from store", () => {
    useStore.setState({ relayState: { running: true, obsConnected: true } });

    const { result } = renderHook(() => usePlatformState());
    expect(result.current.relayState).toEqual({ running: true, obsConnected: true });
  });
});
