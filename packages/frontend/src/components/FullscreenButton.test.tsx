import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FullscreenButton } from "./FullscreenButton";
import "../test/ionicMocks";
import { TEST_ID_FULLSCREEN_BUTTON } from "../constants/testIds";

describe("FullscreenButton", () => {
  let originalFullscreenEnabled: boolean;
  let originalFullscreenElement: Element | null;
  let originalRequestFullscreen: () => Promise<void>;
  let originalExitFullscreen: () => Promise<void>;

  beforeEach(() => {
    originalFullscreenEnabled = document.fullscreenEnabled;
    originalFullscreenElement = document.fullscreenElement;
    originalRequestFullscreen = document.documentElement.requestFullscreen;
    originalExitFullscreen = document.exitFullscreen;

    // Default: fullscreen supported, not in fullscreen
    Object.defineProperty(document, "fullscreenEnabled", { value: true, writable: true, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { value: null, writable: true, configurable: true });
    document.documentElement.requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.exitFullscreen = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    Object.defineProperty(document, "fullscreenEnabled", { value: originalFullscreenEnabled, configurable: true });
    Object.defineProperty(document, "fullscreenElement", { value: originalFullscreenElement, configurable: true });
    document.documentElement.requestFullscreen = originalRequestFullscreen;
    document.exitFullscreen = originalExitFullscreen;
  });

  it("renders when fullscreenEnabled is true", () => {
    render(<FullscreenButton />);
    expect(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toBeInTheDocument();
  });

  it("returns null when fullscreenEnabled is false", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
    const { container } = render(<FullscreenButton />);
    expect(container.innerHTML).toBe("");
  });

  it("has aria-label 'Enter fullscreen' when not in fullscreen", () => {
    render(<FullscreenButton />);
    expect(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toHaveAttribute("aria-label", "Enter fullscreen");
  });

  it("calls requestFullscreen on click when not in fullscreen", async () => {
    const user = userEvent.setup();
    render(<FullscreenButton />);
    await user.click(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON));
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });

  it("calls exitFullscreen on click when in fullscreen", async () => {
    const user = userEvent.setup();
    Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
    // Simulate fullscreenchange event so state updates
    render(<FullscreenButton />);
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    await user.click(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON));
    expect(document.exitFullscreen).toHaveBeenCalled();
  });

  it("updates icon on fullscreenchange event (external exit)", () => {
    render(<FullscreenButton />);

    // Simulate entering fullscreen externally
    Object.defineProperty(document, "fullscreenElement", { value: document.documentElement, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toHaveAttribute("aria-label", "Exit fullscreen");

    // Simulate exiting fullscreen externally (Escape key)
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
    act(() => {
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    expect(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toHaveAttribute("aria-label", "Enter fullscreen");
  });

  it("handles requestFullscreen rejection gracefully (no throw)", async () => {
    const user = userEvent.setup();
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error("Not allowed"));
    render(<FullscreenButton />);
    // Should not throw
    await user.click(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON));
    // Icon should remain unchanged (still "Enter fullscreen")
    expect(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toHaveAttribute("aria-label", "Enter fullscreen");
  });
});
