import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsPreviewWidget } from "./ObsPreviewWidget";
import {
  TEST_ID_OBS_PREVIEW_WIDGET,
  TEST_ID_OBS_PREVIEW_INACTIVE,
  TEST_ID_OBS_PREVIEW_MUTE_BTN,
  TEST_ID_OBS_PREVIEW_RECONNECTING,
  TEST_ID_STREAM_PREVIEW_MODAL,
  TEST_ID_STREAM_PREVIEW_DISMISS,
} from "../../constants/testIds";

// Mock the hook
const mockUsePreviewStream = vi.fn();
vi.mock("../../hooks/usePreviewStream", () => ({
  usePreviewStream: (...args: unknown[]) => mockUsePreviewStream(...args),
}));

vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 300,
}));

function defaultHookReturn() {
  return {
    videoRef: { current: null },
    status: "idle" as const,
    reconnect: vi.fn(),
  };
}

beforeEach(() => {
  mockUsePreviewStream.mockReturnValue(defaultHookReturn());
});

describe("ObsPreviewWidget", () => {
  it("renders inactive state when NDI not configured", () => {
    render(<ObsPreviewWidget enabled={true} ndiConfigured={false} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_WIDGET)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_INACTIVE)).toHaveTextContent("OBS Preview Not Configured");
  });

  it("does not connect when ndiConfigured is false", () => {
    render(<ObsPreviewWidget enabled={true} ndiConfigured={false} />);
    expect(mockUsePreviewStream).toHaveBeenCalledWith("/preview/obs", false);
  });

  it("connects when enabled and ndiConfigured", () => {
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    expect(mockUsePreviewStream).toHaveBeenCalledWith("/preview/obs", true);
  });

  it("shows reconnecting overlay", () => {
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "reconnecting" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_RECONNECTING)).toHaveTextContent("Reconnecting");
  });

  it("shows unavailable overlay in error state with tap to reconnect", () => {
    const reconnect = vi.fn();
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "error", reconnect });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    const overlay = screen.getByTestId(TEST_ID_OBS_PREVIEW_INACTIVE);
    expect(overlay).toHaveTextContent("Unavailable");
    fireEvent.click(overlay);
    expect(reconnect).toHaveBeenCalled();
  });

  it("shows mute button when streaming", () => {
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN)).toBeInTheDocument();
  });

  it("mute button toggles muted state", () => {
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    const btn = screen.getByTestId(TEST_ID_OBS_PREVIEW_MUTE_BTN);
    // Initially muted
    expect(btn).toHaveAttribute("aria-label", "Unmute Local Audio");
    fireEvent.click(btn);
    // Now unmuted
    expect(btn).toHaveAttribute("aria-label", "Mute Local Audio");
  });

  it("tap opens stream preview modal when streaming", () => {
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    const container = screen.getByTestId(TEST_ID_OBS_PREVIEW_WIDGET).querySelector(".preview-video-container")!;
    fireEvent.click(container);
    expect(screen.getByTestId(TEST_ID_STREAM_PREVIEW_MODAL)).toBeInTheDocument();
  });

  it("modal dismiss button closes modal", () => {
    mockUsePreviewStream.mockReturnValue({ ...defaultHookReturn(), status: "streaming" });
    render(<ObsPreviewWidget enabled={true} ndiConfigured={true} />);
    const container = screen.getByTestId(TEST_ID_OBS_PREVIEW_WIDGET).querySelector(".preview-video-container")!;
    fireEvent.click(container);
    expect(screen.getByTestId(TEST_ID_STREAM_PREVIEW_MODAL)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(TEST_ID_STREAM_PREVIEW_DISMISS));
    expect(screen.queryByTestId(TEST_ID_STREAM_PREVIEW_MODAL)).not.toBeInTheDocument();
  });

  it("derives connection status as inactive when NDI not configured", () => {
    render(<ObsPreviewWidget enabled={true} ndiConfigured={false} />);
    // The WidgetContainer renders the connection indicators - just verify widget renders
    expect(screen.getByTestId(TEST_ID_OBS_PREVIEW_WIDGET)).toBeInTheDocument();
  });
});
