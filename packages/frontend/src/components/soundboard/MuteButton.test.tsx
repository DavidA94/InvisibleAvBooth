import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { MuteButton } from "./MuteButton";
import { TEST_ID_MIXER_MUTE_BUTTON, TEST_ID_MIXER_MUTE_STATUS } from "../../constants/testIds";

const btn = (channel: number): string => `${TEST_ID_MIXER_MUTE_BUTTON}-${channel}`;
const status = (channel: number): string => `${TEST_ID_MIXER_MUTE_STATUS}-${channel}`;

describe("MuteButton", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("shows Audio: On (active) when unmuted", () => {
    render(<MuteButton channel={1} muted={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: On");
    expect(screen.getByTestId(btn(1)).getAttribute("data-state")).toBe("active");
  });

  it("shows Audio: Off (muted) when muted", () => {
    render(<MuteButton channel={1} muted={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off");
    expect(screen.getByTestId(btn(1)).getAttribute("data-state")).toBe("muted");
  });

  it("emits the desired mute state and OPTIMISTICALLY shows the commanded state on toggle", () => {
    const onToggle = vi.fn();
    render(<MuteButton channel={1} muted={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId(btn(1)));
    expect(onToggle).toHaveBeenCalledWith(true);
    // Trust the command went through — show "Audio: Off" immediately, not "Unknown".
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off");
    expect(screen.getByTestId(btn(1)).getAttribute("data-state")).toBe("muted");
  });

  it("confirms the optimistic value when the mixer reports it before the timeout", () => {
    const { rerender } = render(<MuteButton channel={1} muted={false} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByTestId(btn(1)));
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off");
    // Mixer confirms muted=true within the window.
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender(<MuteButton channel={1} muted={true} onToggle={vi.fn()} />);
    // Advancing past the window must NOT flip to Unknown — it was confirmed.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off");
    expect(screen.getByTestId(status(1)).textContent).not.toContain("Unknown");
  });

  it("falls back to Audio: Unknown if no confirmation arrives within 500ms", () => {
    render(<MuteButton channel={1} muted={false} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByTestId(btn(1)));
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off"); // optimistic
    act(() => {
      vi.advanceTimersByTime(600); // past the confirm window with no backend update
    });
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Unknown");
    expect(screen.getByTestId(btn(1)).getAttribute("data-state")).toBe("unknown");
  });

  it("shows Unknown immediately when read-back is exhausted (unreconciled prop)", () => {
    render(<MuteButton channel={3} muted={false} unreconciled onToggle={vi.fn()} />);
    expect(screen.getByTestId(status(3)).textContent).toContain("Audio: Unknown");
    expect(screen.getByTestId(btn(3)).getAttribute("data-state")).toBe("unknown");
  });

  it("reflects an external backend change without a local toggle", () => {
    const { rerender } = render(<MuteButton channel={1} muted={false} onToggle={vi.fn()} />);
    rerender(<MuteButton channel={1} muted={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off");
  });

  it("renders the Mute label", () => {
    render(<MuteButton channel={1} muted={false} onToggle={vi.fn()} />);
    expect(screen.getByText("Mute")).toBeInTheDocument();
  });
});
