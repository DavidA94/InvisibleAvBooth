import type { ReactNode } from "react";
import { LEVEL_AXIS_MIN_DBFS } from "@invisible-av-booth/shared";
import { useStore } from "../../store";
import { ChannelLevelMeter } from "./ChannelLevelMeter";

interface MixerChannelMeterProps {
  mixerId: string;
  channel: number;
  /**
   * Which signal to show:
   * - "output": OUTGOING (post-fader, post-mute) — what the channel sends to the mix.
   * - "input":  INPUT (pre-fader) — is a signal arriving at all? (catches a missed channel)
   */
  kind: "input" | "output";
  testId: string;
  className?: string;
}

/**
 * Store-connected meter for ONE mixer channel.
 *
 * WHY this exists (measured): meter frames arrive ~12×/s. When the Sound Board
 * widget itself subscribed to `mixerLevels`, every frame re-rendered the WHOLE
 * widget — all 16 strips with their MUI sliders, gain popovers and semicircles.
 * On a throttled CPU (6×, tablet-class) that saturated the main thread: a preset
 * ack that the backend sent at ~400 ms took ~11 s to clear the spinner, and
 * socket pings timed out. Selecting the single channel's level HERE means a meter
 * frame re-renders only these small meter bars; the rest of the widget renders
 * only when control state actually changes. Do not lift this subscription back up.
 */
export function MixerChannelMeter({ mixerId, channel, kind, testId, className }: MixerChannelMeterProps): ReactNode {
  const levelDb = useStore((s) => (kind === "input" ? s.mixerLevels : s.mixerPostLevels)[mixerId]?.[channel]);
  const flowing = levelDb !== undefined;
  return (
    <ChannelLevelMeter
      testId={testId}
      levelDb={flowing ? levelDb : LEVEL_AXIS_MIN_DBFS}
      eventsFlowing={flowing}
      {...(className !== undefined ? { className } : {})}
    />
  );
}
