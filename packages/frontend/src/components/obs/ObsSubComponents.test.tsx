import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsStatusBar } from "./ObsStatusBar";
import { ObsMetadataPreview } from "./ObsMetadataPreview";
import { ObsControls } from "./ObsControls";
import { INITIAL_OBS_STATE } from "../../store/obsSlice";
import { useStore } from "../../store";
import type { ObsState } from "../../types";
import { TEST_ID_EDIT_DETAILS_BUTTON, TEST_ID_MANAGE_STREAMS_BUTTON, TEST_ID_OBS_METADATA_PREVIEW, TEST_ID_OBS_RECORD_BUTTON, TEST_ID_RECORDING_INDICATOR, TEST_ID_STREAM_STATUS, TEST_ID_STREAM_TIMECODE } from "../../constants/testIds";

const mockEmit = vi.fn();
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

const liveState: ObsState = {
  ...INITIAL_OBS_STATE,
  connected: true,
  streaming: true,
  streamTimecode: "00:14:32",
  commandedState: { streaming: true, recording: false },
};
const recordingState: ObsState = { ...INITIAL_OBS_STATE, connected: true, recording: true, commandedState: { streaming: false, recording: true } };

function resetPlatformStore(platformStates = new Map()): void {
  useStore.setState({
    platformStates: platformStates as ReturnType<typeof useStore.getState>["platformStates"],
    relayState: { running: false, obsConnected: false },
    platformReadiness: false,
  });
}

beforeEach(() => {
  resetPlatformStore();
});

describe("ObsStatusBar", () => {
  it("shows LIVE when streaming", () => {
    render(<ObsStatusBar obsState={liveState} />);
    expect(screen.getByTestId(TEST_ID_STREAM_STATUS)).toHaveTextContent("LIVE");
  });

  it("shows Offline when not streaming", () => {
    render(<ObsStatusBar obsState={INITIAL_OBS_STATE} />);
    expect(screen.getByTestId(TEST_ID_STREAM_STATUS)).toHaveTextContent("Offline");
  });

  it("shows timecode when streaming", () => {
    render(<ObsStatusBar obsState={liveState} />);
    expect(screen.getByTestId(TEST_ID_STREAM_TIMECODE)).toHaveTextContent("00:14:32");
  });

  it("shows recording indicator when recording", () => {
    render(<ObsStatusBar obsState={recordingState} />);
    expect(screen.getByTestId(TEST_ID_RECORDING_INDICATOR)).toBeInTheDocument();
  });

  it("shows Going Live when any platform is starting", () => {
    resetPlatformStore(new Map([["YouTube", { state: "starting" }]]));
    render(<ObsStatusBar obsState={INITIAL_OBS_STATE} />);
    expect(screen.getByTestId(TEST_ID_STREAM_STATUS)).toHaveTextContent("Going Live…");
  });

  it("shows Stopping when any platform is stopping", () => {
    resetPlatformStore(new Map([["YouTube", { state: "stopping" }]]));
    render(<ObsStatusBar obsState={INITIAL_OBS_STATE} />);
    expect(screen.getByTestId(TEST_ID_STREAM_STATUS)).toHaveTextContent("Stopping…");
  });
});

describe("ObsMetadataPreview", () => {
  it("shows interpolated title", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Apr 19 – John – Grace" onEditDetails={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_OBS_METADATA_PREVIEW)).toHaveTextContent("Apr 19 – John – Grace");
  });

  it("shows empty state when no details", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="" onEditDetails={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_OBS_METADATA_PREVIEW)).toHaveTextContent("No session details set");
  });

  it("pencil button fires onEditDetails", () => {
    const onEdit = vi.fn();
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" onEditDetails={onEdit} />);
    fireEvent.click(screen.getByTestId(TEST_ID_EDIT_DETAILS_BUTTON));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

describe("ObsControls", () => {
  it("shows Manage Streams button", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={false}
        manifestReady={true}
        onManageStreams={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toHaveTextContent("Manage Streams");
  });

  it("calls onManageStreams when clicked", () => {
    const onManage = vi.fn();
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={false}
        manifestReady={true}
        onManageStreams={onManage}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON));
    expect(onManage).toHaveBeenCalledOnce();
  });

  it("disables buttons when pending", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={true}
        manifestReady={true}
        onManageStreams={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    const manageButton = screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON);
    const recordButton = screen.getByTestId(TEST_ID_OBS_RECORD_BUTTON);
    expect((manageButton as HTMLElement & { disabled: boolean }).disabled).toBe(true);
    expect((recordButton as HTMLElement & { disabled: boolean }).disabled).toBe(true);
  });

  it("shows sub-label when manifest not ready", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={false}
        manifestReady={false}
        onManageStreams={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).toHaveTextContent("Enter metadata");
  });

  it("does not show sub-label when manifest ready", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={false}
        manifestReady={true}
        onManageStreams={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_BUTTON)).not.toHaveTextContent("Enter metadata");
  });
});
