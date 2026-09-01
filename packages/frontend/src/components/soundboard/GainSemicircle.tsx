import type { ReactNode } from "react";
import { TEST_ID_MIXER_GAIN_SEMICIRCLE } from "../../constants/testIds";

interface GainSemicircleProps {
  gainDb: number;
  minDb: number;
  maxDb: number;
}

/** Fraction (0..1) of the arc to fill for a gain value within [minDb, maxDb]. */
export function gainToFraction(gainDb: number, minDb: number, maxDb: number): number {
  if (maxDb <= minDb) return 0;
  const fraction = (gainDb - minDb) / (maxDb - minDb);
  return Math.max(0, Math.min(1, fraction));
}

// Geometry for a 288° arc (80% of a full circle), with the 72° gap centered at
// the bottom. In SVG angle convention (0° = right, clockwise):
//   - bottom = 90°; gap spans 54°–126°
//   - arc runs clockwise from 126° → 54° (the long 288° way)
//   - large-arc-flag = 1, sweep-flag = 1
// Radius is reduced to 32 (from 40) so the topmost point (270°) stays within
// the same overall height as the old semicircle — no CSS height change needed.
const CX = 50;
const CY = 50;
const RADIUS = 32;
const START_DEG = 126; // arc start (clockwise)
const END_DEG = 54; // arc end
const ARC_DEG = 288; // 80% of 360° — do NOT compute as 360-(END-START); START>END so subtraction gives the wrong sign
const CIRCUMFERENCE = (ARC_DEG / 360) * 2 * Math.PI * RADIUS; // ≈ 160.85

function toXY(deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [CX + RADIUS * Math.cos(rad), CY + RADIUS * Math.sin(rad)];
}

const [sx, sy] = toXY(START_DEG);
const [ex, ey] = toXY(END_DEG);
// large-arc=1 (288° > 180°), sweep=1 (clockwise)
const ARC_PATH = `M ${sx.toFixed(2)} ${sy.toFixed(2)} A ${RADIUS} ${RADIUS} 0 1 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;

/**
 * Knob-style gain arc — 80% of a full circle (288°), gap centered at the bottom.
 * Fills clockwise from the left endpoint (empty = min) to the right endpoint
 * (full = max). For the X Air: 0% = -12 dB, 100% = +60 dB. The numeric value is
 * shown via the MUI Slider tooltip on hover/tap, not inside the arc itself.
 */
export function GainSemicircle({ gainDb, minDb, maxDb }: GainSemicircleProps): ReactNode {
  const fraction = gainToFraction(gainDb, minDb, maxDb);
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  return (
    <svg
      data-testid={TEST_ID_MIXER_GAIN_SEMICIRCLE}
      data-fraction={fraction.toFixed(3)}
      className="mixer-gain-semicircle"
      viewBox="0 0 100 84"
      role="img"
      aria-label={`Gain ${gainDb.toFixed(0)} dB`}
    >
      <path d={ARC_PATH} className="mixer-gain-arc-track" fill="none" strokeWidth={8} />
      <path d={ARC_PATH} className="mixer-gain-arc-fill" fill="none" strokeWidth={8} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset} />
    </svg>
  );
}
