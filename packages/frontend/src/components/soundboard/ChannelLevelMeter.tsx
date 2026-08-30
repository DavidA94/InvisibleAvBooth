import { useEffect, useRef, useState, useCallback } from "react";
import type { CSSProperties, ReactNode } from "react";

/**
 * Linear mapping of dB within the -60 to 0 range to percentage (0-100).
 * -60 dBFS → 0%, 0 dBFS → 100%. Shared by the mono meter and its consumers.
 */
export function dBToPercent(dB: number): number {
  const clamped = Math.max(-60, Math.min(0, dB));
  return ((clamped + 60) / 60) * 100;
}

interface ChannelLevelMeterProps {
  /** Current level in dBFS (-60..0). */
  levelDb: number;
  /** Whether meter data is flowing. When false, renders the inactive/-inf state. */
  eventsFlowing: boolean;
  /** Optional label rendered beneath the bar (e.g. "L"/"R" for the stereo meter). */
  label?: string;
  /** data-testid for the bar wrapper. */
  testId?: string;
}

/**
 * A single MONO audio level meter with peak-hold, color zones, and a distinct
 * inactive state (Req 5.4). Extracted from the OBS stereo AudioLevelMeter so the
 * Sound Board per-channel meter and the OBS stereo meter share one visual and
 * one peak-hold implementation (the stereo meter composes two of these).
 *
 * INACTIVE vs SILENCE (Req 5.4): when eventsFlowing is false the bar shows a
 * dimmed "no-signal" treatment (data-status="inactive") that is unambiguously
 * different from a live meter reading true silence (data-status="active" at 0%),
 * so a volunteer can tell "meters are off" from "the channel is genuinely quiet".
 *
 * Peak hold: tracks the highest peak; decays to -60 after 1s of no NEW peak
 * (a new peak = a value higher than the current held peak). Continuous audio at
 * the same level does NOT reset the decay timer.
 */
export function ChannelLevelMeter({ levelDb, eventsFlowing, label, testId }: ChannelLevelMeterProps): ReactNode {
  const [peak, setPeak] = useState(-60);
  const peakRef = useRef(-60);
  const peakTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveLevel = eventsFlowing ? levelDb : -60;

  const decay = useCallback(() => {
    setPeak(-60);
    peakRef.current = -60;
    peakTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!eventsFlowing) return;
    if (levelDb > peakRef.current) {
      setPeak(levelDb);
      peakRef.current = levelDb;
      if (peakTimerRef.current) clearTimeout(peakTimerRef.current);
      peakTimerRef.current = setTimeout(decay, 1000);
    } else if (peakTimerRef.current === null && peakRef.current > -60) {
      peakTimerRef.current = setTimeout(decay, 1000);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelDb, eventsFlowing, decay]);

  useEffect(() => {
    if (!eventsFlowing) {
      setPeak(-60);
      peakRef.current = -60;
      if (peakTimerRef.current) clearTimeout(peakTimerRef.current);
      peakTimerRef.current = null;
    }
  }, [eventsFlowing]);

  useEffect(() => {
    return () => {
      if (peakTimerRef.current) clearTimeout(peakTimerRef.current);
    };
  }, []);

  const fillPercent = dBToPercent(effectiveLevel);
  const peakPercent = dBToPercent(peak);

  return (
    <div
      data-testid={testId}
      data-status={eventsFlowing ? "active" : "inactive"}
      className={`audio-meter-bar-wrapper${eventsFlowing ? "" : " audio-meter-inactive"}`}
    >
      <div className="audio-meter-track">
        {/* Full-height gradient, clipped to fill level from bottom. The --fill-percent
            CSS var is a documented inline-style exception (runtime-computed height). */}
        <div className="audio-meter-gradient" style={{ "--fill-percent": `${fillPercent}%` } as CSSProperties} />
        {peakPercent > 0 && <div className="audio-meter-peak-hold" style={{ "--peak-percent": `${peakPercent}%` } as CSSProperties} />}
      </div>
      {label !== undefined && <span className="audio-meter-label">{label}</span>}
    </div>
  );
}
