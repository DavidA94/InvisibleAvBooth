import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MuteButton } from "./MuteButton";
import { TEST_ID_OBS_PREVIEW_MUTE_BTN } from "../../constants/testIds";

describe("MuteButton", () => {
  it("shows unmute label when muted", () => {
    render(<MuteButton muted={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN)).toHaveAttribute("aria-label", "Unmute Local Audio");
  });

  it("shows mute label when unmuted", () => {
    render(<MuteButton muted={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN)).toHaveAttribute("aria-label", "Mute Local Audio");
  });

  it("calls onToggle when clicked", () => {
    const onToggle = vi.fn();
    render(<MuteButton muted={true} onToggle={onToggle} />);
    fireEvent.click(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN));
    expect(onToggle).toHaveBeenCalled();
  });
});
