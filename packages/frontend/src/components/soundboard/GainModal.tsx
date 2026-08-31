import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { GAIN_WINDOW_MAX_HEIGHT_REM } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
import { GainSemicircle } from "./GainSemicircle";
import { HorizontalGainSlider } from "./HorizontalGainSlider";
import { EnvelopeCanvas } from "./EnvelopeCanvas";
import { useEnvelopeStream } from "./useEnvelopeStream";
import { TEST_ID_MIXER_GAIN_MODAL, TEST_ID_MIXER_GAIN_UNAVAILABLE_NOTE } from "../../constants/testIds";

interface GainModalProps {
  isOpen: boolean;
  mixerId: string;
  channel: number;
  channelName: string;
  gainDb: number;
  minDb: number;
  maxDb: number;
  /** Whether the device advertises channel-audio-capture (window tier). */
  captureAvailable: boolean;
  onClose: () => void;
  onGainChange: (gainDb: number) => void;
  onMonitorStart: () => void;
  onMonitorStop: () => void;
}

const ENVELOPE_WIDTH_PX = 320;

/**
 * Per-channel gain modal (Req 7). Header shows "Gain for Channel X (<Name>)"
 * with the gain semicircle top-right; the body has the horizontal gain slider.
 *
 * WHEN channel-audio-capture is available, the modal renders the gain-window
 * envelope above the slider, requests a monitor (CTS_MIXER_MONITOR_START on
 * open / STOP on close) and streams the envelope over the binary WS. If capture
 * is unavailable at runtime OR the stream stalls (capture crash, Req 15.6), the
 * modal drops live to the slider-only tier with a calm inline note rather than a
 * frozen envelope.
 */
export function GainModal({
  isOpen,
  mixerId,
  channel,
  channelName,
  gainDb,
  minDb,
  maxDb,
  captureAvailable,
  onClose,
  onGainChange,
  onMonitorStart,
  onMonitorStop,
}: GainModalProps): ReactNode {
  // Reflect the slider's live value in the semicircle.
  const [displayGain, setDisplayGain] = useState(gainDb);
  useEffect(() => setDisplayGain(gainDb), [gainDb]);

  const windowTier = isOpen && captureAvailable;
  const { latest, stalled } = useEnvelopeStream(mixerId, channel, windowTier);
  const showEnvelope = windowTier && !stalled;

  // Monitor lifecycle: start on open (window tier), stop on close/unmount.
  useEffect(() => {
    if (!windowTier) return;
    onMonitorStart();
    return () => onMonitorStop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowTier]);

  const heightPx = GAIN_WINDOW_MAX_HEIGHT_REM * 16;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="large"
      header={
        <div className="mixer-gain-modal-header" data-testid={TEST_ID_MIXER_GAIN_MODAL}>
          <span>{channelName.trim() ? `Gain for Channel ${channel} (${channelName})` : `Gain for Channel ${channel}`}</span>
          <GainSemicircle gainDb={displayGain} minDb={minDb} maxDb={maxDb} />
        </div>
      }
    >
      <div className="mixer-gain-modal-body">
        {showEnvelope && <EnvelopeCanvas pair={latest} width={ENVELOPE_WIDTH_PX} height={heightPx} />}
        {windowTier && stalled && (
          <p className="mixer-gain-unavailable-note" data-testid={TEST_ID_MIXER_GAIN_UNAVAILABLE_NOTE}>
            Live audio view unavailable — basic gain control shown.
          </p>
        )}
        <HorizontalGainSlider gainDb={gainDb} minDb={minDb} maxDb={maxDb} onGainChange={onGainChange} onValue={setDisplayGain} />
      </div>
    </Modal>
  );
}
