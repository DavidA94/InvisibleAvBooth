import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import "../test/ionicMocks";
import { AdminPlatformManagement } from "./AdminPlatformManagement";
import { TEST_ID_CONFIRMATION_CONFIRM_BUTTON, TEST_ID_CONFIRMATION_CANCEL_BUTTON } from "../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// react-select renders an accessible combobox — mock it to simplify
vi.mock("react-select", () => ({
  default: ({ options, onChange, value, placeholder }: Record<string, unknown>) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        aria-label={placeholder as string}
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

const YT_PLATFORM = {
  id: "yt-1",
  platformType: "youtube",
  label: "YouTube",
  enabled: true,
  hasToken: true,
  metadata: { channelTitle: "My Church", privacy: "unlisted" },
  tokenExpiresAt: null,
};

const FB_PLATFORM = {
  id: "fb-1",
  platformType: "facebook",
  label: "Facebook",
  enabled: true,
  hasToken: true,
  metadata: { targetType: "page", pageName: "Church Page", privacy: "EVERYONE" },
};

function mockList(platforms: unknown[] = []): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => platforms });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminPlatformManagement — loading and empty state", () => {
  it("shows empty state when no platforms", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("No platforms configured")).toBeInTheDocument();
    });
  });

  it("shows error when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load platforms")).toBeInTheDocument();
    });
  });

  it("shows empty detail panel initially", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Select a platform or add a new connection")).toBeInTheDocument();
    });
  });
});

describe("AdminPlatformManagement — platform list", () => {
  it("renders YouTube and Facebook platforms", async () => {
    mockList([YT_PLATFORM, FB_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });
    expect(screen.getByText("Facebook")).toBeInTheDocument();
  });

  it("shows channelTitle as YouTube subtitle", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("My Church")).toBeInTheDocument();
    });
  });

  it("shows pageName as Facebook subtitle for page target", async () => {
    mockList([FB_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Church Page")).toBeInTheDocument();
    });
  });

  it("shows 'Needs page selection' for pending target type", async () => {
    const pending = { ...FB_PLATFORM, metadata: { targetType: "pending" } };
    mockList([pending]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Needs page selection")).toBeInTheDocument();
    });
  });

  it("shows user name for user target type", async () => {
    const userPlatform = { ...FB_PLATFORM, metadata: { targetType: "user", userName: "John Doe" } };
    mockList([userPlatform]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("John Doe")).toBeInTheDocument();
    });
  });
});

describe("AdminPlatformManagement — selecting a platform", () => {
  it("clicking YouTube opens YouTubePlatformDetail", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /YouTube/i }));
    await waitFor(() => {
      expect(screen.getByText("Edit YouTube")).toBeInTheDocument();
    });
  });

  it("clicking Facebook opens FacebookPlatformDetail", async () => {
    mockList([FB_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Facebook")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Facebook/i }));
    await waitFor(() => {
      expect(screen.getByText("Edit Facebook")).toBeInTheDocument();
    });
  });

  it("Enter key on list item selects it", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    // Find the list item div (role=button)
    const listItem = screen.getByRole("button", { name: /YouTube/i });
    fireEvent.keyDown(listItem, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByText("Edit YouTube")).toBeInTheDocument();
    });
  });
});

