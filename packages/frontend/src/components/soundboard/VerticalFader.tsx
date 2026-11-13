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
  /** Emit a fader change (debounced + max-wait while dragging; final on release). */
  onFaderChange: (fader: number) => void;
}

/** Render a dB value for a tick/readout using the ∞ symbol (not "Inf"). */
function formatDb(db: number): string {
  if (db === -Infinity) return "−∞";
  return `${db}`;
}

/** dB tick marks for the MUI slider (−∞ uses the infinity symbol). */
const MARKS = FADER_TICKS_DB.map((db) => ({
  value: faderDbToFloat(db),
  label: formatDb(db),
}));

/**
 * Legible mark-label styling for the vertical slider. MUI positions the dB mark
 * labels to the RIGHT of the track and reserves a fixed right margin for them;
 * we trim that reserve (see below) but otherwise keep MUI's native positioning
 * so marks and labels stay aligned. Colors/size are restyled for dark-theme
 * legibility (steering §9 contrast).
 */
const SLIDER_SX = {
  color: "var(--color-primary)",
  height: "100%",
  // MUI reserves 44px right of a vertical slider with marks for the dB labels.
  // The labels need ~30px, and the reclaimed space goes to the channel dividers
  // (rem, per the sizing rules: 1.875rem ≈ 30px).
  "&.MuiSlider-marked": {
    marginRight: "1.875rem",
  },
  "& .MuiSlider-markLabel": {
    color: "var(--color-text)",
    fontSize: "0.6875rem",
  },
  "& .MuiSlider-mark": {
    backgroundColor: "var(--color-text-muted)",
  },
  "& .MuiSlider-rail": {
    backgroundColor: "var(--color-border)",
    opacity: 1,
  },
} as const;

/**
 * A vertical fader built on the MUI Slider (matching the camera zoom control;
 * ion-range has no vertical mode). Displays a real dB scale via FADER_TICKS_DB
 * with legible, on-track tick labels (−∞ at the bottom), uses useHeldControl for
 * the debounce+max-wait outbound / accept-all inbound interaction model, and
 * emits normalized 0.0–1.0 values. Exposes data-state including "unreconciled"
 * (Req 15.8), which auto-clears when the next confirmed value arrives.
 */
export function VerticalFader({ channel, fader, unreconciled = false, onFaderChange }: VerticalFaderProps): ReactNode {
  const held = useHeldControl(fader, onFaderChange);

  // Feed backend values through the hold model (applied unconditionally — the
  // backend only broadcasts the latest settled value for this address).
  useEffect(() => {
    held.onBackendValue(fader);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fader]);

  const displayDb = faderFloatToDb(held.value);
  const dataState = unreconciled ? "unreconciled" : "reconciled";

  return (
    <div className="mixer-vertical-fader" data-testid={`${TEST_ID_MIXER_VERTICAL_FADER}-${channel}`} data-state={dataState}>
      <div className="mixer-fader-track">
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
          sx={SLIDER_SX}
        />
      </div>
      <span className="mixer-fader-db">{displayDb === -Infinity ? "−∞ dB" : `${displayDb.toFixed(0)} dB`}</span>
    </div>
  );
}
