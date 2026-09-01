import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { GainSemicircle, gainToFraction } from "./GainSemicircle";
import { TEST_ID_MIXER_GAIN_SEMICIRCLE } from "../../constants/testIds";

describe("gainToFraction", () => {
  it("maps minDb → 0 and maxDb → 1", () => {
    expect(gainToFraction(-12, -12, 60)).toBe(0);
    expect(gainToFraction(60, -12, 60)).toBe(1);
  });

  it("maps the midpoint to ~0.5", () => {
    expect(gainToFraction(24, -12, 60)).toBeCloseTo(0.5, 2);
  });

  it("clamps out-of-range values", () => {
    expect(gainToFraction(-100, -12, 60)).toBe(0);
    expect(gainToFraction(100, -12, 60)).toBe(1);
  });

  it("returns 0 for a degenerate range", () => {
    expect(gainToFraction(5, 10, 10)).toBe(0);
  });
});

describe("GainSemicircle", () => {
  it("renders with a fill fraction reflecting the gain (0% at min)", () => {
    render(<GainSemicircle gainDb={-12} minDb={-12} maxDb={60} />);
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_SEMICIRCLE).getAttribute("data-fraction")).toBe("0.000");
  });

  it("renders full at max", () => {
    render(<GainSemicircle gainDb={60} minDb={-12} maxDb={60} />);
    expect(screen.getByTestId(TEST_ID_MIXER_GAIN_SEMICIRCLE).getAttribute("data-fraction")).toBe("1.000");
  });

  it("reflects a backend-driven mid value", () => {
    render(<GainSemicircle gainDb={24} minDb={-12} maxDb={60} />);
    const fraction = Number(screen.getByTestId(TEST_ID_MIXER_GAIN_SEMICIRCLE).getAttribute("data-fraction"));
    expect(fraction).toBeCloseTo(0.5, 2);
  });

  it("exposes the gain value via aria-label (no numeric text printed inside the arc)", () => {
    render(<GainSemicircle gainDb={12} minDb={-12} maxDb={60} />);
    // The value is not drawn inside the semicircle (shown in the popover instead),
    // but remains accessible via the SVG's aria-label.
    expect(screen.queryByText("12 dB")).toBeNull();
    expect(screen.getByLabelText("Gain 12 dB")).toBeInTheDocument();
  });
});
