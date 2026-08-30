import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ChannelLevelMeter, dBToPercent } from "./ChannelLevelMeter";
import { TEST_ID_MIXER_CHANNEL_METER } from "../../constants/testIds";

describe("dBToPercent", () => {
  it("maps -60→0, 0→100, -30→50", () => {
    expect(dBToPercent(-60)).toBe(0);
    expect(dBToPercent(0)).toBe(100);
    expect(dBToPercent(-30)).toBe(50);
  });
  it("clamps out-of-range values", () => {
    expect(dBToPercent(-80)).toBe(0);
    expect(dBToPercent(5)).toBe(100);
  });
});

describe("ChannelLevelMeter", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fills to the correct percent for a live level", () => {
    const { container } = render(<ChannelLevelMeter levelDb={-30} eventsFlowing={true} testId={TEST_ID_MIXER_CHANNEL_METER} />);
    const gradient = container.querySelector(".audio-meter-gradient") as HTMLElement;
    expect(gradient.style.getPropertyValue("--fill-percent")).toBe("50%");
  });

  it("shows the ACTIVE status at true silence (level -60, events flowing)", () => {
    render(<ChannelLevelMeter levelDb={-60} eventsFlowing={true} testId={TEST_ID_MIXER_CHANNEL_METER} />);
    expect(screen.getByTestId(TEST_ID_MIXER_CHANNEL_METER).getAttribute("data-status")).toBe("active");
  });

  it("shows a distinct INACTIVE status when events are not flowing (Req 5.4)", () => {
    render(<ChannelLevelMeter levelDb={-20} eventsFlowing={false} testId={TEST_ID_MIXER_CHANNEL_METER} />);
    const meter = screen.getByTestId(TEST_ID_MIXER_CHANNEL_METER);
    expect(meter.getAttribute("data-status")).toBe("inactive");
    expect(meter.className).toContain("audio-meter-inactive");
  });

  it("renders zero fill when inactive regardless of the passed level", () => {
    const { container } = render(<ChannelLevelMeter levelDb={-10} eventsFlowing={false} testId={TEST_ID_MIXER_CHANNEL_METER} />);
    const gradient = container.querySelector(".audio-meter-gradient") as HTMLElement;
    expect(gradient.style.getPropertyValue("--fill-percent")).toBe("0%");
  });

  it("renders an optional label", () => {
    render(<ChannelLevelMeter levelDb={-20} eventsFlowing={true} label="1" testId={TEST_ID_MIXER_CHANNEL_METER} />);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows peak hold and decays after 1s of no higher peak", () => {
    const { container, rerender } = render(<ChannelLevelMeter levelDb={-10} eventsFlowing={true} testId={TEST_ID_MIXER_CHANNEL_METER} />);
    expect(container.querySelectorAll(".audio-meter-peak-hold").length).toBeGreaterThan(0);
    act(() => vi.advanceTimersByTime(1100));
    rerender(<ChannelLevelMeter levelDb={-60} eventsFlowing={true} testId={TEST_ID_MIXER_CHANNEL_METER} />);
    expect(container.querySelectorAll(".audio-meter-peak-hold")).toHaveLength(0);
  });
});
