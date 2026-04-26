import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SessionManifestModal } from "./SessionManifestModal";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { CTS_SESSION_MANIFEST_UPDATE } from "@invisible-av-booth/shared";
import type { CommandResult } from "../types";
import { TEST_ID_MANIFEST_CANCEL, TEST_ID_MANIFEST_CLEAR, TEST_ID_MANIFEST_PREVIEW, TEST_ID_MANIFEST_SAVE, TEST_ID_MANIFEST_SAVE_ERROR, TEST_ID_SCRIPTURE_BOOK_SELECT, TEST_ID_SESSION_MANIFEST_MODAL } from "../constants/testIds";

const mockEmit = vi.fn();
vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function resetStore(): void {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

const onClose = vi.fn();

describe("SessionManifestModal", () => {
  it("renders when open", () => {
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<SessionManifestModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).not.toBeInTheDocument();
  });

  it("shows live preview computed from form state", () => {
    useStore.setState({ manifest: { speaker: "John", title: "Grace" } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    // Preview is computed locally from form fields
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("John");
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("Grace");
  });

  it("shows placeholder text in preview when fields empty", () => {
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("[No Speaker]");
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("[No Title]");
  });

  it("scripture book dropdown is rendered", () => {
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_SCRIPTURE_BOOK_SELECT)).toBeInTheDocument();
  });

  it("Save emits socket event with ack", () => {
    mockEmit.mockImplementation((_event: string, _patch: unknown, ack: (result: CommandResult) => void) => {
      ack({ success: true });
    });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_SAVE));
    expect(mockEmit).toHaveBeenCalledWith(CTS_SESSION_MANIFEST_UPDATE, expect.any(Object), expect.any(Function));
    expect(onClose).toHaveBeenCalled();
  });

  it("5s timeout shows inline error", async () => {
    vi.useFakeTimers();
    // emit never calls ack
    mockEmit.mockImplementation(() => {});
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_SAVE));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(screen.getByTestId(TEST_ID_MANIFEST_SAVE_ERROR)).toHaveTextContent("Save failed");
    vi.useRealTimers();
  });

  it("Cancel closes without saving", () => {
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_CANCEL));
    expect(onClose).toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("Clear All is disabled while streaming", () => {
    useStore.setState({ obsState: { ...INITIAL_OBS_STATE, streaming: true } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_MANIFEST_CLEAR)).toBeDisabled();
  });
});
