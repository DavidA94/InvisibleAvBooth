import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import "../../test/ionicMocks";
import { YouTubePlatformDetail } from "./YouTubePlatformDetail";
import { TEST_ID_CONFIRMATION_CONFIRM_BUTTON, TEST_ID_CONFIRMATION_CANCEL_BUTTON } from "../../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("react-select", () => ({
  default: ({ options, onChange, value }: Record<string, unknown>) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        data-testid="privacy-select"
        value={(value as { value: string } | null)?.value ?? ""}
        onChange={(e) => {
          const opt = opts.find((o) => o.value === e.target.value);
          if (opt) (onChange as (o: { value: string; label: string }) => void)(opt);
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

const BASE_CONFIG = {
  id: "yt-1",
  platformType: "youtube",
  label: "YouTube",
  enabled: true,
  hasToken: true,
  metadata: { channelTitle: "My Church", privacy: "unlisted" },
  tokenExpiresAt: null as string | null,
};

const onSaved = vi.fn();
const onDisconnected = vi.fn();
const registerDirtyCheck = vi.fn();

function renderDetail(overrides: Partial<typeof BASE_CONFIG> = {}): ReturnType<typeof render> {
  const config = { ...BASE_CONFIG, ...overrides };
  return render(<YouTubePlatformDetail config={config} onSaved={onSaved} onDisconnected={onDisconnected} registerDirtyCheck={registerDirtyCheck} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("YouTubePlatformDetail — rendering", () => {
  it("renders the detail header", () => {
    renderDetail();
    expect(screen.getByText("Edit YouTube")).toBeInTheDocument();
  });

  it("shows connected status", () => {
    renderDetail();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows channel title when present", () => {
    renderDetail();
    expect(screen.getByText("My Church")).toBeInTheDocument();
  });

  it("does not show channel row when title is absent", () => {
    renderDetail({ metadata: { channelTitle: "", privacy: "unlisted" } });
    expect(screen.queryByText("Channel:")).not.toBeInTheDocument();
  });

  it("shows token expiry when present", () => {
    renderDetail({ tokenExpiresAt: "2027-01-01T00:00:00.000Z" });
    expect(screen.getByText("Token expires:")).toBeInTheDocument();
  });

  it("does not show token expiry row when null", () => {
    renderDetail({ tokenExpiresAt: null });
    expect(screen.queryByText("Token expires:")).not.toBeInTheDocument();
  });

  it("renders privacy select with current value", () => {
    renderDetail();
    const select = screen.getByTestId("privacy-select") as HTMLSelectElement;
    expect(select.value).toBe("unlisted");
  });

  it("registers dirty check on mount", () => {
    renderDetail();
    expect(registerDirtyCheck).toHaveBeenCalledWith(expect.objectContaining({ isDirty: expect.any(Function) }));
  });
});

describe("YouTubePlatformDetail — save", () => {
  it("Save button is disabled when privacy not changed", () => {
    renderDetail();
    const saveButton = screen.getByRole("button", { name: "Save" });
    expect(saveButton).toBeDisabled();
  });

  it("Save button is enabled after changing privacy", () => {
    renderDetail();
    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "public" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("save calls PATCH and invokes onSaved on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    renderDetail();

    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "public" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/platforms/youtube/settings", expect.objectContaining({ method: "PATCH" }));
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("shows error message when save returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Save failed" }) });
    renderDetail();

    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "public" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });

  it("shows network error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderDetail();

    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "public" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

describe("YouTubePlatformDetail — disconnect", () => {
  it("Disconnect button opens confirmation modal", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByText("Disconnect YouTube")).toBeInTheDocument();
  });

  it("confirming disconnect calls DELETE and invokes onDisconnected", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/youtube", expect.objectContaining({ method: "DELETE" }));
      expect(onDisconnected).toHaveBeenCalled();
    });
  });

  it("cancelling disconnect modal closes it without calling DELETE", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));

    expect(screen.queryByText("Disconnect YouTube")).not.toBeInTheDocument();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("shows error when disconnect fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to disconnect")).toBeInTheDocument();
    });
  });
});
