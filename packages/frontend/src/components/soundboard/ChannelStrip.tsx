import { memo, useId, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import type { MixerChannelState, MixerFeature } from "@invisible-av-booth/shared";
import { resolveMixerColor } from "@invisible-av-booth/shared";
import { useAuth } from "../../hooks/useAuth";
import { VerticalFader } from "./VerticalFader";
import { MuteButton } from "./MuteButton";
import { MixerChannelMeter } from "./MixerChannelMeter";
import { GainPopover } from "./GainPopover";
import { GainSemicircle } from "./GainSemicircle";
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
  /**
   * Mixer this strip belongs to. The strip's level meter subscribes to its own
   * channel's level from the store (MixerChannelMeter) so ~12 Hz meter frames
   * never re-render the whole strip — see MixerChannelMeter for the measurement.
   */
  mixerId: string;
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
function ChannelStripView({
  channel,
  features,
  gainMinDb,
  gainMaxDb,
  mixerId,
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

  // The X Air per-channel scribble color + style (null when OFF / not yet read).
  // Inverted (index 8–15) = solid colored background with dark text; otherwise
  // an outline: colored border + colored text on the dark theme background.
  // Runtime-computed mixer color is the documented inline-style exception.
  const resolved = resolveMixerColor(channel.color);
  const nameColorStyle: CSSProperties | undefined = resolved
    ? resolved.inverted
      ? { backgroundColor: resolved.hex, color: "#1A1A1A", borderColor: resolved.hex }
      : { color: resolved.hex, borderColor: resolved.hex }
    : undefined;

  return (
    <div className="soundboard-channel-strip" data-testid={`${TEST_ID_SOUNDBOARD_CHANNEL_STRIP}-${channel.channel}`}>
      {showNameRow && (
        <span
          className={`soundboard-channel-name${resolved ? " soundboard-channel-name-colored" : ""}`}
          data-testid={`${TEST_ID_SOUNDBOARD_CHANNEL_NAME}-${channel.channel}`}
          data-color={resolved ? (resolved.inverted ? "fill" : "outline") : undefined}
          {...(nameColorStyle ? { style: nameColorStyle } : {})}
        >
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
            {/* Live gain preview: the value sits inside the arc (like the popover
                semicircle), so the current gain is visible before opening it.
                Decorative inside the button. */}
            <span className="mixer-adjust-gain-preview" aria-hidden="true">
              <GainSemicircle gainDb={channel.gainDb} minDb={gainMinDb} maxDb={gainMaxDb} />
            </span>
            <span className="mixer-adjust-gain-label">Gain</span>
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
        {hasMetering && <MixerChannelMeter mixerId={mixerId} channel={channel.channel} testId={`${TEST_ID_MIXER_CHANNEL_METER}-${channel.channel}`} />}
      </div>

      <MuteButton channel={channel.channel} muted={channel.muted} unreconciled={channel.unreconciled ?? false} onToggle={onMuteToggle} />
    </div>
  );
}

/**
 * Memoized by VALUE. Every state broadcast arrives as freshly-parsed JSON, so
 * the channel/features objects are new references even when nothing changed;
 * a default shallow memo would never skip. Comparing the channel's fields
 * means a preset or fader broadcast only re-renders the strips that actually
 * changed. Handlers must be stable (SoundBoardWidget caches them per channel).
 */
function stripPropsEqual(prev: ChannelStripProps, next: ChannelStripProps): boolean {
  const a = prev.channel;
  const b = next.channel;
  return (
    a.channel === b.channel &&
    a.name === b.name &&
    a.fader === b.fader &&
    a.faderDb === b.faderDb &&
    a.muted === b.muted &&
    a.gainDb === b.gainDb &&
    a.color === b.color &&
    a.unreconciled === b.unreconciled &&
    prev.features.join() === next.features.join() &&
    prev.gainMinDb === next.gainMinDb &&
    prev.gainMaxDb === next.gainMaxDb &&
    prev.mixerId === next.mixerId &&
    prev.faderUnreconciled === next.faderUnreconciled &&
    prev.showNameRow === next.showNameRow &&
    prev.onFaderChange === next.onFaderChange &&
    prev.onMuteToggle === next.onMuteToggle &&
    prev.onGainChange === next.onGainChange
  );
}

export const ChannelStrip = memo(ChannelStripView, stripPropsEqual);
