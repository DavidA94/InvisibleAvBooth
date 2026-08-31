import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import {
  LEVEL_AXIS_MAX_DBFS,
  LEVEL_AXIS_MIN_DBFS,
  GOOD_RANGE_BAND_DBFS,
  RED_FADE_DBFS,
  BLUE_FADE_DBFS,
  ENVELOPE_PAIRS_PER_SEC,
  ENVELOPE_WINDOW_MS,
} from "@invisible-av-booth/shared";
import type { EnvelopePair } from "@invisible-av-booth/shared";
import { TEST_ID_MIXER_ENVELOPE_CANVAS } from "../../constants/testIds";

/**
 * Map a dBFS value to a y pixel position on the axis (0 dBFS at top, -60 at
 * bottom). Pure so it can be unit-tested without a canvas (jsdom returns null
 * from getContext).
 */
export function dbfsToY(db: number, height: number): number {
  const clamped = Math.max(LEVEL_AXIS_MIN_DBFS, Math.min(LEVEL_AXIS_MAX_DBFS, db));
  const fraction = (LEVEL_AXIS_MAX_DBFS - clamped) / (LEVEL_AXIS_MAX_DBFS - LEVEL_AXIS_MIN_DBFS);
  return fraction * height;
}

/** A rectangle (top/bottom y) for a dB band on the axis. */
export function bandRect(band: { topDb: number; bottomDb: number }, height: number): { top: number; bottom: number } {
  return { top: dbfsToY(band.topDb, height), bottom: dbfsToY(band.bottomDb, height) };
}

/** Visible scrolling window: the last ENVELOPE_WINDOW_MS of decimated pairs. */
const RING_CAPACITY = Math.round((ENVELOPE_PAIRS_PER_SEC * ENVELOPE_WINDOW_MS) / 1000);

interface EnvelopeCanvasProps {
  /** Latest BURST of envelope pairs to append (post-preamp min/max dBFS). */
  burst: EnvelopePair[];
  /** Height in pixels (bounded by the parent's GAIN_WINDOW_MAX_HEIGHT_REM). */
  height: number;
  /** Width in pixels. */
  width: number;
}

/**
 * Gain-window envelope visualization (Req 7.4). Draws the live post-preamp
 * envelope on the fixed dBFS axis (0..-60), plus the Good-Range Band and the
 * red (approaching clip) / blue (approaching noise) fades at their configured dB
 * positions. The envelope maps dBFS→y, so as the operator changes gain the trace
 * moves vertically (raising gain lifts it toward 0 dBFS). Draw-only — it never
 * plays audio. Uses requestAnimationFrame with a ring buffer sized to the
 * visible window.
 */
export function EnvelopeCanvas({ burst, height, width }: EnvelopeCanvasProps): ReactNode {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ringRef = useRef<EnvelopePair[]>([]);
  const rafRef = useRef<number | null>(null);

  // Append the incoming burst to the ring buffer (bounded to the visible window).
  useEffect(() => {
    if (burst.length === 0) return;
    const ring = ringRef.current;
    ring.push(...burst);
    if (ring.length > RING_CAPACITY) ring.splice(0, ring.length - RING_CAPACITY);
  }, [burst]);

  useEffect(() => {
    const draw = (): void => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (canvas && context) {
        drawEnvelope(context, ringRef.current, width, height);
      }
      rafRef.current = requestAnimationFrame(draw);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [width, height]);

  return <canvas ref={canvasRef} data-testid={TEST_ID_MIXER_ENVELOPE_CANVAS} className="mixer-envelope-canvas" width={width} height={height} />;
}

/**
 * Pure-ish drawing routine (separated so it can be exercised with a fake 2D
 * context). Draws band + fades at their dB positions, then the envelope trace.
 */
export function drawEnvelope(context: CanvasRenderingContext2D, ring: EnvelopePair[], width: number, height: number): void {
  context.clearRect(0, 0, width, height);

  // Blue fade (approaching noise floor), darkest at the bottom (-60).
  const blue = bandRect(BLUE_FADE_DBFS, height);
  const blueGradient = context.createLinearGradient(0, blue.top, 0, blue.bottom);
  blueGradient.addColorStop(0, "rgba(52, 152, 219, 0)");
  blueGradient.addColorStop(1, "rgba(52, 152, 219, 0.5)");
  context.fillStyle = blueGradient;
  context.fillRect(0, blue.top, width, blue.bottom - blue.top);

  // Red fade (approaching clip), darkest at the top (0).
  const red = bandRect(RED_FADE_DBFS, height);
  const redGradient = context.createLinearGradient(0, red.top, 0, red.bottom);
  redGradient.addColorStop(0, "rgba(255, 68, 68, 0.6)");
  redGradient.addColorStop(1, "rgba(255, 68, 68, 0)");
  context.fillStyle = redGradient;
  context.fillRect(0, red.top, width, red.bottom - red.top);

  // Good-range band.
  const good = bandRect(GOOD_RANGE_BAND_DBFS, height);
  context.fillStyle = "rgba(39, 174, 96, 0.25)";
  context.fillRect(0, good.top, width, good.bottom - good.top);

  // Envelope trace: a SINGLE waveform line following the per-window peak (max)
  // level — nothing filled below it. The line maps dBFS→y, so raising gain lifts
  // it toward 0 dBFS. Spread across the FULL width (newest at the right) so it
  // always fills the canvas rather than starting mid-way while the ring fills.
  if (ring.length > 1) {
    const step = width / (ring.length - 1);
    context.beginPath();
    context.moveTo(0, dbfsToY(ring[0]!.maxDb, height));
    for (let index = 1; index < ring.length; index++) {
      context.lineTo(index * step, dbfsToY(ring[index]!.maxDb, height));
    }
    context.strokeStyle = "rgba(245, 245, 245, 0.95)";
    context.lineWidth = 1.5;
    context.stroke();
  }
}
