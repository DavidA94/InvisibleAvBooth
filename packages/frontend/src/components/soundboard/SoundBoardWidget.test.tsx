import { describe, it, expect, vi, beforeEach } from "vitest";
import "../../test/ionicMocks";
import { render, screen } from "@testing-library/react";
import { SoundBoardWidget, deriveControlsStatus } from "./SoundBoardWidget";
import { useStore } from "../../store";
import type { MixerState } from "@invisible-av-booth/shared";
import {
  TEST_ID_SOUNDBOARD_WIDGET,
  TEST_ID_SOUNDBOARD_STRIP_ROW,
  TEST_ID_SOUNDBOARD_EMPTY_PLACEHOLDER,
  TEST_ID_WIDGET_ERROR_OVERLAY,
  TEST_ID_CONNECTION_INDICATORS,
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

// useSocket returns a fake socket so emits don't throw.
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: vi.fn() }),
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
});
