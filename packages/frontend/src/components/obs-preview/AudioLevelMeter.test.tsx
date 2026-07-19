import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { AudioLevelMeter, dBToPercent } from "./AudioLevelMeter";

describe("dBToPercent", () => {
  it("returns 0 for -60 dB", () => {
    expect(dBToPercent(-60)).toBe(0);
  });

  it("returns 100 for 0 dB", () => {
    expect(dBToPercent(0)).toBe(100);
  });

  it("returns 50 for -30 dB", () => {
    expect(dBToPercent(-30)).toBe(50);
  });

  it("clamps below -60 to 0", () => {
    expect(dBToPercent(-80)).toBe(0);
  });

  it("clamps above 0 to 100", () => {
    expect(dBToPercent(5)).toBe(100);
  });

  it("returns correct percent for -20 dB (green→yellow boundary = 67%)", () => {
    expect(dBToPercent(-20)).toBeCloseTo(66.67, 1);
  });

  it("returns correct percent for -6 dB (yellow→red boundary = 90%)", () => {
    expect(dBToPercent(-6)).toBe(90);
  });
});

describe("AudioLevelMeter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders L and R labels", () => {
    render(<AudioLevelMeter levels={{ left: -20, right: -10 }} eventsFlowing={true} />);
    expect(screen.getByText("L")).toBeInTheDocument();
    expect(screen.getByText("R")).toBeInTheDocument();
  });

  it("renders the meter container", () => {
    render(<AudioLevelMeter levels={{ left: -20, right: -10 }} eventsFlowing={true} />);
    expect(screen.getByTestId("audio-meter-container")).toBeInTheDocument();
  });

  it("renders left and right meter bars", () => {
    render(<AudioLevelMeter levels={{ left: -20, right: -10 }} eventsFlowing={true} />);
    expect(screen.getByTestId("audio-meter-left")).toBeInTheDocument();
    expect(screen.getByTestId("audio-meter-right")).toBeInTheDocument();
  });

  it("fills bars to correct height for known dB values", () => {
    const { container } = render(<AudioLevelMeter levels={{ left: -30, right: -15 }} eventsFlowing={true} />);
    const gradients = container.querySelectorAll(".audio-meter-gradient");
    // -30 dB → 50%, -15 dB → 75%
    const leftGradient = gradients[0] as HTMLElement;
    const rightGradient = gradients[1] as HTMLElement;
    expect(leftGradient.style.getPropertyValue("--fill-percent")).toBe("50%");
    expect(rightGradient.style.getPropertyValue("--fill-percent")).toBe("75%");
  });

  it("meters at zero when levels are { left: -60, right: -60 }", () => {
    const { container } = render(<AudioLevelMeter levels={{ left: -60, right: -60 }} eventsFlowing={true} />);
    const gradients = container.querySelectorAll(".audio-meter-gradient");
    expect((gradients[0] as HTMLElement).style.getPropertyValue("--fill-percent")).toBe("0%");
    expect((gradients[1] as HTMLElement).style.getPropertyValue("--fill-percent")).toBe("0%");
  });

  it("meters at zero when events are not flowing", () => {
    const { container } = render(<AudioLevelMeter levels={{ left: -20, right: -10 }} eventsFlowing={false} />);
    const gradients = container.querySelectorAll(".audio-meter-gradient");
    expect((gradients[0] as HTMLElement).style.getPropertyValue("--fill-percent")).toBe("0%");
    expect((gradients[1] as HTMLElement).style.getPropertyValue("--fill-percent")).toBe("0%");
  });

  it("peak hold appears for peak values", () => {
    const { container } = render(<AudioLevelMeter levels={{ left: -10, right: -5 }} eventsFlowing={true} />);
    const peaks = container.querySelectorAll(".audio-meter-peak-hold");
    expect(peaks.length).toBeGreaterThan(0);
  });

  it("peak hold decays after 1 second of no new (higher) peak", () => {
    const { container, rerender } = render(<AudioLevelMeter levels={{ left: -10, right: -5 }} eventsFlowing={true} />);

    // Peak should be visible
    let peaks = container.querySelectorAll(".audio-meter-peak-hold");
    expect(peaks.length).toBeGreaterThan(0);

    // Send the same level repeatedly (not a new peak — shouldn't reset timer)
    rerender(<AudioLevelMeter levels={{ left: -10, right: -5 }} eventsFlowing={true} />);
    rerender(<AudioLevelMeter levels={{ left: -10, right: -5 }} eventsFlowing={true} />);

    // Advance past 1s decay time
    act(() => {
      vi.advanceTimersByTime(1100);
    });

    // Force a re-render to pick up the state change
    rerender(<AudioLevelMeter levels={{ left: -60, right: -60 }} eventsFlowing={true} />);

    // After decay, peaks at -60 are at 0% and should not render (peakPercent > 0 guard)
    peaks = container.querySelectorAll(".audio-meter-peak-hold");
    expect(peaks).toHaveLength(0);
  });

  it("peak hold resets timer when a HIGHER peak arrives", () => {
    const { container, rerender } = render(<AudioLevelMeter levels={{ left: -20, right: -20 }} eventsFlowing={true} />);

    // Advance 800ms (not yet decayed)
    act(() => {
      vi.advanceTimersByTime(800);
    });

    // New higher peak should reset the timer
    rerender(<AudioLevelMeter levels={{ left: -10, right: -10 }} eventsFlowing={true} />);

    // Advance another 800ms (total 1600ms from first, but only 800ms from last peak)
    act(() => {
      vi.advanceTimersByTime(800);
    });

    // Peaks should still be visible (timer was reset by the higher peak)
    const peaks = container.querySelectorAll(".audio-meter-peak-hold");
    expect(peaks.length).toBeGreaterThan(0);
  });

  it("renders nothing when levels is null", () => {
    render(<AudioLevelMeter levels={null} eventsFlowing={false} />);
    // Still renders the container (parent controls visibility)
    expect(screen.getByTestId("audio-meter-container")).toBeInTheDocument();
  });
});
