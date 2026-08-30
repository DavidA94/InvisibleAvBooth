import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../test/ionicMocks";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SoundBoardWidget, deriveControlsStatus } from "./SoundBoardWidget";
import { useStore } from "../../store";
import type { MixerState } from "@invisible-av-booth/shared";
import {
  TEST_ID_SOUNDBOARD_WIDGET,
  TEST_ID_SOUNDBOARD_STRIP_ROW,
  TEST_ID_SOUNDBOARD_EMPTY_PLACEHOLDER,
  TEST_ID_WIDGET_ERROR_OVERLAY,
  TEST_ID_CONNECTION_INDICATORS,
  TEST_ID_MIXER_PRESET_BUTTON,
  TEST_ID_MIXER_ADJUST_GAIN_BUTTON,
  TEST_ID_MIXER_GAIN_MODAL,
  TEST_ID_MIXER_PAGINATION,
  TEST_ID_MIXER_PAGINATION_PREV,
  TEST_ID_MIXER_PAGINATION_NEXT,
} from "../../constants/testIds";

// react-select → native select in jsdom.
vi.mock("react-select", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ options, onChange, value }: any) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        data-testid="soundboard-mixer-select"
        value={value?.value ?? ""}
        onChange={(e: { target: { value: string } }) => {
          const opt = opts.find((o) => o.value === e.target.value);
          if (opt) onChange(opt);
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

// useSocket returns a fake socket so emits don't throw. Uses vi.hoisted so the
// hoisted mock factory can reference the mutable emit spy.
const mockEmit = vi.hoisted(() => vi.fn());
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

// ResizeObserver isn't in jsdom — stub the hook to a fixed width (fits all channels here).
vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 600,
}));

function makeMixer(overrides: Partial<MixerState> = {}): MixerState {
  return {
    mixerId: "mix1",
    connected: true,
    model: "behringer-xair",
    channelCount: 2,
    capabilities: { features: ["channel-metering"], gainRange: { minDb: -12, maxDb: 60 } },
    channels: [
      { channel: 1, name: "Ch 1", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 },
      { channel: 2, name: "Ch 2", fader: 0.75, faderDb: 0, muted: true, gainDb: 12 },
    ],
    presets: [],
    ...overrides,
  };
}

describe("deriveControlsStatus", () => {
  it("is unhealthy when the mixer is offline", () => {
    expect(deriveControlsStatus(false, true)).toBe("unhealthy");
  });
  it("is healthy when connected and state is fresh", () => {
    expect(deriveControlsStatus(true, true)).toBe("healthy");
  });
  it("is unhealthy when connected but stale", () => {
    expect(deriveControlsStatus(true, false)).toBe("unhealthy");
  });
});

