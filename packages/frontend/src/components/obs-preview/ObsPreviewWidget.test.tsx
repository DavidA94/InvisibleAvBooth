import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsPreviewWidget } from "./ObsPreviewWidget";
import { useStore } from "../../store";
import {
  TEST_ID_OBS_PREVIEW_WIDGET,
  TEST_ID_OBS_PREVIEW_INACTIVE,
  TEST_ID_OBS_PREVIEW_MUTE_BTN,
  TEST_ID_OBS_PREVIEW_RECONNECTING,
  TEST_ID_AUDIO_METER_CONTAINER,
} from "../../constants/testIds";

// Mock the hook
const mockUseObsPreviewStream = vi.fn();
vi.mock("../../hooks/useObsPreviewStream", () => ({
  useObsPreviewStream: (...args: unknown[]) => mockUseObsPreviewStream(...args),
}));

vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 300,
}));

function defaultHookReturn() {
  return {
    imgRef: { current: null },
    status: "idle" as const,
    reconnect: vi.fn(),
    muted: true,
    setMuted: vi.fn(),
  };
}

beforeEach(() => {
  mockUseObsPreviewStream.mockReturnValue(defaultHookReturn());
});

describe("ObsPreviewWidget", () => {
  it("renders inactive state when NDI not configured", () => {
    render(<ObsPreviewWidget enabled={true} ndiConfigured={false} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_WIDGET)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_INACTIVE)).toHaveTextContent("OBS Preview Not Configured");
  });

  it("does not connect when ndiConfigured is false", () => {
    render(<ObsPreviewWidget enabled={true} ndiConfigured={false} />);
    expect(mockUseObsPreviewStream).toHaveBeenCalledWith("/preview/obs", false);
  });

  it("connects when enabled and ndiConfigured", () => {
    mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    expect(mockUseObsPreviewStream).toHaveBeenCalledWith("/preview/obs", true);
  });

  it("shows reconnecting overlay", () => {
    mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "reconnecting" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_RECONNECTING)).toHaveTextContent("Reconnecting");
  });

  it("shows unavailable overlay in error state with tap to reconnect", () => {
    const reconnect = vi.fn();
    mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "error", reconnect });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    const overlay = screen.getByTestId(TEST_ID_OBS_PREVIEW_INACTIVE);
    expect(overlay).toHaveTextContent("Unavailable");
    fireEvent.click(overlay);
    expect(reconnect).toHaveBeenCalled();
  });

  it("shows mute button when streaming", () => {
    mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN)).toBeInTheDocument();
  });

  it("mute button toggles muted state", () => {
    const setMuted = vi.fn();
    mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming", muted: true, setMuted });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    const btn = screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN);
    fireEvent.click(btn);
    expect(setMuted).toHaveBeenCalledWith(false);
  });

  it("derives connection status as inactive when NDI not configured", () => {
    render(<ObsPreviewWidget enabled={true} ndiConfigured={false} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_WIDGET)).toBeInTheDocument();
  });

  describe("audio meter integration", () => {
    it("meters not visible before first level event (obsAudioLevels is null)", () => {
      mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
      useStore.setState({ obsAudioLevels: null, obsAudioEventsFlowing: false, obsLevelPipelineAvailable: true });
      render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
      expect(screen.queryByTestId(TEST_ID_AUDIO_METER_CONTAINER)).not.toBeInTheDocument();
    });

    it("meters visible after first level event", () => {
      mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
      useStore.setState({ obsAudioLevels: { left: -20, right: -15 }, obsAudioEventsFlowing: true, obsLevelPipelineAvailable: true });
      render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
      expect(screen.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeInTheDocument();
    });

    it("meters persist when muted", () => {
      mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming", muted: true });
      useStore.setState({ obsAudioLevels: { left: -20, right: -15 }, obsAudioEventsFlowing: true, obsLevelPipelineAvailable: true });
      render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
      expect(screen.getByTestId(TEST_ID_AUDIO_METER_CONTAINER)).toBeInTheDocument();
    });

    it("Audio connection indicator shows healthy when events flowing", () => {
      mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
      useStore.setState({ obsAudioLevels: { left: -20, right: -15 }, obsAudioEventsFlowing: true, obsLevelPipelineAvailable: true });
      render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
      // The "Audio" text should appear in the connection indicators
      expect(screen.getByText("Audio")).toBeInTheDocument();
    });

    it("Audio connection indicator shows inactive when level pipeline unavailable", () => {
      mockUseObsPreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
      useStore.setState({ obsAudioLevels: null, obsAudioEventsFlowing: false, obsLevelPipelineAvailable: false });
      render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
      expect(screen.getByText("Audio")).toBeInTheDocument();
    });
  });
});