describe("AdminPlatformManagement — add dropdown", () => {
  it("Add Connection button opens dropdown", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Connection"));
    expect(screen.getByText("YouTube")).toBeInTheDocument();
    expect(screen.getByText("Facebook Page")).toBeInTheDocument();
    expect(screen.getByText("Facebook Profile")).toBeInTheDocument();
  });

  it("YouTube option is disabled when already added", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Connection"));
    // YouTube in the dropdown should be disabled
    const ytButtons = screen.getAllByRole("button");
    const ytDropdownButton = ytButtons.find((b) => b.textContent?.includes("YouTube") && b.getAttribute("disabled") !== null);
    expect(ytDropdownButton).toBeDefined();
  });

  it("starting YouTube OAuth calls oauth-start endpoint", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://youtube.com/auth" }) });

    fireEvent.click(screen.getByText("Add Connection"));
    await act(async () => {
      fireEvent.click(screen.getByText("YouTube"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/youtube/oauth-start", expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows error when OAuth start fails", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "OAuth error" }) });

    fireEvent.click(screen.getByText("Add Connection"));
    await act(async () => {
      fireEvent.click(screen.getByText("YouTube"));
    });

    await waitFor(() => {
      expect(screen.getByText("OAuth error")).toBeInTheDocument();
    });
  });

  it("Facebook Profile option calls oauth-start with profile target", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://fb.com/auth" }) });

    fireEvent.click(screen.getByText("Add Connection"));
    await act(async () => {
      fireEvent.click(screen.getByText("Facebook Profile"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/facebook/oauth-start", expect.objectContaining({ method: "POST" }));
    });
  });

  it("Facebook Page option calls oauth-start with page target", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://fb.com/auth" }) });

    fireEvent.click(screen.getByText("Add Connection"));
    await act(async () => {
      fireEvent.click(screen.getByText("Facebook Page"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/facebook/oauth-start", expect.objectContaining({ method: "POST" }));
    });
  });

  it("clicking outside the dropdown closes it", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Connection"));
    expect(screen.getByText("Facebook Page")).toBeInTheDocument();

    // Click outside the dropdown
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Facebook Page")).not.toBeInTheDocument();
  });

  it("shows network error when OAuth fetch throws", async () => {
    mockList([]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("Add Connection")).toBeInTheDocument();
    });

    mockFetch.mockRejectedValueOnce(new Error("network"));

    fireEvent.click(screen.getByText("Add Connection"));
    await act(async () => {
      fireEvent.click(screen.getByText("Facebook Page"));
    });

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });
});

describe("AdminPlatformManagement — disconnect", () => {
  it("disconnect button opens confirmation modal", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    // Find the Disconnect button in the list
    const disconnectButtons = screen.getAllByRole("button").filter((b) => b.textContent === "Disconnect");
    fireEvent.click(disconnectButtons[0]!);

    expect(screen.getByText("Disconnect Platform")).toBeInTheDocument();
  });

  it("confirming disconnect calls DELETE and refreshes", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    const disconnectButtons = screen.getAllByRole("button").filter((b) => b.textContent === "Disconnect");
    fireEvent.click(disconnectButtons[0]!);

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/youtube", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("disconnect resets panel when the edited platform is removed", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    // Select the platform first
    fireEvent.click(screen.getByRole("button", { name: /YouTube/i }));
    await waitFor(() => {
      expect(screen.getByText("Edit YouTube")).toBeInTheDocument();
    });

    // Now disconnect
    const disconnectButtons = screen.getAllByRole("button").filter((b) => b.textContent === "Disconnect");
    // The one in the list panel (not the detail panel)
    fireEvent.click(disconnectButtons[0]!);

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(screen.getByText("No platforms configured")).toBeInTheDocument();
    });
  });

  it("cancelling disconnect modal keeps platform", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    const disconnectButtons = screen.getAllByRole("button").filter((b) => b.textContent === "Disconnect");
    fireEvent.click(disconnectButtons[0]!);
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));

    expect(screen.getByText("YouTube")).toBeInTheDocument();
  });

  it("shows error when delete fetch throws", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    const disconnectButtons = screen.getAllByRole("button").filter((b) => b.textContent === "Disconnect");
    fireEvent.click(disconnectButtons[0]!);

    mockFetch.mockRejectedValueOnce(new Error("network"));

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(screen.getByText("Failed to delete")).toBeInTheDocument();
    });
  });
});

