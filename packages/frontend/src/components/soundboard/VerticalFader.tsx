import { useEffect } from "react";
import type { ReactNode } from "react";
import { Slider } from "@mui/material";
import { FADER_TICKS_DB, faderFloatToDb, faderDbToFloat } from "@invisible-av-booth/shared";
import { useHeldControl } from "./useHeldControl";
import { TEST_ID_MIXER_VERTICAL_FADER } from "../../constants/testIds";

interface VerticalFaderProps {
  channel: number;
  /** Backend-authoritative normalized fader (0.0–1.0). */
  fader: number;
  /** True when read-back was exhausted for this control (Req 15.8). */
  unreconciled?: boolean;
  /** Emit a fader change (throttled while dragging; final on release). */
  onFaderChange: (fader: number) => void;
}

/** dB tick marks for the MUI slider. -Infinity renders as "-inf". */
const MARKS = FADER_TICKS_DB.map((db) => ({
  value: faderDbToFloat(db),
  label: db === -Infinity ? "-inf" : `${db}`,
}));

/**
 * A vertical fader built on the MUI Slider (matching the camera zoom control;
 * ion-range has no vertical mode). Displays a real dB scale via FADER_TICKS_DB,
 * uses useHeldControl for the suppress-in/throttle-out interaction model, and
 * emits normalized 0.0–1.0 values. Exposes data-state including "unreconciled"
 * (Req 15.8), which auto-clears when the next confirmed value arrives.
 */
export function VerticalFader({ channel, fader, unreconciled = false, onFaderChange }: VerticalFaderProps): ReactNode {
  const held = useHeldControl(fader, onFaderChange);

  // Feed backend values through the hold model (dropped during the suppression window).
  useEffect(() => {
    held.onBackendValue(fader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fader]);

  const displayDb = faderFloatToDb(held.value);
  const dataState = unreconciled ? "unreconciled" : "reconciled";

  return (
    <div
      className={`mixer-vertical-fader${unreconciled ? " mixer-control-unreconciled" : ""}`}
      data-testid={`${TEST_ID_MIXER_VERTICAL_FADER}-${channel}`}
      data-state={dataState}
    >
      <Slider
        orientation="vertical"
        size="medium"
        valueLabelDisplay="off"
        min={0}
        max={1}
        step={0.005}
        marks={MARKS}
        value={held.value}
        onChange={(_, next) => held.onLocalChange(next as number)}
        onChangeCommitted={(_, next) => held.onRelease(next as number)}
        aria-label={`Channel ${channel} fader`}
      />
      <span className="mixer-fader-db">{displayDb === -Infinity ? "-inf" : `${displayDb.toFixed(0)} dB`}</span>
    </div>
  );
}
