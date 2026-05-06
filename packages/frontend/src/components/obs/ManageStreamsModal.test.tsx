import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManageStreamsModal } from "./ManageStreamsModal";
import { useStore } from "../../store";
import { INITIAL_OBS_STATE } from "../../store/obsSlice";
import {
  TEST_ID_MANAGE_STREAMS_MODAL,
  TEST_ID_PLATFORM_ROW,
  TEST_ID_PLATFORM_START_ALL,
  TEST_ID_PLATFORM_STOP_ALL,
  TEST_ID_PLATFORM_START_SINGLE,
  TEST_ID_PLATFORM_STOP_SINGLE,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
} from "../../constants/testIds";

const mockEmit = vi.fn();
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

function resetStore(platformStates = new Map<string, { state: string; error?: string }>(), role: "ADMIN" | "AvPowerUser" | "AvVolunteer" = "ADMIN"): void {
  useStore.setState({
    user: { id: "u1", username: "admin", role },
    obsState: { ...INITIAL_OBS_STATE, connected: true },
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
    platformStates: platformStates as ReturnType<typeof useStore.getState>["platformStates"],
    relayState: { running: false, obsConnected: false },
    platformReadiness: [{ platformType: "youtube", label: "YouTube", healthy: true, privacy: "unlisted" }],
    platformHealth: new Map(),
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

describe("ManageStreamsModal", () => {
  it("does not render when closed", () => {
    render(<ManageStreamsModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).not.toBeInTheDocument();
  });

  it("shows empty state when no platforms configured", () => {
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_MANAGE_STREAMS_MODAL)).toHaveTextContent("No streaming platforms configured");
  });

  it("renders platform rows with pretty names", () => {
    resetStore(
      new Map([
        ["youtube", { state: "idle" }],
        ["facebook", { state: "streaming" }],
      ]),
    );
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    const rows = screen.getAllByTestId(TEST_ID_PLATFORM_ROW);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("YouTube");
    expect(rows[1]).toHaveTextContent("Facebook");
  });

  it("shows privacy label for YouTube", () => {
    resetStore(new Map([["youtube", { state: "idle" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_PLATFORM_ROW)).toHaveTextContent("(Unlisted)");
  });

  it("shows Start Stream button for idle platform", () => {
    resetStore(new Map([["youtube", { state: "idle" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_PLATFORM_START_SINGLE)).toBeInTheDocument();
  });

  it("shows Stop Stream button for streaming platform", () => {
    resetStore(new Map([["youtube", { state: "streaming" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_PLATFORM_STOP_SINGLE)).toBeInTheDocument();
  });

  it("shows step-level progress message during starting", () => {
    resetStore(new Map([["youtube", { state: "starting", error: "Creating broadcast…" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_PLATFORM_ROW)).toHaveTextContent("Creating broadcast…");
  });

  it("shows error message for error state", () => {
    resetStore(new Map([["youtube", { state: "error", error: "API quota exceeded" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_PLATFORM_ROW)).toHaveTextContent("API quota exceeded");
  });

  it("disables Start All when any platform is streaming", () => {
    resetStore(new Map([["youtube", { state: "streaming" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    const btn = screen.getByTestId(TEST_ID_PLATFORM_START_ALL);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables Stop All when no platform is streaming", () => {
    resetStore(new Map([["youtube", { state: "idle" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    const btn = screen.getByTestId(TEST_ID_PLATFORM_STOP_ALL);
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends startAll command after confirmation", () => {
    resetStore(new Map([["youtube", { state: "idle" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_START_ALL));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(mockEmit).toHaveBeenCalledWith("cts:platform:command", { type: "startAll" });
  });

  it("sends stopAll command after confirmation", () => {
    resetStore(new Map([["youtube", { state: "streaming" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_STOP_ALL));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(mockEmit).toHaveBeenCalledWith("cts:platform:command", { type: "stopAll" });
  });

  it("sends startPlatform command for individual start after confirmation", () => {
    resetStore(new Map([["youtube", { state: "idle" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_START_SINGLE));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(mockEmit).toHaveBeenCalledWith("cts:platform:command", { type: "startPlatform", platformType: "youtube" });
  });

  it("sends stopPlatform command for individual stop after confirmation", () => {
    resetStore(new Map([["youtube", { state: "streaming" }]]));
    render(<ManageStreamsModal isOpen={true} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_STOP_SINGLE));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(mockEmit).toHaveBeenCalledWith("cts:platform:command", { type: "stopPlatform", platformType: "youtube" });
  });
});
