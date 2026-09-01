import { useId, useState } from "react";
import type { ReactNode } from "react";
import type { MixerChannelState, MixerFeature } from "@invisible-av-booth/shared";
import { LEVEL_AXIS_MIN_DBFS } from "@invisible-av-booth/shared";
import { useAuth } from "../../hooks/useAuth";
import { VerticalFader } from "./VerticalFader";
import { MuteButton } from "./MuteButton";
import { ChannelLevelMeter } from "./ChannelLevelMeter";
import { GainPopover } from "./GainPopover";
import {
  TEST_ID_SOUNDBOARD_CHANNEL_STRIP,
  TEST_ID_SOUNDBOARD_CHANNEL_NAME,
  TEST_ID_MIXER_ADJUST_GAIN_BUTTON,
  TEST_ID_MIXER_CHANNEL_METER,
} from "../../constants/testIds";

interface ChannelStripProps {
  channel: MixerChannelState;
  features: MixerFeature[];
  /** Gain range for this mixer (from capabilities), used by the gain popover. */
  gainMinDb: number;
  gainMaxDb: number;
  /** Pre-fader level in dBFS for this channel (from mixerLevels). */
  levelDb: number;
  /** Whether meter data is currently flowing (freshness). */
  levelEventsFlowing: boolean;
  /** Whether this channel's fader is unreconciled (read-back exhausted). */
  faderUnreconciled?: boolean;
  /**
   * Whether the name row should be reserved. When ANY channel on the visible page
   * has a name, all strips reserve the row so their controls stay vertically
   * aligned (Req 6-adjacent polish). When false (no names on the page), the row
   * takes no space.
   */
  showNameRow?: boolean;
  onFaderChange: (fader: number) => void;
  onMuteToggle: (muted: boolean) => void;
  onGainChange: (gainDb: number) => void;
}

/**
 * A single vertical channel strip (Req 5.2). Top→bottom: channel name, an
 * Adjust Gain button that opens a gain popover (only WHERE gain-control AND the
 * user is AvPowerUser+), a vertical fader with a per-channel pre-fader level
 * meter beside it (only WHERE channel-metering, same height as the fader), and a
 * mute button. Fader and mute are CORE and always rendered regardless of the
 * optional feature toggles (Req 6.7).
 *
 * GAIN IS AvPowerUser+ (see spec Appendix A): the Adjust Gain button is only
 * rendered for AvPowerUser+; AvVolunteer never sees it. The backend also rejects
 * gain in cts:mixer:set from AvVolunteer as defense-in-depth.
 */
export function ChannelStrip({
  channel,
  features,
  gainMinDb,
  gainMaxDb,
  levelDb,
  levelEventsFlowing,
  faderUnreconciled = false,
  showNameRow = true,
  onFaderChange,
  onMuteToggle,
  onGainChange,
}: ChannelStripProps): ReactNode {
  const { isRole } = useAuth();
  const hasMetering = features.includes("channel-metering");
  // Gain is a power-user+ feature; hide the control entirely for AvVolunteer.
  const canAdjustGain = features.includes("gain-control") && isRole("AvPowerUser");

  const [gainOpen, setGainOpen] = useState(false);
  // Unique, DOM-safe trigger id so the popover anchors to THIS channel's button.
  const gainTriggerId = `gain-trigger-${useId().replace(/:/g, "")}-${channel.channel}`;

  return (
    <div className="soundboard-channel-strip" data-testid={`${TEST_ID_SOUNDBOARD_CHANNEL_STRIP}-${channel.channel}`}>
      {showNameRow && (
        <span className="soundboard-channel-name" data-testid={`${TEST_ID_SOUNDBOARD_CHANNEL_NAME}-${channel.channel}`}>
          {channel.name}
        </span>
      )}

      {canAdjustGain && (
        <>
          <button
            type="button"
            id={gainTriggerId}
            className="mixer-adjust-gain-button"
            data-testid={`${TEST_ID_MIXER_ADJUST_GAIN_BUTTON}-${channel.channel}`}
            onClick={() => setGainOpen(true)}
          >
            Adjust Gain
          </button>
          <GainPopover
            isOpen={gainOpen}
            triggerId={gainTriggerId}
            channel={channel.channel}
            channelName={channel.name}
            gainDb={channel.gainDb}
            minDb={gainMinDb}
            maxDb={gainMaxDb}
            onClose={() => setGainOpen(false)}
            onGainChange={onGainChange}
          />
        </>
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

      <MuteButton channel={channel.channel} muted={channel.muted} unreconciled={channel.unreconciled ?? false} onToggle={onMuteToggle} />
    </div>
  );
}
