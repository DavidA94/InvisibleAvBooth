import { useEffect } from "react";
import type { ReactNode } from "react";
import { Slider } from "@mui/material";
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
 * Horizontal gain slider (Req 7.2/7.3) built on the MUI Slider (matching the
 * camera controls; not ion-range). Uses useHeldControl for suppress-in /
 * throttle-out and emits gain in dB.
 */
export function HorizontalGainSlider({ gainDb, minDb, maxDb, onGainChange, onValue }: HorizontalGainSliderProps): ReactNode {
  // Round to 1 decimal place to eliminate floating-point noise from the
  // normalized-float→dB wire conversion (e.g. 20.9999999... → 21.0).
  const roundedGainDb = Math.round(gainDb * 10) / 10;
  const held = useHeldControl(roundedGainDb, onGainChange);

  useEffect(() => {
    held.onBackendValue(roundedGainDb);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundedGainDb]);

  useEffect(() => {
    onValue?.(held.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held.value]);

  return (
    <div className="mixer-gain-slider" data-testid={TEST_ID_MIXER_GAIN_SLIDER}>
      <Slider
        size="medium"
        valueLabelDisplay="auto"
        min={minDb}
        max={maxDb}
        step={0.5}
        value={held.value}
        onChange={(_, next) => held.onLocalChange(next as number)}
        onChangeCommitted={(_, next) => held.onRelease(next as number)}
        aria-label="Preamp gain"
      />
    </div>
  );
}
