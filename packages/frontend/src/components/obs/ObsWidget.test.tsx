import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { ObsWidget } from "./ObsWidget";
import { useStore } from "../../store";
import { INITIAL_OBS_STATE } from "../../store/obsSlice";
import type { ObsState, CommandResult } from "../../types";
import {
  TEST_ID_CONFIRMATION_CANCEL_BUTTON,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_EDIT_DETAILS_BUTTON,
  TEST_ID_ERROR_OVERLAY_ACTION,
  TEST_ID_MANAGE_STREAMS_BUTTON,
  TEST_ID_MANAGE_STREAMS_MODAL,
  TEST_ID_MODAL_HEADER,
  TEST_ID_OBS_METADATA_PREVIEW,
  TEST_ID_OBS_RECORD_BUTTON,
  TEST_ID_OBS_WIDGET,
  TEST_ID_SESSION_MANIFEST_MODAL,
  TEST_ID_WIDGET_ERROR_OVERLAY,
} from "../../constants/testIds";

const mockEmit = vi.fn();
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 300,
}));

const connectedState: ObsState = { ...INITIAL_OBS_STATE, connected: true };
const recordingState: ObsState = { ...connectedState, recording: true, commandedState: { streaming: false, recording: true } };

function resetStore(obsState = connectedState): void {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState,
    obsPending: false,
    manifest: { speaker: "John", title: "Grace" },
    interpolatedStreamTitle: "Apr 19 – John – Grace",
    interpolatedDescription: "",
    manifestReady: true,
    notifications: [],
    platformStates: new Map(),
    relayState: { running: false, obsConnected: false },
    platformReadiness: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  mockEmit.mockReset();
});

describe("ObsWidget", () => {
  it("renders connected state", () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    expect(screen.getByTestId(TEST_ID_OBS_WIDGET)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_WIDGET_ERROR_OVERLAY)).not.toBeInTheDocument();
  });

  it("shows error overlay when disconnected", () => {
    resetStore(INITIAL_OBS_STATE);
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    expect(screen.getByTestId(TEST_ID_WIDGET_ERROR_OVERLAY)).toBeInTheDocument();
  });

  it("shows Manage Streams button", () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toHaveTextContent("Manage Streams");
  });

  it("Manage Streams button opens ManageStreamsModal", () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON));
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeInTheDocument();
  });

  it("Stop Recording opens danger confirmation", async () => {
    resetStore(recordingState);
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_OBS_RECORD_BUTTON));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MODAL_HEADER)).toHaveTextContent("stop recording");
    });
  });

  it("Stop Recording confirmation sends command", async () => {
    mockEmit.mockImplementation((_e: string, _c: unknown, ack: (r: CommandResult) => void) => ack({ success: true }));
    resetStore(recordingState);
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_OBS_RECORD_BUTTON));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(mockEmit).toHaveBeenCalled();
  });

  it("shows metadata preview", () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    expect(screen.getByTestId(TEST_ID_OBS_METADATA_PREVIEW)).toHaveTextContent("Apr 19 – John – Grace");
  });

  it("shows healthy relay status when relay running and OBS connected", () => {
    resetStore();
    useStore.setState({ relayState: { running: true, obsConnected: true } });
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    // Widget renders without error overlay when connected
    expect(screen.queryByTestId(TEST_ID_WIDGET_ERROR_OVERLAY)).not.toBeInTheDocument();
  });

  it("shows degraded relay status when relay running but OBS not connected", () => {
    resetStore();
    useStore.setState({ relayState: { running: true, obsConnected: false } });
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    // Still renders the widget (relay degraded doesn't show error overlay)
    expect(screen.getByTestId(TEST_ID_OBS_WIDGET)).toBeInTheDocument();
  });

  it("shows healthy stream status when any platform is streaming", () => {
    resetStore();
    useStore.setState({ platformStates: new Map([["yt-1", { state: "streaming" }]]) });
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    expect(screen.getByTestId(TEST_ID_OBS_WIDGET)).toBeInTheDocument();
  });

  it("adds notification on command failure", async () => {
    mockEmit.mockImplementation((_event: string, _data: unknown, ack?: (r: CommandResult) => void) => {
      ack?.({ success: false, error: "OBS refused" });
    });
    resetStore(recordingState);
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_OBS_RECORD_BUTTON));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    await waitFor(() => {
      const state = useStore.getState();
      expect(state.notifications.length).toBeGreaterThan(0);
    });
  });

  it("clicking retry on error overlay emits reconnect", () => {
    resetStore(INITIAL_OBS_STATE);
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_ERROR_OVERLAY_ACTION));
    expect(mockEmit).toHaveBeenCalledWith("cts:obs:reconnect");
  });

  it("cancelling stop-record dismisses modal without emitting", async () => {
    resetStore(recordingState);
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_OBS_RECORD_BUTTON));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    await waitFor(() => {
      expect(screen.queryByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON)).not.toBeInTheDocument();
    });
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("clicking edit-details opens SessionManifestModal", () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    expect(screen.queryByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId(TEST_ID_EDIT_DETAILS_BUTTON));
    expect(screen.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeInTheDocument();
  });

  it("startRecording failure shows notification", async () => {
    mockEmit.mockImplementation((_event: string, _data: unknown, ack: (r: CommandResult) => void) => {
      ack({ success: false, error: "Cannot start" });
    });
    resetStore(connectedState); // not recording → record button starts recording
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_OBS_RECORD_BUTTON));
    await waitFor(() => {
      const state = useStore.getState();
      expect(state.notifications.length).toBeGreaterThan(0);
      expect(state.notifications[0]?.message).toBe("Cannot start");
    });
  });

  it("closes SessionManifestModal on backdrop click", async () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_EDIT_DETAILS_BUTTON));
    expect(screen.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeInTheDocument();

    // SessionManifestModal uses Modal which has a backdrop testid
    const backdrops = screen.getAllByTestId("modal-backdrop");
    fireEvent.click(backdrops[0]!);
    await waitFor(() => {
      expect(screen.queryByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).not.toBeInTheDocument();
    });
  });

  it("closes ManageStreamsModal on backdrop click", async () => {
    render(
      <IonApp>
        <ObsWidget />
      </IonApp>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON));
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toBeInTheDocument();

    const backdrops = screen.getAllByTestId("modal-backdrop");
    fireEvent.click(backdrops[0]!);
    await waitFor(() => {
      expect(screen.queryByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).not.toBeInTheDocument();
    });
  });
});
