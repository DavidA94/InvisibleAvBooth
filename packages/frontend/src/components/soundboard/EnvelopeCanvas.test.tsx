import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { EnvelopeCanvas, dbfsToY, bandRect, drawEnvelope } from "./EnvelopeCanvas";
import { GOOD_RANGE_BAND_DBFS, RED_FADE_DBFS, BLUE_FADE_DBFS } from "@invisible-av-booth/shared";
import { TEST_ID_MIXER_ENVELOPE_CANVAS } from "../../constants/testIds";

describe("dbfsToY", () => {
  it("maps 0 dBFS to the top (y=0) and -60 to the bottom (y=height)", () => {
    expect(dbfsToY(0, 400)).toBe(0);
    expect(dbfsToY(-60, 400)).toBe(400);
  });

  it("maps -30 dBFS to the middle", () => {
    expect(dbfsToY(-30, 400)).toBe(200);
  });

  it("clamps out-of-range values to the axis", () => {
    expect(dbfsToY(10, 400)).toBe(0);
    expect(dbfsToY(-100, 400)).toBe(400);
  });
});

describe("bandRect", () => {
  it("places the Good-Range Band at its configured dB positions", () => {
    const rect = bandRect(GOOD_RANGE_BAND_DBFS, 600);
    expect(rect.top).toBe(dbfsToY(GOOD_RANGE_BAND_DBFS.topDb, 600));
    expect(rect.bottom).toBe(dbfsToY(GOOD_RANGE_BAND_DBFS.bottomDb, 600));
    // top (-8 dBFS) is higher on screen than bottom (-18 dBFS).
    expect(rect.top).toBeLessThan(rect.bottom);
  });

  it("places the red fade near the top (approaching clip) and blue near the bottom", () => {
    const red = bandRect(RED_FADE_DBFS, 600);
    const blue = bandRect(BLUE_FADE_DBFS, 600);
    expect(red.top).toBe(0); // 0 dBFS → top
    expect(blue.bottom).toBe(600); // -60 dBFS → bottom
  });
});

/** A fake 2D context that records fillRect calls. */
function makeFakeContext() {
  const rects: Array<{ x: number; y: number; w: number; h: number }> = [];
  const lineTos: Array<{ x: number; y: number }> = [];
  let strokeCount = 0;
  let fillCount = 0;
  return {
    rects,
    lineTos,
    get strokeCount() {
      return strokeCount;
    },
    get fillCount() {
      return fillCount;
    },
    clearRect: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    set fillStyle(_v: unknown) {},
    get fillStyle() {
      return "";
    },
    set strokeStyle(_v: unknown) {},
    set lineWidth(_v: unknown) {},
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h }),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: (x: number, y: number) => lineTos.push({ x, y }),
    lineTo: (x: number, y: number) => lineTos.push({ x, y }),
    fill: () => {
      fillCount++;
    },
    stroke: () => {
      strokeCount++;
    },
  } as unknown as CanvasRenderingContext2D & {
    rects: Array<{ x: number; y: number; w: number; h: number }>;
    lineTos: Array<{ x: number; y: number }>;
    strokeCount: number;
    fillCount: number;
  };
}

describe("drawEnvelope", () => {
  it("draws the bands + fades and a single stroked envelope line (nothing filled below)", () => {
    const context = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    drawEnvelope(
      context,
      [
        { minDb: -40, maxDb: -12 },
        { minDb: -38, maxDb: -14 },
      ],
      200,
      400,
    );
    // Blue + red + good band = 3 fillRects.
    expect(context.rects.length).toBe(3);
    // The trace is a single stroked max line (path-based) — no filled band below it.
    expect(context.strokeCount).toBeGreaterThanOrEqual(1);
    expect(context.fillCount).toBe(0);
    expect(context.lineTos.length).toBeGreaterThan(0);
  });

  it("envelope y-position tracks a changing gain (higher gain → nearer the top)", () => {
    const low = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    const high = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    // Quiet signal (low gain) vs hot signal (high gain) — the max point's y should
    // be smaller (nearer the top) when the level is hotter.
    drawEnvelope(
      low,
      [
        { minDb: -50, maxDb: -40 },
        { minDb: -50, maxDb: -40 },
      ],
      200,
      400,
    );
    drawEnvelope(
      high,
      [
        { minDb: -20, maxDb: -8 },
        { minDb: -20, maxDb: -8 },
      ],
      200,
      400,
    );
    const lowMaxY = Math.min(...low.lineTos.map((p) => p.y));
    const highMaxY = Math.min(...high.lineTos.map((p) => p.y));
    expect(highMaxY).toBeLessThan(lowMaxY);
  });

  it("draws the bands but no trace path for an empty ring", () => {
    const context = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    drawEnvelope(context, [], 200, 400);
    // Blue + red + good band = 3 rects, and no envelope path points.
    expect(context.rects).toHaveLength(3);
    expect(context.lineTos).toHaveLength(0);
  });
});

describe("EnvelopeCanvas component draw loop", () => {
  it("invokes drawEnvelope via requestAnimationFrame when a 2D context is available", async () => {
    const fillRect = vi.fn();
    const getContext = vi.fn(() => ({
      clearRect: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillRect,
      fillStyle: "",
    }));
    // Stub getContext on the canvas prototype so the rAF draw path runs.
    const original = HTMLCanvasElement.prototype.getContext;
    // @ts-expect-error test stub
    HTMLCanvasElement.prototype.getContext = getContext;
    try {
      render(<EnvelopeCanvas burst={[{ minDb: -30, maxDb: -10 }]} width={200} height={400} />);
      // Wait a frame for requestAnimationFrame to run the draw.
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(getContext).toHaveBeenCalledWith("2d");
      expect(fillRect).toHaveBeenCalled();
    } finally {
      HTMLCanvasElement.prototype.getContext = original;
    }
  });
});

describe("EnvelopeCanvas component", () => {
  it("renders a canvas element (draw is a no-op when getContext returns null in jsdom)", () => {
    render(<EnvelopeCanvas burst={[{ minDb: -40, maxDb: -12 }]} height={400} width={200} />);
    expect(screen.getByTestId(TEST_ID_MIXER_ENVELOPE_CANVAS)).toBeInTheDocument();
  });
});
