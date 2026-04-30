import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { IonApp } from "@ionic/react";
import { ObsWidget } from "./ObsWidget";
import { useStore } from "../../store";
import { INITIAL_OBS_STATE } from "../../store/obsSlice";
import type { ObsState, CommandResult } from "../../types";
import {
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_MANAGE_STREAMS_BUTTON,
  TEST_ID_MANAGE_STREAMS_MODAL,
  TEST_ID_MODAL_HEADER,
  TEST_ID_OBS_METADATA_PREVIEW,
  TEST_ID_OBS_RECORD_BUTTON,
  TEST_ID_OBS_WIDGET,
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
    notifications: [],
    platformStates: new Map(),
    relayState: { running: false, obsConnected: false },
    platformReadiness: false,
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
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
});
