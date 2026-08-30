import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MuteButton } from "./MuteButton";
import { TEST_ID_MIXER_MUTE_BUTTON, TEST_ID_MIXER_MUTE_STATUS } from "../../constants/testIds";

const btn = (channel: number): string => `${TEST_ID_MIXER_MUTE_BUTTON}-${channel}`;
const status = (channel: number): string => `${TEST_ID_MIXER_MUTE_STATUS}-${channel}`;

describe("MuteButton", () => {
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

  it("emits the desired mute state and enters Unknown immediately on toggle (not optimistic)", () => {
    const onToggle = vi.fn();
    render(<MuteButton channel={1} muted={false} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId(btn(1)));
    expect(onToggle).toHaveBeenCalledWith(true);
    // Never shows a false "Audio: Off" before the mixer confirms — shows Unknown.
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Unknown");
    expect(screen.getByTestId(btn(1)).getAttribute("data-state")).toBe("unknown");
  });

  it("resolves to the mixer-reported value once the backend confirms", () => {
    const { rerender } = render(<MuteButton channel={1} muted={false} onToggle={vi.fn()} />);
    fireEvent.click(screen.getByTestId(btn(1)));
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Unknown");
    // Mixer confirms muted=true.
    rerender(<MuteButton channel={1} muted={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId(status(1)).textContent).toContain("Audio: Off");
  });

  it("shows Unknown when read-back is exhausted (unreconciled prop)", () => {
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
