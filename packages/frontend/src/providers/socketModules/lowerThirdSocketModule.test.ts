import { describe, it, expect, beforeEach } from "vitest";
import { STC_LOWER_THIRD_STATE } from "@invisible-av-booth/shared";
import type { LowerThirdState } from "@invisible-av-booth/shared";
import { registerLowerThirdSocketHandlers } from "./lowerThirdSocketModule";
import { useStore } from "../../store";
import { INITIAL_LOWER_THIRD_STATE } from "../../store/lowerThirdSlice";

function makeFakeSocket(): {
  handlers: Record<string, (payload: unknown) => void>;
  on: (event: string, handler: (payload: unknown) => void) => void;
} {
  const handlers: Record<string, (payload: unknown) => void> = {};
  return {
    handlers,
    on: (event, handler) => {
      handlers[event] = handler;
    },
  };
}

function baseState(overrides: Partial<LowerThirdState> = {}): LowerThirdState {
  return { ...INITIAL_LOWER_THIRD_STATE, ...overrides };
}

beforeEach(() => {
  useStore.setState({ lowerThirdState: INITIAL_LOWER_THIRD_STATE, notifications: [] });
});

describe("registerLowerThirdSocketHandlers", () => {
  it("registers a handler for STC_LOWER_THIRD_STATE", () => {
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    expect(fake.handlers[STC_LOWER_THIRD_STATE]).toBeDefined();
  });

  it("updates lowerThirdState in the store", () => {
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    const newState = baseState({ overlayConnected: true, overlayResolutionCorrect: true });
    fake.handlers[STC_LOWER_THIRD_STATE]!(newState);
    expect(useStore.getState().lowerThirdState).toEqual(newState);
  });

  it("adds resolution mismatch banner when overlay connects with wrong resolution", () => {
    // Previous state: overlayResolutionCorrect was not false (initial undefined-like via true)
    useStore.setState({ lowerThirdState: baseState({ overlayConnected: false, overlayResolutionCorrect: true }) });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(
      baseState({ overlayConnected: true, overlayResolutionCorrect: false, overlayResolution: { width: 1280, height: 720 } }),
    );
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.id).toBe("lt-resolution-mismatch");
    expect(notifications[0]!.severity).toBe("warning");
    expect(notifications[0]!.message).toContain("1280×720");
  });

  it("waits for the overlay's size report before showing the banner", () => {
    useStore.setState({ lowerThirdState: baseState({ overlayConnected: false, overlayResolutionCorrect: true }) });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(baseState({ overlayConnected: true, overlayResolutionCorrect: false, overlayResolution: null }));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("replaces the banner (one, not two) when a wrong size changes to another wrong size", () => {
    useStore.setState({ lowerThirdState: baseState({ overlayConnected: false, overlayResolutionCorrect: true }) });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(
      baseState({ overlayConnected: true, overlayResolutionCorrect: false, overlayResolution: { width: 1280, height: 720 } }),
    );
    fake.handlers[STC_LOWER_THIRD_STATE]!(
      baseState({ overlayConnected: true, overlayResolutionCorrect: false, overlayResolution: { width: 1600, height: 900 } }),
    );
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.message).toContain("1600×900");
  });

  it("does not re-add the banner when the same wrong size is re-sent", () => {
    useStore.setState({ lowerThirdState: baseState({ overlayConnected: false, overlayResolutionCorrect: true }) });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    const wrong = baseState({ overlayConnected: true, overlayResolutionCorrect: false, overlayResolution: { width: 1280, height: 720 } });
    fake.handlers[STC_LOWER_THIRD_STATE]!(wrong);
    useStore.getState().removeNotification("lt-resolution-mismatch"); // volunteer dismissed it
    fake.handlers[STC_LOWER_THIRD_STATE]!({ ...wrong, phase: "visible" });
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("clears resolution mismatch banner when resolution becomes correct", () => {
    useStore.setState({
      lowerThirdState: baseState({ overlayConnected: true, overlayResolutionCorrect: false }),
      notifications: [{ id: "lt-resolution-mismatch", level: "banner", severity: "warning", message: "test" }],
    });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(baseState({ overlayConnected: true, overlayResolutionCorrect: true }));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("clears resolution mismatch banner when overlay disconnects", () => {
    useStore.setState({
      lowerThirdState: baseState({ overlayConnected: true, overlayResolutionCorrect: false }),
      notifications: [{ id: "lt-resolution-mismatch", level: "banner", severity: "warning", message: "test" }],
    });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(baseState({ overlayConnected: false, overlayResolutionCorrect: false }));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("adds stale overlay banner when overlayStale becomes true", () => {
    useStore.setState({ lowerThirdState: baseState({ overlayStale: false }) });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(baseState({ overlayStale: true }));
    const notifications = useStore.getState().notifications;
    expect(notifications).toHaveLength(1);
    expect(notifications[0]!.id).toBe("lt-overlay-stale");
  });

  it("clears stale overlay banner when overlayStale becomes false", () => {
    useStore.setState({
      lowerThirdState: baseState({ overlayStale: true }),
      notifications: [{ id: "lt-overlay-stale", level: "banner", severity: "warning", message: "test" }],
    });
    const fake = makeFakeSocket();
    registerLowerThirdSocketHandlers(fake as never);
    fake.handlers[STC_LOWER_THIRD_STATE]!(baseState({ overlayStale: false }));
    expect(useStore.getState().notifications).toHaveLength(0);
  });
});
