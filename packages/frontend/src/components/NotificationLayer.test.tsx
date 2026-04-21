import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { IonApp } from "@ionic/react";
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
});

function renderLayer(): ReturnType<typeof render> {
  return render(
    <IonApp>
      <NotificationLayer />
    </IonApp>,
  );
}

describe("NotificationLayer - Toast", () => {
  it("removes toast notification from store after presentation", async () => {
    vi.useFakeTimers();
    renderLayer();
    act(() => {
      useStore.getState().addNotification({ id: "t1", level: "toast", severity: "info", message: "Connected" });
    });
    // Toast auto-dismisses after TOAST_DURATION — the onDidDismiss callback removes it from store
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(useStore.getState().notifications.find((n) => n.id === "t1")).toBeUndefined();
    vi.useRealTimers();
  });
});

describe("NotificationLayer - Banner", () => {
  it("shows banner with correct counter", () => {
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    useStore.getState().addNotification({ id: "b2", level: "banner", severity: "error", message: "Error 2" });
    renderLayer();
    expect(screen.getByTestId("banner-counter")).toHaveTextContent("1 of 2");
  });

  it("banner navigation cycles through errors", () => {
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    useStore.getState().addNotification({ id: "b2", level: "banner", severity: "error", message: "Error 2" });
    renderLayer();
    expect(screen.getByTestId("notification-banner")).toHaveTextContent("Error 1");
    fireEvent.click(screen.getByText("▶"));
    expect(screen.getByTestId("notification-banner")).toHaveTextContent("Error 2");
  });

  it("banner dismiss removes notification", () => {
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    renderLayer();
    fireEvent.click(screen.getByTestId("banner-dismiss"));
    expect(useStore.getState().notifications).toHaveLength(0);
  });
});

describe("NotificationLayer - Modal", () => {
  it("modal requires acknowledgment", () => {
    useStore.getState().addNotification({ id: "m1", level: "modal", severity: "error", message: "Critical" });
    renderLayer();
    expect(screen.getByTestId("notification-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Acknowledge"));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("modal auto-clears on resolution (removeNotification)", () => {
    useStore.getState().addNotification({ id: "m1", level: "modal", severity: "error", message: "OBS disconnected", errorCode: "OBS_UNREACHABLE" });
    renderLayer();
    expect(screen.getByTestId("notification-modal")).toBeInTheDocument();
    act(() => {
      useStore.getState().removeNotification("m1");
    });
    expect(screen.queryByTestId("notification-modal")).not.toBeInTheDocument();
  });
});
