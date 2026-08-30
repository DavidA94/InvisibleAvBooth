import type { ReactNode } from "react";
import { TEST_ID_AUDIO_METER_CONTAINER, TEST_ID_AUDIO_METER_LEFT, TEST_ID_AUDIO_METER_RIGHT } from "../../constants/testIds";
import { ChannelLevelMeter, dBToPercent } from "../soundboard/ChannelLevelMeter";

// Re-exported so existing imports (`import { dBToPercent } from "./AudioLevelMeter"`)
// keep working after the mono-meter extraction.
export { dBToPercent };

interface AudioLevelMeterProps {
  levels: { left: number; right: number } | null;
  eventsFlowing: boolean;
}

/**
 * Stereo audio level meter — now COMPOSES two mono ChannelLevelMeters (Task 34).
 * The per-channel peak-hold and MeterBar were lifted into ChannelLevelMeter so
 * the Sound Board per-channel meter and this OBS stereo meter share one visual
 * and one peak-hold implementation.
 */
export function AudioLevelMeter({ levels, eventsFlowing }: AudioLevelMeterProps): ReactNode {
  const left = eventsFlowing && levels ? levels.left : -60;
  const right = eventsFlowing && levels ? levels.right : -60;
  return (
    <div data-testid={TEST_ID_AUDIO_METER_CONTAINER} className="audio-meter-container">
      <ChannelLevelMeter testId={TEST_ID_AUDIO_METER_LEFT} levelDb={left} eventsFlowing={eventsFlowing} label="L" />
      <ChannelLevelMeter testId={TEST_ID_AUDIO_METER_RIGHT} levelDb={right} eventsFlowing={eventsFlowing} label="R" />
    </div>
  );
}
