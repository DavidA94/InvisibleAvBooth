import { describe, it, expect, vi } from "vitest";
import { STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";
import { registerPlatformSocketHandlers } from "./platformSocketModule";

describe("registerPlatformSocketHandlers", () => {
  it("registers listeners for all four platform events", () => {
    const onMock = vi.fn();
    registerPlatformSocketHandlers({ on: onMock } as never);

    const events = onMock.mock.calls.map((c) => c[0]);
    expect(events).toContain(STC_PLATFORM_STATE);
    expect(events).toContain(STC_PLATFORM_HEALTH);
    expect(events).toContain(STC_RELAY_STATE);
    expect(events).toContain(STC_PLATFORM_READINESS);
    expect(onMock).toHaveBeenCalledTimes(4);
  });
});
