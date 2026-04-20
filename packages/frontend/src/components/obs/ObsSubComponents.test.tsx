import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsStatusBar } from "./ObsStatusBar";
import { ObsMetadataPreview } from "./ObsMetadataPreview";
import { ObsControls } from "./ObsControls";
import { INITIAL_OBS_STATE } from "../../store/obsSlice";
import type { ObsState } from "../../types";

const liveState: ObsState = {
  ...INITIAL_OBS_STATE,
  connected: true,
  streaming: true,
  streamTimecode: "00:14:32",
  commandedState: { streaming: true, recording: false },
};
const recordingState: ObsState = { ...INITIAL_OBS_STATE, connected: true, recording: true, commandedState: { streaming: false, recording: true } };

describe("ObsStatusBar", () => {
  it("shows LIVE when streaming", () => {
    render(<ObsStatusBar obsState={liveState} />);
    expect(screen.getByTestId("stream-status")).toHaveTextContent("LIVE");
  });

  it("shows Offline when not streaming", () => {
    render(<ObsStatusBar obsState={INITIAL_OBS_STATE} />);
    expect(screen.getByTestId("stream-status")).toHaveTextContent("Offline");
  });

  it("shows timecode when streaming", () => {
    render(<ObsStatusBar obsState={liveState} />);
    expect(screen.getByTestId("stream-timecode")).toHaveTextContent("00:14:32");
  });

  it("shows recording indicator when recording", () => {
    render(<ObsStatusBar obsState={recordingState} />);
    expect(screen.getByTestId("recording-indicator")).toBeInTheDocument();
  });
});

describe("ObsMetadataPreview", () => {
  it("shows interpolated title", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Apr 19 – John – Grace" onEditDetails={vi.fn()} />);
    expect(screen.getByTestId("obs-metadata-preview")).toHaveTextContent("Apr 19 – John – Grace");
  });

  it("shows empty state when no details", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="" onEditDetails={vi.fn()} />);
    expect(screen.getByTestId("obs-metadata-preview")).toHaveTextContent("No session details set");
  });

  it("pencil button fires onEditDetails", () => {
    const onEdit = vi.fn();
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" onEditDetails={onEdit} />);
    fireEvent.click(screen.getByTestId("edit-details-btn"));
    expect(onEdit).toHaveBeenCalledOnce();
  });
});

describe("ObsControls", () => {
  it("shows Start Stream when not streaming", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={false}
        onStartStream={vi.fn()}
        onStopStream={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId("obs-stream-btn")).toHaveTextContent("Start Stream");
  });

  it("shows Stop Stream when streaming", () => {
    render(
      <ObsControls
        obsState={liveState}
        isPending={false}
        onStartStream={vi.fn()}
        onStopStream={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId("obs-stream-btn")).toHaveTextContent("Stop Stream");
  });

  it("disables buttons when pending", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={true}
        onStartStream={vi.fn()}
        onStopStream={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId("obs-stream-btn")).toHaveAttribute("disabled", "true");
    expect(screen.getByTestId("obs-record-btn")).toHaveAttribute("disabled", "true");
  });

  it("shows disabled reason as subtext in button", () => {
    render(
      <ObsControls
        obsState={INITIAL_OBS_STATE}
        isPending={false}
        streamDisabledReason="Enter metadata"
        onStartStream={vi.fn()}
        onStopStream={vi.fn()}
        onStartRecording={vi.fn()}
        onStopRecording={vi.fn()}
      />,
    );
    expect(screen.getByTestId("stream-disabled-reason")).toHaveTextContent("Enter metadata");
  });
});
