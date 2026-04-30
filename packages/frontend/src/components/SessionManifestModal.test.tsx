import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { SessionManifestModal } from "./SessionManifestModal";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { CTS_SESSION_MANIFEST_UPDATE } from "@invisible-av-booth/shared";
import type { CommandResult } from "../types";
import {
  TEST_ID_MANIFEST_CANCEL,
  TEST_ID_MANIFEST_CLEAR,
  TEST_ID_MANIFEST_PREVIEW,
  TEST_ID_MANIFEST_SAVE,
  TEST_ID_MANIFEST_SAVE_ERROR,
  TEST_ID_SCRIPTURE_BOOK_SELECT,
  TEST_ID_SESSION_MANIFEST_MODAL,
  TEST_ID_MANIFEST_TITLE_TEMPLATE,
  TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE,
  TEST_ID_MANIFEST_DESCRIPTION_PREVIEW,
} from "../constants/testIds";

const mockEmit = vi.fn();
vi.mock("../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const TITLE_TEMPLATES = [
  { id: "t1", name: "Default Title", category: "title", formatString: "{Date} \u2013 {Speaker} \u2013 {Title}" },
  { id: "t2", name: "Simple Title", category: "title", formatString: "{Speaker}: {Title}" },
];

const DESCRIPTION_TEMPLATES = [{ id: "d1", name: "Full Description", category: "description", formatString: "Sermon by {Speaker} \u2014 {Title}" }];

function mockTemplates(templates = [...TITLE_TEMPLATES, ...DESCRIPTION_TEMPLATES]): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => templates });
}

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
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(<SessionManifestModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByTestId(TEST_ID_SESSION_MANIFEST_MODAL)).not.toBeInTheDocument();
  });

  it("shows live preview computed from form state", () => {
    mockTemplates();
    useStore.setState({ manifest: { speaker: "John", title: "Grace" } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("John");
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("Grace");
  });

  it("shows placeholder text in preview when fields empty", () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("[No Speaker]");
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("[No Title]");
  });

  it("scripture book dropdown is rendered", () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_SCRIPTURE_BOOK_SELECT)).toBeInTheDocument();
  });

  it("Save emits socket event with ack", () => {
    mockTemplates();
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
    mockTemplates();
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
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_CANCEL));
    expect(onClose).toHaveBeenCalled();
    expect(mockEmit).not.toHaveBeenCalled();
  });

  it("Clear All is disabled while streaming", () => {
    mockTemplates();
    useStore.setState({ obsState: { ...INITIAL_OBS_STATE, streaming: true } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    expect(screen.getByTestId(TEST_ID_MANIFEST_CLEAR)).toBeDisabled();
  });
});

describe("SessionManifestModal \u2014 template selection", () => {
  it("fetches templates on modal open", async () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/templates", { credentials: "include" });
    });
  });

  it("renders title template dropdown when templates available", async () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).toBeInTheDocument();
    });
  });

  it("renders description template dropdown when templates available", async () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE)).toBeInTheDocument();
    });
  });

  it("auto-selects when only one template in category", async () => {
    mockTemplates([TITLE_TEMPLATES[0]!, TITLE_TEMPLATES[1]!, DESCRIPTION_TEMPLATES[0]!]);
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      const descSelect = screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE) as HTMLSelectElement;
      expect(descSelect.value).toBe("d1");
    });
  });

  it("does not auto-select when multiple templates in category", async () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      const titleSelect = screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE) as HTMLSelectElement;
      expect(titleSelect.value).toBe("");
    });
  });

  it("updates title preview when template selected", async () => {
    mockTemplates();
    useStore.setState({ manifest: { speaker: "John", title: "Grace" } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE), { target: { value: "t2" } });
    expect(screen.getByTestId(TEST_ID_MANIFEST_PREVIEW)).toHaveTextContent("John: Grace");
  });

  it("shows description preview when description template selected", async () => {
    mockTemplates();
    useStore.setState({ manifest: { speaker: "John", title: "Grace" } });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE), { target: { value: "d1" } });
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_PREVIEW)).toBeInTheDocument();
    });
    expect(screen.getByTestId(TEST_ID_MANIFEST_DESCRIPTION_PREVIEW)).toHaveTextContent("Sermon by John");
  });

  it("includes template IDs in save payload", async () => {
    mockTemplates();
    mockEmit.mockImplementation((_event: string, _patch: unknown, ack: (result: CommandResult) => void) => {
      ack({ success: true });
    });
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE), { target: { value: "t1" } });
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_SAVE));

    expect(mockEmit).toHaveBeenCalledWith(CTS_SESSION_MANIFEST_UPDATE, expect.objectContaining({ titleTemplateId: "t1" }), expect.any(Function));
  });

  it("does not show template dropdowns when no templates fetched", async () => {
    mockTemplates([]);
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    expect(screen.queryByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE)).not.toBeInTheDocument();
  });

  it("Clear All preserves template selections", async () => {
    mockTemplates();
    render(<SessionManifestModal isOpen={true} onClose={onClose} />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE), { target: { value: "t1" } });
    fireEvent.click(screen.getByTestId(TEST_ID_MANIFEST_CLEAR));

    const titleSelect = screen.getByTestId(TEST_ID_MANIFEST_TITLE_TEMPLATE) as HTMLSelectElement;
    expect(titleSelect.value).toBe("t1");
  });
});
