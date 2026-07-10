import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { ActiveCountdown } from "./ActiveCountdown";
import { TEST_ID_LT_COUNTDOWN } from "../../constants/testIds";

describe("ActiveCountdown", () => {
  it("renders countdown with remaining seconds", () => {
    const future = new Date(Date.now() + 10000).toISOString();
    render(<ActiveCountdown autoDismissAt={future} />);
    expect(screen.getByTestId(TEST_ID_LT_COUNTDOWN)).toBeInTheDocument();
    expect(screen.getByText("10s")).toBeInTheDocument();
  });

  it("renders 0s when target is in the past", () => {
    const past = new Date(Date.now() - 5000).toISOString();
    render(<ActiveCountdown autoDismissAt={past} />);
    expect(screen.getByText("0s")).toBeInTheDocument();
  });

  it("updates countdown over time", () => {
    vi.useFakeTimers();
    const future = new Date(Date.now() + 5000).toISOString();
    const { rerender } = render(<ActiveCountdown autoDismissAt={future} />);
    expect(screen.getByText("5s")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    rerender(<ActiveCountdown autoDismissAt={future} />);
    expect(screen.getByText("4s")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
