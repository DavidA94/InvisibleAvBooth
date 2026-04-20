import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { NotificationLayer } from "./NotificationLayer";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

function resetStore(): void {
  useStore.setState({
    user: null,
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.useFakeTimers();
});

describe("NotificationLayer", () => {
  it("toast auto-dismisses after 5s", async () => {
    useStore.getState().addNotification({ id: "t1", level: "toast", severity: "info", message: "Connected" });
    render(<NotificationLayer />);
    expect(screen.getByTestId("notification-toast")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.queryByTestId("notification-toast")).not.toBeInTheDocument();
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("banner shows correct counter", () => {
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    useStore.getState().addNotification({ id: "b2", level: "banner", severity: "error", message: "Error 2" });
    render(<NotificationLayer />);
    expect(screen.getByTestId("banner-counter")).toHaveTextContent("1 of 2");
  });

  it("banner navigation cycles through errors", () => {
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    useStore.getState().addNotification({ id: "b2", level: "banner", severity: "error", message: "Error 2" });
    render(<NotificationLayer />);
    expect(screen.getByTestId("notification-banner")).toHaveTextContent("Error 1");
    fireEvent.click(screen.getByText("▶"));
    expect(screen.getByTestId("notification-banner")).toHaveTextContent("Error 2");
  });

  it("banner dismiss removes notification", () => {
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    render(<NotificationLayer />);
    fireEvent.click(screen.getByTestId("banner-dismiss"));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("modal requires acknowledgment", () => {
    useStore.getState().addNotification({ id: "m1", level: "modal", severity: "error", message: "Critical" });
    render(<NotificationLayer />);
    expect(screen.getByTestId("notification-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Acknowledge"));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("modal auto-clears on resolution (removeNotification)", () => {
    useStore.getState().addNotification({ id: "m1", level: "modal", severity: "error", message: "OBS disconnected", errorCode: "OBS_UNREACHABLE" });
    render(<NotificationLayer />);
    expect(screen.getByTestId("notification-modal")).toBeInTheDocument();

    act(() => {
      useStore.getState().removeNotification("m1");
    });

    expect(screen.queryByTestId("notification-modal")).not.toBeInTheDocument();
  });
});
