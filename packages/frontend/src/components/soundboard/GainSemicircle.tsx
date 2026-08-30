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

// Geometry for a 180° arc (semicircle) drawn left→right along the top.
const RADIUS = 40;
const CENTER = 50;
const CIRCUMFERENCE = Math.PI * RADIUS; // half-circle arc length

/**
 * Knob-style gain arc (Req 7.2). Fills clockwise from empty (gain at model
 * minimum) to full (gain at model maximum). For the X Air: 0% = -12 dB,
 * 100% = +60 dB. Reflects whatever gain value it's given, whether the change
 * originated from the slider or a backend update.
 */
export function GainSemicircle({ gainDb, minDb, maxDb }: GainSemicircleProps): ReactNode {
  const fraction = gainToFraction(gainDb, minDb, maxDb);
  // A semicircle path from left (180°) to right (0°) over the top.
  const arcPath = `M ${CENTER - RADIUS} ${CENTER} A ${RADIUS} ${RADIUS} 0 0 1 ${CENTER + RADIUS} ${CENTER}`;
  // stroke-dashoffset fills the arc clockwise as fraction grows.
  const dashOffset = CIRCUMFERENCE * (1 - fraction);

  return (
    <svg
      data-testid={TEST_ID_MIXER_GAIN_SEMICIRCLE}
      data-fraction={fraction.toFixed(3)}
      className="mixer-gain-semicircle"
      viewBox="0 0 100 55"
      role="img"
      aria-label={`Gain ${gainDb.toFixed(0)} dB`}
    >
      <path d={arcPath} className="mixer-gain-arc-track" fill="none" strokeWidth={8} />
      <path d={arcPath} className="mixer-gain-arc-fill" fill="none" strokeWidth={8} strokeDasharray={CIRCUMFERENCE} strokeDashoffset={dashOffset} />
      <text x={CENTER} y={CENTER - 8} textAnchor="middle" className="mixer-gain-arc-label">
        {gainDb.toFixed(0)} dB
      </text>
    </svg>
  );
}
