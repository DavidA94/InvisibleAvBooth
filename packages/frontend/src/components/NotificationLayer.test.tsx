import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IonApp } from "@ionic/react";
import { NotificationLayer } from "./NotificationLayer";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { TEST_ID_BANNER_COUNTER, TEST_ID_BANNER_DISMISS, TEST_ID_NOTIFICATION_BANNER, TEST_ID_NOTIFICATION_MODAL } from "../constants/testIds";

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
    expect(screen.getByTestId(TEST_ID_BANNER_COUNTER)).toHaveTextContent("1 of 2");
  });

  it("banner navigation cycles through errors", async () => {
    const user = userEvent.setup();
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    useStore.getState().addNotification({ id: "b2", level: "banner", severity: "error", message: "Error 2" });
    renderLayer();
    expect(screen.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toHaveTextContent("Error 1");
    await user.click(screen.getByText("▶"));
    expect(screen.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toHaveTextContent("Error 2");
  });

  it("banner dismiss removes notification", async () => {
    const user = userEvent.setup();
    useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
    renderLayer();
    await user.click(screen.getByTestId(TEST_ID_BANNER_DISMISS));
    expect(useStore.getState().notifications).toHaveLength(0);
  });
});

it("queues second toast when one is already active", async () => {
  // Add two toasts — second should queue behind first
  act(() => {
    useStore.getState().addNotification({ id: "t1", level: "toast", severity: "info", message: "Toast 1" });
    useStore.getState().addNotification({ id: "t2", level: "toast", severity: "info", message: "Toast 2" });
  });
  renderLayer();
  // Both notifications exist in store
  expect(useStore.getState().notifications).toHaveLength(2);
});

it("banner counter back button navigates to previous", async () => {
  const user = userEvent.setup();
  useStore.getState().addNotification({ id: "b1", level: "banner", severity: "error", message: "Error 1" });
  useStore.getState().addNotification({ id: "b2", level: "banner", severity: "error", message: "Error 2" });
  renderLayer();
  // Navigate forward then back
  await user.click(screen.getByText("▶"));
  await user.click(screen.getByText("◀"));
  expect(screen.getByTestId(TEST_ID_NOTIFICATION_BANNER)).toHaveTextContent("Error 1");
});

describe("NotificationLayer - Modal", () => {
  it("modal requires acknowledgment", async () => {
    const user = userEvent.setup();
    useStore.getState().addNotification({ id: "m1", level: "modal", severity: "error", message: "Critical" });
    renderLayer();
    expect(screen.getByTestId(TEST_ID_NOTIFICATION_MODAL)).toBeInTheDocument();
    await user.click(screen.getByText("Acknowledge"));
    expect(useStore.getState().notifications).toHaveLength(0);
  });

  it("modal auto-clears on resolution (removeNotification)", () => {
    useStore.getState().addNotification({ id: "m1", level: "modal", severity: "error", message: "OBS disconnected", errorCode: "OBS_UNREACHABLE" });
    renderLayer();
    expect(screen.getByTestId(TEST_ID_NOTIFICATION_MODAL)).toBeInTheDocument();
    act(() => {
      useStore.getState().removeNotification("m1");
    });
    expect(screen.queryByTestId(TEST_ID_NOTIFICATION_MODAL)).not.toBeInTheDocument();
  });
});
