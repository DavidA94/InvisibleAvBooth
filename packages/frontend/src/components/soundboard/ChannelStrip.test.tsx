import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChannelStrip } from "./ChannelStrip";
import type { MixerChannelState, MixerFeature } from "@invisible-av-booth/shared";
import {
  TEST_ID_SOUNDBOARD_CHANNEL_NAME,
  TEST_ID_MIXER_ADJUST_GAIN_BUTTON,
  TEST_ID_MIXER_CHANNEL_METER,
  TEST_ID_MIXER_VERTICAL_FADER,
  TEST_ID_MIXER_MUTE_BUTTON,
} from "../../constants/testIds";

const CHANNEL: MixerChannelState = { channel: 1, name: "Vocals", fader: 0.5, faderDb: -10, muted: false, gainDb: 0 };

function renderStrip(features: MixerFeature[]) {
  return render(
    <ChannelStrip
      channel={CHANNEL}
      features={features}
      levelDb={-20}
      levelEventsFlowing={true}
      onFaderChange={vi.fn()}
      onMuteToggle={vi.fn()}
      onAdjustGain={vi.fn()}
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

  it.each([
    ["gain-control", TEST_ID_MIXER_ADJUST_GAIN_BUTTON],
    ["channel-metering", TEST_ID_MIXER_CHANNEL_METER],
  ] as Array<[MixerFeature, string]>)("shows the %s control when the feature is enabled", (feature, testIdPrefix) => {
    renderStrip([feature]);
    expect(screen.getByTestId(`${testIdPrefix}-1`)).toBeInTheDocument();
  });

  it.each([
    ["gain-control", TEST_ID_MIXER_ADJUST_GAIN_BUTTON],
    ["channel-metering", TEST_ID_MIXER_CHANNEL_METER],
  ] as Array<[MixerFeature, string]>)("hides the %s control when the feature is disabled", (feature, testIdPrefix) => {
    // Render with a different single feature so the one under test is absent.
    const other: MixerFeature = feature === "gain-control" ? "channel-metering" : "gain-control";
    renderStrip([other]);
    expect(screen.queryByTestId(`${testIdPrefix}-1`)).toBeNull();
  });

  it("calls onAdjustGain when the Adjust Gain button is clicked", () => {
    const onAdjustGain = vi.fn();
    render(
      <ChannelStrip
        channel={CHANNEL}
        features={["gain-control"]}
        levelDb={-20}
        levelEventsFlowing={true}
        onFaderChange={vi.fn()}
        onMuteToggle={vi.fn()}
        onAdjustGain={onAdjustGain}
      />,
    );
    screen.getByTestId(`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-1`).click();
    expect(onAdjustGain).toHaveBeenCalled();
  });

  it("propagates unreconciled to the fader and mute (Req 15.8 / 6.6)", () => {
    render(
      <ChannelStrip
        channel={{ ...CHANNEL, unreconciled: true }}
        features={[]}
        levelDb={-20}
        levelEventsFlowing={true}
        faderUnreconciled={true}
        onFaderChange={vi.fn()}
        onMuteToggle={vi.fn()}
        onAdjustGain={vi.fn()}
      />,
    );
    expect(screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-1`).getAttribute("data-state")).toBe("unreconciled");
    // Mute shows the "Audio: Unknown" form of unreconciled.
    expect(screen.getByTestId(`${TEST_ID_MIXER_MUTE_BUTTON}-1`).getAttribute("data-state")).toBe("unknown");
  });
});
