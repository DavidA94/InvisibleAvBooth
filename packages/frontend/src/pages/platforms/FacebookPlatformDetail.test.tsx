import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import "../../test/ionicMocks";
import { FacebookPlatformDetail } from "./FacebookPlatformDetail";
import { TEST_ID_CONFIRMATION_CONFIRM_BUTTON, TEST_ID_CONFIRMATION_CANCEL_BUTTON } from "../../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("react-select", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ options, onChange, value, placeholder }: any) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        data-testid={placeholder ? "page-select" : "privacy-select"}
        value={value?.value ?? ""}
        onChange={(e: { target: { value: string } }) => {
          const opt = opts.find((o) => o.value === e.target.value);
          if (opt) onChange(opt);
        }}
      >
        {!value && placeholder && <option value="">{placeholder}</option>}
        {opts.map((o: { value: string; label: string }) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

const PAGE_CONFIG = {
  id: "fb-1",
  platformType: "facebook",
  label: "Facebook",
  enabled: true,
  hasToken: true,
  metadata: { targetType: "page", pageName: "Church Page", privacy: "EVERYONE" },
};

const USER_CONFIG = {
  id: "fb-1",
  platformType: "facebook",
  label: "Facebook",
  enabled: true,
  hasToken: true,
  metadata: { targetType: "user", userName: "John Doe", privacy: "SELF" },
};

const PENDING_CONFIG = {
  id: "fb-1",
  platformType: "facebook",
  label: "Facebook",
  enabled: true,
  hasToken: true,
  metadata: {
    targetType: "pending",
    userName: "John Doe",
    pages: [{ id: "p1", name: "My Page" }],
    privacy: "SELF",
  },
};

const onSaved = vi.fn();
const onRefresh = vi.fn();
const onDisconnected = vi.fn();
const registerDirtyCheck = vi.fn();

function renderDetail(config: typeof PAGE_CONFIG | typeof USER_CONFIG | typeof PENDING_CONFIG = PAGE_CONFIG): ReturnType<typeof render> {
  return render(
    <FacebookPlatformDetail config={config} onSaved={onSaved} onRefresh={onRefresh} onDisconnected={onDisconnected} registerDirtyCheck={registerDirtyCheck} />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FacebookPlatformDetail — page target rendering", () => {
  it("renders the detail header", () => {
    renderDetail();
    expect(screen.getByText("Edit Facebook")).toBeInTheDocument();
  });

  it("shows connected status", () => {
    renderDetail();
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("shows page name and Page type", () => {
    renderDetail();
    expect(screen.getByText(/Church Page.*Page/)).toBeInTheDocument();
  });

  it("shows 'Pages are always public' message for page target", () => {
    renderDetail();
    expect(screen.getByText(/Pages are always public/)).toBeInTheDocument();
  });

  it("does not show Save button for page target", () => {
    renderDetail();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("registers dirty check on mount", () => {
    renderDetail();
    expect(registerDirtyCheck).toHaveBeenCalledWith(expect.objectContaining({ isDirty: expect.any(Function) }));
  });
});

describe("FacebookPlatformDetail — user target rendering", () => {
  it("shows user name and Profile type", () => {
    renderDetail(USER_CONFIG);
    expect(screen.getByText(/John Doe.*Profile/)).toBeInTheDocument();
  });

  it("shows privacy select for user target", () => {
    renderDetail(USER_CONFIG);
    expect(screen.getByTestId("privacy-select")).toBeInTheDocument();
  });

  it("Save button disabled when privacy not changed", () => {
    renderDetail(USER_CONFIG);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("Save button enabled after changing privacy", () => {
    renderDetail(USER_CONFIG);
    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "EVERYONE" } });
    expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled();
  });

  it("save calls PATCH and invokes onSaved on success", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    renderDetail(USER_CONFIG);

    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "EVERYONE" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/platforms/facebook/settings", expect.objectContaining({ method: "PATCH" }));
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it("shows error when save returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Save failed" }) });
    renderDetail(USER_CONFIG);

    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "EVERYONE" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });

  it("shows network error when save fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderDetail(USER_CONFIG);

    fireEvent.change(screen.getByTestId("privacy-select"), { target: { value: "EVERYONE" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

describe("FacebookPlatformDetail — pending (page selection) state", () => {
  it("renders page selection UI when targetType is pending", () => {
    renderDetail(PENDING_CONFIG);
    expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
  });

  it("shows a select with profile and page options", () => {
    renderDetail(PENDING_CONFIG);
    const select = screen.getByTestId("page-select");
    expect(select).toBeInTheDocument();
    // Options: My Profile (user) and My Page (Page)
    expect(screen.getByText(/My Profile/)).toBeInTheDocument();
    expect(screen.getByText(/My Page/)).toBeInTheDocument();
  });

  it("selecting a page calls POST select-page and invokes onRefresh", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    renderDetail(PENDING_CONFIG);

    await act(async () => {
      fireEvent.change(screen.getByTestId("page-select"), { target: { value: "p1" } });
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/facebook/select-page", expect.objectContaining({ method: "POST" }));
      expect(onRefresh).toHaveBeenCalled();
    });
  });

  it("shows error when page selection fails", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    renderDetail(PENDING_CONFIG);

    await act(async () => {
      fireEvent.change(screen.getByTestId("page-select"), { target: { value: "p1" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to select target")).toBeInTheDocument();
    });
  });

  it("shows network error when page selection fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderDetail(PENDING_CONFIG);

    await act(async () => {
      fireEvent.change(screen.getByTestId("page-select"), { target: { value: "p1" } });
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

describe("FacebookPlatformDetail — disconnect", () => {
  it("Disconnect button opens confirmation modal", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    expect(screen.getByText("Disconnect Facebook")).toBeInTheDocument();
  });

  it("confirming disconnect calls DELETE and invokes onDisconnected", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    renderDetail();

    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/facebook", expect.objectContaining({ method: "DELETE" }));
      expect(onDisconnected).toHaveBeenCalled();
    });
  });

  it("cancelling disconnect modal closes it without calling DELETE", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Disconnect" }));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));

    expect(screen.queryByText("Disconnect Facebook")).not.toBeInTheDocument();
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
