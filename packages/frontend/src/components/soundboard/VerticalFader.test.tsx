import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { VerticalFader } from "./VerticalFader";
import { TEST_ID_MIXER_VERTICAL_FADER } from "../../constants/testIds";

describe("VerticalFader", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders with data-state=reconciled by default", () => {
    render(<VerticalFader channel={1} fader={0.5} onFaderChange={vi.fn()} />);
    const fader = screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-1`);
    expect(fader.getAttribute("data-state")).toBe("reconciled");
  });

  it("shows data-state=unreconciled when the prop is set (Req 15.8)", () => {
    render(<VerticalFader channel={2} fader={0.5} unreconciled onFaderChange={vi.fn()} />);
    const fader = screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-2`);
    expect(fader.getAttribute("data-state")).toBe("unreconciled");
    expect(fader.className).toContain("mixer-control-unreconciled");
  });

  it("clears the unreconciled state when the prop flips back", () => {
    const { rerender } = render(<VerticalFader channel={1} fader={0.5} unreconciled onFaderChange={vi.fn()} />);
    rerender(<VerticalFader channel={1} fader={0.6} onFaderChange={vi.fn()} />);
    expect(screen.getByTestId(`${TEST_ID_MIXER_VERTICAL_FADER}-1`).getAttribute("data-state")).toBe("reconciled");
  });

  it("displays the fader value in dB (0.75 float ≈ 0 dB)", () => {
    render(<VerticalFader channel={1} fader={0.75} onFaderChange={vi.fn()} />);
    expect(screen.getByText(/0 dB/)).toBeInTheDocument();
  });

  it("emits a fader change when the slider input changes", () => {
    const onFaderChange = vi.fn();
    render(<VerticalFader channel={1} fader={0.5} onFaderChange={onFaderChange} />);
    const input = screen.getByRole("slider");
    act(() => {
      fireEvent.change(input, { target: { value: "0.8" } });
    });
    expect(onFaderChange).toHaveBeenCalled();
  });

  it("drops a backend fader value that arrives within the suppression window", () => {
    const onFaderChange = vi.fn();
    const { rerender } = render(<VerticalFader channel={1} fader={0.5} onFaderChange={onFaderChange} />);
    const input = screen.getByRole("slider");
    act(() => {
      fireEvent.change(input, { target: { value: "0.8" } }); // local change starts window
    });
    // Backend pushes a different value while suppressed.
    act(() => {
      vi.advanceTimersByTime(50);
      rerender(<VerticalFader channel={1} fader={0.2} onFaderChange={onFaderChange} />);
    });
    // Value shown should still reflect the local 0.8 (≈ +2 dB), not 0.2.
    // The dB label is derived from the held value; assert it is not the -30 dB of 0.2.
    expect(screen.queryByText(/-30 dB/)).toBeNull();
  });
});
