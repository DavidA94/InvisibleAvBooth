import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../test/ionicMocks";
import { ChannelStrip } from "./ChannelStrip";
import type { MixerChannelState, MixerFeature } from "@invisible-av-booth/shared";
import {
  TEST_ID_SOUNDBOARD_CHANNEL_NAME,
  TEST_ID_MIXER_ADJUST_GAIN_BUTTON,
  TEST_ID_MIXER_CHANNEL_METER,
  TEST_ID_MIXER_VERTICAL_FADER,
  TEST_ID_MIXER_MUTE_BUTTON,
} from "../../constants/testIds";

// useAuth is mocked so we can flip the role between tests. Default: AvPowerUser
// (so the gain control is shown where gain-control is enabled).
const mockIsRole = vi.hoisted(() => vi.fn((_min: string) => true));
vi.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", username: "pu", role: "AvPowerUser" }, isRole: mockIsRole }),
}));

const CHANNEL: MixerChannelState = { channel: 1, name: "Vocals", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 };

beforeEach(() => {
  mockIsRole.mockReset();
  mockIsRole.mockImplementation(() => true); // AvPowerUser+ by default
});

function renderStrip(features: MixerFeature[]) {
  return render(
    <ChannelStrip
      channel={CHANNEL}
      features={features}
      gainMinDb={-12}
      gainMaxDb={60}
      levelDb={-20}
      levelEventsFlowing={true}
      onFaderChange={vi.fn()}
      onMuteToggle={vi.fn()}
      onGainChange={vi.fn()}
    />,
  );
}

describe("ChannelStrip", () => {
  it("always renders the channel name, fader, and mute button (core controls)", () => {
    renderStrip([]);
    expect(screen.getByTestId(`${TEST_ID_SOUNDBOARD_CHANNEL_NAME}-1`).textContent).toBe("Vocals");
    expect(screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_MIXER_MUTE_BUTTON}-1`)).toBeInTheDocument();
  });

  it("renders fader + mute even with ALL optional features off (Req 6.7)", () => {
    renderStrip([]);
    expect(screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_MIXER_MUTE_BUTTON}-1`)).toBeInTheDocument();
    expect(screen.queryByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`)).toBeNull();
    expect(screen.queryByTestId(`${TEST_ID_MIXER_CHANNEL_METER}-1`)).toBeNull();
  });

  it("shows the Adjust Gain button for an AvPowerUser when gain-control is enabled", () => {
    renderStrip(["gain-control"]);
    expect(screen.getByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`)).toBeInTheDocument();
  });

  it("shows the level meter when channel-metering is enabled", () => {
    renderStrip(["channel-metering"]);
    expect(screen.getByTestId(`${TEST_ID_MIXER_CHANNEL_METER}-1`)).toBeInTheDocument();
  });

  it("HIDES the Adjust Gain button for an AvVolunteer even when gain-control is enabled (AvPowerUser+ gate)", () => {
    mockIsRole.mockImplementation((min: string) => min !== "AvPowerUser"); // volunteer: not power-user
    renderStrip(["gain-control"]);
    expect(screen.queryByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`)).toBeNull();
  });

  it("hides the level meter when channel-metering is disabled", () => {
    renderStrip(["gain-control"]);
    expect(screen.queryByTestId(`${TEST_ID_MIXER_CHANNEL_METER}-1`)).toBeNull();
  });

  it("opens the gain popover when the Adjust Gain button is clicked", () => {
    renderStrip(["gain-control"]);
    screen.getByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`).click();
    // The mocked IonPopover renders its children; the live gain value appears.
    expect(screen.getByTestId("mixer-gain-slider")).toBeInTheDocument();
  });

  it("propagates unreconciled to the fader and mute (Req 15.8 / 6.6)", () => {
    render(
      <ChannelStrip
        channel={{ ...CHANNEL, unreconciled: true }}
        features={[]}
        gainMinDb={-12}
        gainMaxDb={60}
        levelDb={-20}
        levelEventsFlowing={true}
        faderUnreconciled={true}
        onFaderChange={vi.fn()}
        onMuteToggle={vi.fn()}
        onGainChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-1`).getAttribute("data-state")).toBe("unreconciled");
    expect(screen.getByTestId(`${TEST_ID_MIXER_MUTE_BUTTON}-1`).getAttribute("data-state")).toBe("unknown");
  });
});
