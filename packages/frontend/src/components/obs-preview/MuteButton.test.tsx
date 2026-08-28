import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MuteButton } from "./MuteButton";
import { TEST_ID_OBS_PREVIEW_MUTE_BUTTON } from "../../constants/testIds";

describe("MuteButton", () => {
  it("shows unmute label when muted", () => {
    render(<MuteButton muted={true} onToggle={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BUTTON)).toHaveAttribute("aria-label", "Unmute Local Audio");
  });

  it("shows mute label when unmuted", () => {
    render(<MuteButton muted={false} onToggle={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BUTTON)).toHaveAttribute("aria-label", "Mute Local Audio");
  });

  it("calls onToggle when clicked", async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<MuteButton muted={true} onToggle={onToggle} />);
    await user.click(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BUTTON));
    expect(onToggle).toHaveBeenCalled();
  });
});
