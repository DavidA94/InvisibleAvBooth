import { useEffect } from "react";
import type { ReactNode } from "react";
import { Slider } from "@mui/material";
import { gainDbToSlider, gainSliderToDb } from "@invisible-av-booth/shared";
import { useHeldControl } from "./useHeldControl";
import { TEST_ID_MIXER_GAIN_SLIDER } from "../../constants/testIds";

interface HorizontalGainSliderProps {
  gainDb: number;
  minDb: number;
  maxDb: number;
  /** Emit a gain change (throttled while dragging; final on release). */
  onGainChange: (gainDb: number) => void;
  /** Reflect the slider's current value to the parent (for the semicircle). */
  onValue?: (gainDb: number) => void;
}

/**
 * Horizontal gain slider (Req 7.2/7.3). The MUI Slider operates on a normalized
 * 0.0–1.0 position mapped through a piecewise log taper (gainDbToSlider /
 * gainSliderToDb) so fine control sits in the middle of the travel — matching the
 * feel of a real mixing console. All emits and the parent callback are in dB.
 */
export function HorizontalGainSlider({ gainDb, minDb: _minDb, maxDb: _maxDb, onGainChange, onValue }: HorizontalGainSliderProps): ReactNode {
  // Round incoming dB to 1 decimal to eliminate floating-point noise from the
  // normalized-float→dB wire conversion (e.g. 20.9999999 → 21.0).
  const roundedGainDb = Math.round(gainDb * 10) / 10;

  // Internal control operates in tapered slider-position space [0, 1].
  const positionToDb = (pos: number): number => gainSliderToDb(pos);
  const dbToPosition = (db: number): number => gainDbToSlider(db);

  // The X Air's finest preamp-gain granularity is 0.5 dB, so snap every commanded
  // value to the nearest half-dB. This keeps the UI, the wire value, and the
  // console in lockstep — a sub-0.5 UI value could never be matched by the mixer.
  const snapHalfDb = (db: number): number => Math.round(db * 2) / 2;
  // Convert a slider position to its SNAPPED position (so the thumb visually
  // steps in 0.5 dB increments rather than gliding continuously).
  const snapPosition = (pos: number): number => dbToPosition(snapHalfDb(positionToDb(pos)));

  const held = useHeldControl(dbToPosition(snapHalfDb(roundedGainDb)), (pos) => onGainChange(snapHalfDb(positionToDb(pos))));

  useEffect(() => {
    held.onBackendValue(dbToPosition(snapHalfDb(roundedGainDb)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedGainDb]);

  useEffect(() => {
    onValue?.(positionToDb(held.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held.value]);

  return (
    <div className="mixer-gain-slider" data-testid={TEST_ID_MIXER_GAIN_SLIDER}>
      <Slider
        size="medium"
        valueLabelDisplay="auto"
        valueLabelFormat={(pos) => `${snapHalfDb(gainSliderToDb(pos)).toFixed(1)} dB`}
        min={0}
        max={1}
        step={0.001}
        value={held.value}
        onChange={(_, next) => held.onLocalChange(snapPosition(next as number))}
        onChangeCommitted={(_, next) => held.onRelease(snapPosition(next as number))}
        aria-label="Preamp gain"
      />
    </div>
  );
}
