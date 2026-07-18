import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { TEST_ID_AUDIO_METER_CONTAINER, TEST_ID_AUDIO_METER_LEFT, TEST_ID_AUDIO_METER_RIGHT } from "../../constants/testIds";

interface AudioLevelMeterProps {
  levels: { left: number; right: number } | null;
  eventsFlowing: boolean;
}

/**
 * Linear mapping of dB within the -60 to 0 range to percentage (0-100).
 * -60 dBFS → 0%, 0 dBFS → 100%.
 */
export function dBToPercent(dB: number): number {
  const clamped = Math.max(-60, Math.min(0, dB));
  return ((clamped + 60) / 60) * 100;
}

/**
 * Stereo audio level meter with peak hold, color zones, and nominal range indicator.
 * Renders two vertical bars (L/R) that fill from bottom to top based on dB level.
 * Uses a fixed CSS gradient with clip-path for correct zone positioning regardless of fill level.
 */
export function AudioLevelMeter({ levels, eventsFlowing }: AudioLevelMeterProps): ReactNode {
  const [peakLeft, setPeakLeft] = useState(-60);
  const [peakRight, setPeakRight] = useState(-60);
  const peakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective levels: use actual levels when events flowing, zero otherwise
  const effectiveLeft = eventsFlowing && levels ? levels.left : -60;
  const effectiveRight = eventsFlowing && levels ? levels.right : -60;

  // Peak hold logic — track highest peak per channel, decay after 1 second
  useEffect(() => {
    if (!eventsFlowing || !levels) return;

    if (levels.left > peakLeft) setPeakLeft(levels.left);
    if (levels.right > peakRight) setPeakRight(levels.right);

    if (peakTimerRef.current) clearTimeout(peakTimerRef.current);
    peakTimerRef.current = setTimeout(() => {
      setPeakLeft(-60);
      setPeakRight(-60);
    }, 1000);

    return () => {
      if (peakTimerRef.current) clearTimeout(peakTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, eventsFlowing]);

  // Reset peaks when events stop flowing
  useEffect(() => {
    if (!eventsFlowing) {
      setPeakLeft(-60);
      setPeakRight(-60);
    }
  }, [eventsFlowing]);

  const leftPercent = dBToPercent(effectiveLeft);
  const rightPercent = dBToPercent(effectiveRight);
  const peakLeftPercent = dBToPercent(peakLeft);
  const peakRightPercent = dBToPercent(peakRight);

  return (
    <div data-testid={TEST_ID_AUDIO_METER_CONTAINER} className="audio-meter-container">
      <MeterBar testId={TEST_ID_AUDIO_METER_LEFT} fillPercent={leftPercent} peakPercent={peakLeftPercent} label="L" />
      <MeterBar testId={TEST_ID_AUDIO_METER_RIGHT} fillPercent={rightPercent} peakPercent={peakRightPercent} label="R" />
    </div>
  );
}

interface MeterBarProps {
  testId: string;
  fillPercent: number;
  peakPercent: number;
  label: string;
}

function MeterBar({ testId, fillPercent, peakPercent, label }: MeterBarProps): ReactNode {
  return (
    <div data-testid={testId} className="audio-meter-bar-wrapper">
      <div className="audio-meter-track">
        {/* Full-height gradient, clipped to fill level from bottom */}
        <div className="audio-meter-gradient" style={{ "--fill-percent": `${fillPercent}%` } as CSSProperties} />
        {/* Nominal range indicator band: -18 to -12 dBFS = 70% to 80% height */}
        <div className="audio-meter-nominal" />
        {/* Peak hold indicator */}
        {peakPercent > 0 && <div className="audio-meter-peak-hold" style={{ "--peak-percent": `${peakPercent}%` } as CSSProperties} />}
      </div>
      <span className="audio-meter-label">{label}</span>
    </div>
  );
}
