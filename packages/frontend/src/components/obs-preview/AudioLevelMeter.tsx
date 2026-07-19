import { useEffect, useRef, useState, useCallback } from "react";
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
 *
 * Color zones (standard broadcast):
 *   Green:  -60 to -20 dBFS (0–67% height)
 *   Yellow: -20 to -6 dBFS  (67–90% height)
 *   Red:    -6 to 0 dBFS    (90–100% height)
 *
 * Peak hold: tracks the highest peak per channel. Decays to -60 after 1 second
 * of no NEW peak (a new peak means a value higher than the current held peak).
 * Continuous audio at the same level does NOT reset the decay timer.
 */
export function AudioLevelMeter({ levels, eventsFlowing }: AudioLevelMeterProps): ReactNode {
  const [peakLeft, setPeakLeft] = useState(-60);
  const [peakRight, setPeakRight] = useState(-60);
  const peakLeftRef = useRef(-60);
  const peakRightRef = useRef(-60);
  const peakTimerLeftRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peakTimerRightRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective levels: use actual levels when events flowing, zero otherwise
  const effectiveLeft = eventsFlowing && levels ? levels.left : -60;
  const effectiveRight = eventsFlowing && levels ? levels.right : -60;

  const decayLeft = useCallback(() => {
    setPeakLeft(-60);
    peakLeftRef.current = -60;
    peakTimerLeftRef.current = null;
  }, []);

  const decayRight = useCallback(() => {
    setPeakRight(-60);
    peakRightRef.current = -60;
    peakTimerRightRef.current = null;
  }, []);

  // Peak hold logic — only restart the decay timer when a NEW peak is set
  // (i.e., when the incoming level exceeds the currently held peak).
  useEffect(() => {
    if (!eventsFlowing || !levels) return;

    // Left channel peak
    if (levels.left > peakLeftRef.current) {
      setPeakLeft(levels.left);
      peakLeftRef.current = levels.left;
      // New peak — restart the 1-second decay timer
      if (peakTimerLeftRef.current) clearTimeout(peakTimerLeftRef.current);
      peakTimerLeftRef.current = setTimeout(decayLeft, 1000);
    } else if (peakTimerLeftRef.current === null && peakLeftRef.current > -60) {
      // Peak exists but no timer running (first render after peak set) — start decay
      peakTimerLeftRef.current = setTimeout(decayLeft, 1000);
    }

    // Right channel peak
    if (levels.right > peakRightRef.current) {
      setPeakRight(levels.right);
      peakRightRef.current = levels.right;
      if (peakTimerRightRef.current) clearTimeout(peakTimerRightRef.current);
      peakTimerRightRef.current = setTimeout(decayRight, 1000);
    } else if (peakTimerRightRef.current === null && peakRightRef.current > -60) {
      peakTimerRightRef.current = setTimeout(decayRight, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, eventsFlowing, decayLeft, decayRight]);

  // Reset peaks when events stop flowing
  useEffect(() => {
    if (!eventsFlowing) {
      setPeakLeft(-60);
      setPeakRight(-60);
      peakLeftRef.current = -60;
      peakRightRef.current = -60;
      if (peakTimerLeftRef.current) clearTimeout(peakTimerLeftRef.current);
      if (peakTimerRightRef.current) clearTimeout(peakTimerRightRef.current);
      peakTimerLeftRef.current = null;
      peakTimerRightRef.current = null;
    }
  }, [eventsFlowing]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (peakTimerLeftRef.current) clearTimeout(peakTimerLeftRef.current);
      if (peakTimerRightRef.current) clearTimeout(peakTimerRightRef.current);
    };
  }, []);

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
        {/* Peak hold indicator */}
        {peakPercent > 0 && <div className="audio-meter-peak-hold" style={{ "--peak-percent": `${peakPercent}%` } as CSSProperties} />}
      </div>
      <span className="audio-meter-label">{label}</span>
    </div>
  );
}
