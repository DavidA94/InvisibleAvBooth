import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsPreviewWidget } from "./ObsPreviewWidget";
import {
  TEST_ID_OBS_PREVIEW_WIDGET,
  TEST_ID_OBS_PREVIEW_INACTIVE,
  TEST_ID_OBS_PREVIEW_MUTE_BTN,
  TEST_ID_OBS_PREVIEW_RECONNECTING,
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
});
