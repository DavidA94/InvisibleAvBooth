import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { IonPopover } from "@ionic/react";
import { GainSemicircle } from "./GainSemicircle";
import { HorizontalGainSlider } from "./HorizontalGainSlider";
import { TEST_ID_MIXER_GAIN_POPOVER, TEST_ID_MIXER_GAIN_VALUE } from "../../constants/testIds";

interface GainPopoverProps {
  /** Whether the popover is open. */
  isOpen: boolean;
  /** The trigger element id the popover anchors to (the Adjust Gain button). */
  triggerId: string;
  channel: number;
  channelName: string;
  gainDb: number;
  minDb: number;
  maxDb: number;
  onClose: () => void;
  onGainChange: (gainDb: number) => void;
}

/**
 * Per-channel gain popover (replaces the former gain modal + live-audio-view —
 * see sound-board-control spec Appendix A). Opened from the channel's Adjust Gain
 * button, anchored like the widget status-indicator popover. Layout: a small gain
 * semicircle to the LEFT (no numeric printed inside it) and, to the right, the
 * horizontal gain slider with the live dB value shown above it while adjusting.
 * Bounded to 400px wide. Gain is an AvPowerUser+ feature — the trigger button is
 * only rendered for AvPowerUser+ (see ChannelStrip), and the backend rejects gain
 * from AvVolunteer as defense-in-depth.
 */
export function GainPopover({ isOpen, triggerId, channel, channelName, gainDb, minDb, maxDb, onClose, onGainChange }: GainPopoverProps): ReactNode {
  // Live value reflected from the slider (drives the semicircle + the readout).
  const [displayGain, setDisplayGain] = useState(gainDb);
  useEffect(() => setDisplayGain(gainDb), [gainDb]);

  return (
    <IonPopover data-testid={TEST_ID_MIXER_GAIN_POPOVER} isOpen={isOpen} trigger={triggerId} onDidDismiss={onClose} side="top" alignment="center">
      <div className="mixer-gain-popover">
        <div className="mixer-gain-popover-title">{channelName.trim() ? `Gain — Ch ${channel} (${channelName})` : `Gain — Channel ${channel}`}</div>
        <div className="mixer-gain-popover-body">
          <GainSemicircle gainDb={displayGain} minDb={minDb} maxDb={maxDb} />
          <div className="mixer-gain-popover-control">
            <span className="mixer-gain-value" data-testid={TEST_ID_MIXER_GAIN_VALUE}>
              {displayGain.toFixed(1)} dB
            </span>
            <HorizontalGainSlider gainDb={gainDb} minDb={minDb} maxDb={maxDb} onGainChange={onGainChange} onValue={setDisplayGain} />
          </div>
        </div>
      </div>
    </IonPopover>
  );
}
