import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionManifestModal } from "./SessionManifestModal";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import {
  TEST_ID_SESSION_MANIFEST_MODAL,
  TEST_ID_MANIFEST_SAVE,
  TEST_ID_MANIFEST_CANCEL,
  TEST_ID_MANIFEST_CLEAR,
  TEST_ID_MANIFEST_TITLE_TEMPLATE,
  TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE,
} from "../constants/testIds";
import type { CommandResult } from "../types";

const mockEmit = vi.fn();
vi.mock("../providers/SocketProvider", () => ({ useSocket: () => ({ emit: mockEmit }) }));

// Mock fetch for templates API
const defaultTemplates = [
  { id: "t1", name: "Default", category: "title", formatString: "{Date} – {Speaker} – {Title}" },
  { id: "t2", name: "None", category: "description", formatString: "" },
];

function mockTemplates(templates = defaultTemplates): void {
  globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(templates) }) as unknown as typeof fetch;
}

const onClose = vi.fn();

beforeEach(() => {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    interpolatedDescription: "",
    manifestReady: false,
    notifications: [],
  });
  vi.clearAllMocks();
});

describe("SessionManifestModal", () => {
  it("renders when open", () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).not.toBeInTheDocument();
  });

  it("shows template dropdowns when templates are loaded", async () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).toBeInTheDocument();
      expect(screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE)).toBeInTheDocument();
    });
  });

  it("shows prompt to select template when no template selected", async () => {
    mockTemplates([
      { id: "t1", name: "A", category: "title", formatString: "{Speaker}" },
      { id: "t2", name: "B", category: "title", formatString: "{Title}" },
      { id: "t3", name: "None", category: "description", formatString: "" },
    ]);
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByText(/Select a title format/)).toBeInTheDocument();
    });
  });

  it("Save emits socket event with ack", () => {
    mockTemplates();
    mockEmit.mockImplementation((_e: string, _d: unknown, ack: (r: CommandResult) => void) => ack({ success: true }));
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_SAVE));
    expect(mockEmit).toHaveBeenCalled();
  });

  it("Cancel closes without saving", () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_CANCEL));
    expect(onClose).toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("Clear All is disabled while streaming", () => {
    mockTemplates();
    useStore.setState({ obsState: { ...INITIAL_OBS_STATE, streaming: true, commandedState: { streaming: true, recording: false } } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_MANIFEST_CLEAR)).toBeDisabled();
  });
});
