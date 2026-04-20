import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsWidget } from "./ObsWidget";
import { useStore } from "../../store";
import { INITIAL_OBS_STATE } from "../../store/obsSlice";
import type { ObsState, CommandResult } from "../../types";

const mockEmit = vi.fn();
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 300,
}));

const connectedState: ObsState = { ...INITIAL_OBS_STATE, connected: true };
const liveState: ObsState = { ...connectedState, streaming: true, commandedState: { streaming: true, recording: false } };
const recordingState: ObsState = { ...connectedState, recording: true, commandedState: { streaming: false, recording: true } };

function resetStore(obsState = connectedState): void {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState,
    obsPending: false,
    manifest: { speaker: "John", title: "Grace" },
    interpolatedStreamTitle: "Apr 19 – John – Grace",
    notifications: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("ObsWidget", () => {
  it("renders connected state", () => {
    render(<ObsWidget />);
    expect(screen.getByTestId("obs-widget")).toBeInTheDocument();
    expect(screen.queryByTestId("widget-error-overlay")).not.toBeInTheDocument();
  });

  it("shows error overlay when disconnected", () => {
    resetStore(INITIAL_OBS_STATE);
    render(<ObsWidget />);
    expect(screen.getByTestId("widget-error-overlay")).toBeInTheDocument();
  });

  it("Start Stream opens confirmation modal", () => {
    render(<ObsWidget />);
    fireEvent.click(screen.getByTestId("obs-stream-btn"));
    expect(screen.getByTestId("confirmation-modal")).toBeInTheDocument();
    expect(screen.getByTestId("confirmation-title")).toHaveTextContent("Begin Stream");
  });

  it("Start Stream confirmation sends command", () => {
    mockEmit.mockImplementation((_e: string, _c: unknown, ack: (r: CommandResult) => void) => ack({ success: true }));
    render(<ObsWidget />);
    fireEvent.click(screen.getByTestId("obs-stream-btn"));
    fireEvent.click(screen.getByTestId("confirmation-confirm-btn"));
    expect(mockEmit).toHaveBeenCalled();
  });

  it("Stop Stream opens danger confirmation", () => {
    resetStore(liveState);
    render(<ObsWidget />);
    fireEvent.click(screen.getByTestId("obs-stream-btn"));
    expect(screen.getByTestId("confirmation-title")).toHaveTextContent("stop the stream");
  });

  it("Stop Recording opens danger confirmation", () => {
    resetStore(recordingState);
    render(<ObsWidget />);
    fireEvent.click(screen.getByTestId("obs-record-btn"));
    expect(screen.getByTestId("confirmation-title")).toHaveTextContent("stop recording");
  });

  it("disabled Start Stream opens manifest modal when metadata missing", () => {
    useStore.setState({ manifest: {}, interpolatedStreamTitle: "" });
    render(<ObsWidget />);
    fireEvent.click(screen.getByTestId("obs-stream-btn"));
    expect(screen.getByTestId("session-manifest-modal")).toBeInTheDocument();
  });

  it("shows metadata preview", () => {
    render(<ObsWidget />);
    expect(screen.getByTestId("obs-metadata-preview")).toHaveTextContent("Apr 19 – John – Grace");
  });
});
