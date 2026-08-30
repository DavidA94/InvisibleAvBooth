import type { ReactNode } from "react";
import type { MixerChannelState, MixerFeature } from "@invisible-av-booth/shared";
import { LEVEL_AXIS_MIN_DBFS } from "@invisible-av-booth/shared";
import { VerticalFader } from "./VerticalFader";
import { MuteButton } from "./MuteButton";
import { ChannelLevelMeter } from "./ChannelLevelMeter";
import {
  TEST_ID_SOUNDBOARD_CHANNEL_STRIP,
  TEST_ID_SOUNDBOARD_CHANNEL_NAME,
  TEST_ID_MIXER_ADJUST_GAIN_BUTTON,
  TEST_ID_MIXER_CHANNEL_METER,
} from "../../constants/testIds";

interface ChannelStripProps {
  channel: MixerChannelState;
  features: MixerFeature[];
  /** Pre-fader level in dBFS for this channel (from mixerLevels). */
  levelDb: number;
  /** Whether meter data is currently flowing (freshness). */
  levelEventsFlowing: boolean;
  /** Whether this channel's fader is unreconciled (read-back exhausted). */
  faderUnreconciled?: boolean;
  onFaderChange: (fader: number) => void;
  onMuteToggle: (muted: boolean) => void;
  onAdjustGain: () => void;
}

/**
 * A single vertical channel strip (Req 5.2). Top→bottom: channel name, an
 * Adjust Gain button (only WHERE gain-control), a vertical fader with a
 * per-channel pre-fader level meter beside it (only WHERE channel-metering,
 * same height as the fader), and a mute button. Fader and mute are CORE and are
 * always rendered regardless of the optional feature toggles (Req 6.7).
 */
export function ChannelStrip({
  channel,
  features,
  levelDb,
  levelEventsFlowing,
  faderUnreconciled = false,
  onFaderChange,
  onMuteToggle,
  onAdjustGain,
}: ChannelStripProps): ReactNode {
  const hasGain = features.includes("gain-control");
  const hasMetering = features.includes("channel-metering");

  return (
    <div className="soundboard-channel-strip" data-testid={`${TEST_ID_SOUNDBOARD_CHANNEL_STRIP}-${channel.channel}`}>
      <span className="soundboard-channel-name" data-testid={`${TEST_ID_SOUNDBOARD_CHANNEL_NAME}-${channel.channel}`}>
        {channel.name}
      </span>

      {hasGain && (
        <button
          type="button"
          className="mixer-adjust-gain-button"
          data-testid={`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-${channel.channel}`}
          onClick={onAdjustGain}
        >
          Adjust Gain
        </button>
      )}

      <div className="soundboard-fader-meter-row">
        <VerticalFader channel={channel.channel} fader={channel.fader} unreconciled={faderUnreconciled} onFaderChange={onFaderChange} />
        {hasMetering && (
          <ChannelLevelMeter
            testId={`${TEST_ID_MIXER_CHANNEL_METER}-${channel.channel}`}
            levelDb={levelEventsFlowing ? levelDb : LEVEL_AXIS_MIN_DBFS}
            eventsFlowing={levelEventsFlowing}
          />
        )}
      </div>

      <MuteButton channel={channel.channel} muted={channel.muted} onToggle={onMuteToggle} />
    </div>
  );
}