describe("SoundBoardWidget", () => {
  beforeEach(() => {
    useStore.setState({ mixerStates: {}, mixerLevels: {}, notifications: [] });
  });

  it("renders channel strips for a connected mixer with fresh state (green Controls)", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer() } });
    render(<SoundBoardWidget />);
    expect(screen.getByTestId(TEST_ID_SOUNDBOARD_WIDGET)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_SOUNDBOARD_STRIP_ROW)).toBeInTheDocument();
    // Controls indicator shows healthy on fresh state.
    const indicators = screen.getByTestId(TEST_ID_CONNECTION_INDICATORS);
    expect(indicators.querySelector('[data-status="healthy"]')).not.toBeNull();
  });

  it("shows the offline scrim when the mixer is disconnected", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer({ connected: false }) } });
    render(<SoundBoardWidget />);
    const overlay = screen.getByTestId(TEST_ID_WIDGET_ERROR_OVERLAY);
    expect(overlay).toBeInTheDocument();
    // Controls indicator shows unhealthy when offline.
    const indicators = screen.getByTestId(TEST_ID_CONNECTION_INDICATORS);
    expect(indicators.querySelector('[data-status="unhealthy"]')).not.toBeNull();
  });

  it("renders an empty placeholder when there are zero channels", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer({ channelCount: 0, channels: [] }) } });
    render(<SoundBoardWidget />);
    expect(screen.getByTestId(TEST_ID_SOUNDBOARD_EMPTY_PLACEHOLDER)).toBeInTheDocument();
  });

  it("hides the mixer dropdown when there is only one mixer", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer() } });
    render(<SoundBoardWidget />);
    expect(screen.queryByTestId("soundboard-mixer-select")).toBeNull();
  });

  it("shows the mixer dropdown when there is more than one mixer", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer(), mix2: makeMixer({ mixerId: "mix2" }) } });
    render(<SoundBoardWidget />);
    expect(screen.getByTestId("soundboard-mixer-select")).toBeInTheDocument();
  });

  it("switches the selected mixer via the dropdown", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer(), mix2: makeMixer({ mixerId: "mix2" }) } });
    render(<SoundBoardWidget />);
    fireEvent.change(screen.getByTestId("soundboard-mixer-select"), { target: { value: "mix2" } });
    // Still renders strips for the newly selected mixer.
    expect(screen.getByTestId(TEST_ID_SOUNDBOARD_STRIP_ROW)).toBeInTheDocument();
  });

  it("activates a preset and shows a toast", () => {
    useStore.setState({
      mixerStates: { mix1: makeMixer({ presets: [{ id: "p1", name: "Singers", sortOrder: 0 }] }) },
      notifications: [],
    });
    render(<SoundBoardWidget />);
    fireEvent.click(screen.getByTestId(`${TEST_ID_MIXER_PRESET_BUTTON}-p1`));
    const notifications = useStore.getState().notifications;
    expect(notifications.some((n) => n.level === "toast" && n.message.includes("Singers"))).toBe(true);
  });

  it("opens the gain modal from a channel's Adjust Gain button (gain-control on)", () => {
    useStore.setState({ mixerStates: { mix1: makeMixer({ capabilities: { features: ["gain-control"], gainRange: { minDb: -12, maxDb: 60 } } }) } });
    render(<SoundBoardWidget />);
    fireEvent.click(screen.getByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`));
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_MODAL)).toBeInTheDocument();
  });

  it("opens the gain window (capture) and emits a monitor request", () => {
    class MockWebSocket {
      static instances: MockWebSocket[] = [];
      onmessage = null;
      onclose = null;
      onerror = null;
      binaryType = "arraybuffer";
      readyState = 1;
      close = vi.fn();
      constructor() {
        MockWebSocket.instances.push(this);
      }
    }
    vi.stubGlobal("WebSocket", MockWebSocket as unknown as typeof WebSocket);
    useStore.setState({
      mixerStates: { mix1: makeMixer({ capabilities: { features: ["gain-control", "channel-audio-capture"], gainRange: { minDb: -12, maxDb: 60 } } }) },
    });
    render(<SoundBoardWidget />);
    fireEvent.click(screen.getByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`));
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_MODAL)).toBeInTheDocument();
    // A monitor WS opens for the window tier.
    expect(MockWebSocket.instances.length).toBeGreaterThan(0);
    vi.unstubAllGlobals();
  });

  it("emits a fader change and a mute toggle via the socket", () => {
    mockEmit.mockClear();
    useStore.setState({ mixerStates: { mix1: makeMixer() } });
    render(<SoundBoardWidget />);
    const sliders = screen.getAllByRole("slider");
    fireEvent.change(sliders[0]!, { target: { value: "0.8" } });
    fireEvent.click(screen.getByTestId("mixer-mute-button-1"));
    const events = mockEmit.mock.calls.map((c) => c[0]);
    expect(events).toContain("cts:mixer:set");
  });

  it("shows an unhealthy Controls indicator when state goes stale", () => {
    vi.useFakeTimers();
    useStore.setState({ mixerStates: { mix1: makeMixer() } });
    render(<SoundBoardWidget />);
    // Advance past the freshness window (18000ms) so stateFresh flips false.
    act(() => vi.advanceTimersByTime(19000));
    const indicators = screen.getByTestId(TEST_ID_CONNECTION_INDICATORS);
    expect(indicators.querySelector('[data-status="unhealthy"]')).not.toBeNull();
    vi.useRealTimers();
  });

  it("paginates when the width fits fewer strips than channels", () => {
    // 9 channels, narrow width → pager appears.
    const channels = Array.from({ length: 9 }, (_, i) => ({ channel: i + 1, name: `Ch ${i + 1}`, fader: 0.5, faderDb: -10, muted: false, gainDb: 0 }));
    useStore.setState({ mixerStates: { mix1: makeMixer({ channelCount: 9, channels }) } });
    render(<SoundBoardWidget />);
    // 600px width / 6rem(96px) = 6 strips fit, 9 channels → paginated.
    expect(screen.getByTestId(TEST_ID_MIXER_PAGINATION)).toBeInTheDocument();
    // First page: next button present, prev absent.
    expect(screen.getByTestId(TEST_ID_MIXER_PAGINATION_NEXT)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_MIXER_PAGINATION_PREV)).toBeNull();
    // Advance a page → prev appears.
    fireEvent.click(screen.getByTestId(TEST_ID_MIXER_PAGINATION_NEXT));
    expect(screen.getByTestId(TEST_ID_MIXER_PAGINATION_PREV)).toBeInTheDocument();
  });
});
