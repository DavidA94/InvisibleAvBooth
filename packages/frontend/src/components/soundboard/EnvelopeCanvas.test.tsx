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
  return {
    rects,
    clearRect: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    set fillStyle(_v: unknown) {},
    get fillStyle() {
      return "";
    },
    fillRect: (x: number, y: number, w: number, h: number) => rects.push({ x, y, w, h }),
  } as unknown as CanvasRenderingContext2D & { rects: Array<{ x: number; y: number; w: number; h: number }> };
}

describe("drawEnvelope", () => {
  it("draws the bands + fades and the envelope trace", () => {
    const context = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    drawEnvelope(context, [{ minDb: -40, maxDb: -12 }], 200, 400);
    // At least blue + red + good band + one envelope column.
    expect(context.rects.length).toBeGreaterThanOrEqual(4);
  });

  it("envelope y-position tracks a changing gain (higher gain → nearer the top)", () => {
    const low = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    const high = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    // Quiet signal (low gain) vs hot signal (high gain) — the envelope column's
    // top y should be smaller (nearer the top) when the level is hotter.
    drawEnvelope(low, [{ minDb: -50, maxDb: -40 }], 200, 400);
    drawEnvelope(high, [{ minDb: -20, maxDb: -8 }], 200, 400);
    const lowColumn = low.rects[low.rects.length - 1]!;
    const highColumn = high.rects[high.rects.length - 1]!;
    expect(highColumn.y).toBeLessThan(lowColumn.y);
  });

  it("draws the bands but no envelope columns for an empty ring", () => {
    const context = makeFakeContext() as ReturnType<typeof makeFakeContext>;
    drawEnvelope(context, [], 200, 400);
    // Blue + red + good band = 3 rects, no envelope columns.
    expect(context.rects).toHaveLength(3);
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
      render(<EnvelopeCanvas pair={{ minDb: -30, maxDb: -10 }} width={200} height={400} />);
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
    render(<EnvelopeCanvas pair={{ minDb: -40, maxDb: -12 }} height={400} width={200} />);
    expect(screen.getByTestId(TEST_ID_MIXER_ENVELOPE_CANVAS)).toBeInTheDocument();
  });
});