describe("AdminPlatformManagement — handleSaved and handleDisconnected callbacks", () => {
  it("saving inside YouTube detail refreshes the platform list", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    // Open YouTube detail
    fireEvent.click(screen.getByRole("button", { name: /YouTube/i }));
    await waitFor(() => expect(screen.getByText("Edit YouTube")).toBeInTheDocument());

    // Change privacy to enable Save
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "public" } });

    // Mock save success + re-fetch
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [{ ...YT_PLATFORM, metadata: { ...YT_PLATFORM.metadata, privacy: "public" } }] });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/platforms/youtube/settings", expect.objectContaining({ method: "PATCH" }));
    });
  });

  it("disconnecting inside YouTube detail resets panel to empty", async () => {
    mockList([YT_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /YouTube/i }));
    await waitFor(() => expect(screen.getByText("Edit YouTube")).toBeInTheDocument());

    // Click Disconnect inside the detail panel (second Disconnect button if list also has one)
    const disconnectButtons = screen.getAllByRole("button").filter((b) => b.textContent === "Disconnect");
    fireEvent.click(disconnectButtons[disconnectButtons.length - 1]!);

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(screen.getByText("No platforms configured")).toBeInTheDocument();
    });
  });
});

describe("AdminPlatformManagement — unsaved changes guard", () => {
  it("navigating away with unsaved YouTube changes shows modal", async () => {
    mockList([YT_PLATFORM, FB_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    // Select YouTube — detail panel opens
    const listItems = screen.getAllByRole("button");
    const ytItem = listItems.find((b) => b.textContent?.includes("YouTube") && b.textContent?.includes("My Church"));
    fireEvent.click(ytItem!);

    await waitFor(() => {
      expect(screen.getByText("Edit YouTube")).toBeInTheDocument();
    });

    // Change the privacy select inside the detail panel to make it dirty
    const privacySelect = screen.getByRole("combobox");
    fireEvent.change(privacySelect, { target: { value: "private" } });

    // Try to navigate to Facebook
    const fbItem = listItems.find((b) => b.textContent?.includes("Facebook") && b.textContent?.includes("Church Page"));
    fireEvent.click(fbItem!);

    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
  });

  it("confirming discard navigates to the new platform", async () => {
    mockList([YT_PLATFORM, FB_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    const listItems = screen.getAllByRole("button");
    const ytItem = listItems.find((b) => b.textContent?.includes("YouTube") && b.textContent?.includes("My Church"));
    fireEvent.click(ytItem!);
    await waitFor(() => expect(screen.getByText("Edit YouTube")).toBeInTheDocument());

    const privacySelect = screen.getByRole("combobox");
    fireEvent.change(privacySelect, { target: { value: "private" } });

    const fbItem = listItems.find((b) => b.textContent?.includes("Facebook") && b.textContent?.includes("Church Page"));
    fireEvent.click(fbItem!);

    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));

    await waitFor(() => {
      expect(screen.getByText("Edit Facebook")).toBeInTheDocument();
    });
  });

  it("cancelling unsaved guard keeps current form", async () => {
    mockList([YT_PLATFORM, FB_PLATFORM]);
    render(<AdminPlatformManagement />);
    await waitFor(() => {
      expect(screen.getByText("YouTube")).toBeInTheDocument();
    });

    const listItems = screen.getAllByRole("button");
    const ytItem = listItems.find((b) => b.textContent?.includes("YouTube") && b.textContent?.includes("My Church"));
    fireEvent.click(ytItem!);
    await waitFor(() => expect(screen.getByText("Edit YouTube")).toBeInTheDocument());

    const privacySelect = screen.getByRole("combobox");
    fireEvent.change(privacySelect, { target: { value: "private" } });

    const fbItem = listItems.find((b) => b.textContent?.includes("Facebook") && b.textContent?.includes("Church Page"));
    fireEvent.click(fbItem!);

    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));

    expect(screen.getByText("Edit YouTube")).toBeInTheDocument();
  });
});
