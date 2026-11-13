// Regression: meter frames and unchanged state broadcasts must NOT re-render
// channel strips. Measured cause of a ~5 s (11 s at 6× CPU throttle) preset
// spinner: every 12 Hz meter frame re-rendered the whole widget and starved the
// main thread. See MixerChannelMeter / ChannelStrip memo.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import "../../test/ionicMocks";
import { render, act, cleanup, screen } from "@testing-library/react";
import { SoundBoardWidget } from "./SoundBoardWidget";
import { useStore } from "../../store";
import type { MixerState } from "@invisible-av-booth/shared";
import { TEST_ID_MIXER_CHANNEL_METER } from "../../constants/testIds";

const faderRenders = vi.hoisted(() => ({ byChannel: new Map<number, number>() }));
vi.mock("./VerticalFader", () => ({
  VerticalFader: ({ channel }: { channel: number }) => {
    faderRenders.byChannel.set(channel, (faderRenders.byChannel.get(channel) ?? 0) + 1);
    return <div />;
  },
}));
vi.mock("../../providers/SocketProvider", () => ({ useSocket: () => ({ emit: vi.fn(), on: vi.fn(), off: vi.fn() }) }));
vi.mock("../../hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u", username: "u", role: "AvPowerUser" }, isRole: () => true }) }));
vi.mock("../../hooks/useResizeObserver", () => ({ useResizeObserver: () => 2000 }));

function makeState(fader1 = 0.5): MixerState {
  return {
    mixerId: "mix1",
    connected: true,
    model: "behringer-xair",
    channelCount: 4,
    capabilities: { features: ["channel-metering"], gainRange: { minDb: -12, maxDb: 60 } },
    channels: [1, 2, 3, 4].map((c) => ({ channel: c, name: `Ch ${c}`, fader: c === 1 ? fader1 : 0.5, faderDb: -10, muted: false, gainDb: 0 })),
    presets: [],
  };
}

const total = (): number => [...faderRenders.byChannel.values()].reduce((a, b) => a + b, 0);

describe("SoundBoardWidget render scoping", () => {
  beforeEach(() => {
    faderRenders.byChannel.clear();
    useStore.setState({
      mixerStates: { mix1: makeState() },
      mixerLevels: {},
      mixerPostLevels: {},
      pendingPresetIds: [],
      presetPendingSince: {},
      notifications: [],
    });
  });
  afterEach(() => cleanup());

  it("meter frames update the meters without re-rendering any channel strip", () => {
    render(<SoundBoardWidget />);
    const before = total();
    act(() => {
      for (let i = 0; i < 10; i++)
        useStore.getState().setMixerLevels(
          "mix1",
          [1, 2, 3, 4].map((c) => ({ channel: c, levelDb: -30 + i, postFaderDb: -30 + i })),
        );
    });
    expect(total()).toBe(before);
    // ...but the meter itself did update.
    expect(screen.getByTestId(`${TEST_ID_MIXER_CHANNEL_METER}-1`)).toHaveAttribute("data-status", "active");
  });

  it("an unchanged full-state broadcast (new objects, same values) re-renders no strips", () => {
    render(<SoundBoardWidget />);
    const before = total();
    act(() => useStore.getState().setMixerState("mix1", makeState()));
    expect(total()).toBe(before);
  });

  it("a broadcast that changes one channel re-renders only that channel's strip", () => {
    render(<SoundBoardWidget />);
    const before = new Map(faderRenders.byChannel);
    act(() => useStore.getState().setMixerState("mix1", makeState(0.9)));
    expect(faderRenders.byChannel.get(1)).toBe((before.get(1) ?? 0) + 1);
    for (const c of [2, 3, 4]) expect(faderRenders.byChannel.get(c)).toBe(before.get(c));
  });
});
