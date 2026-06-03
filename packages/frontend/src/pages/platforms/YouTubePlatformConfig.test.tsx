import "../../test/ionicMocks";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { YouTubePlatformConfig } from "./YouTubePlatformConfig";
import {
  TEST_ID_YOUTUBE_CONFIG_PAGE,
  TEST_ID_PLATFORM_CONNECT_BUTTON,
  TEST_ID_PLATFORM_DISCONNECT_BUTTON,
  TEST_ID_PLATFORM_ACCOUNT_DISPLAY,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_CONFIRMATION_CANCEL_BUTTON,
} from "../../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

function renderWithRouter(initialEntries: string[] = ["/"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <YouTubePlatformConfig />
    </MemoryRouter>,
  );
}

describe("YouTubePlatformConfig", () => {
  it("shows loading spinner initially", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    renderWithRouter();
    expect(screen.getByTestId(TEST_ID_YOUTUBE_CONFIG_PAGE)).toBeInTheDocument();
  });

  it("shows Connect button when not connected", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: false }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    expect(screen.getByText("Connect YouTube Account")).toBeInTheDocument();
    expect(screen.getByText(/YouTube is not configured/)).toBeInTheDocument();
  });

  it("shows connected state with channel title and token expiry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "youtube",
        hasToken: true,
        metadata: { channelTitle: "My Church Channel", privacy: "public" },
        tokenExpiresAt: "2026-12-31T00:00:00Z",
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByText("My Church Channel")).toBeInTheDocument();
    expect(screen.getByText(/Token expires:/)).toBeInTheDocument();
  });

  it("shows connected state without channelTitle or tokenExpiry", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "youtube",
        hasToken: true,
        metadata: {},
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.queryByText(/Channel:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Token expires:/)).not.toBeInTheDocument();
  });

  it("defaults privacy to unlisted when not set in metadata", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: {} }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("unlisted");
  });

  it("Connect button calls OAuth start and redirects", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: false }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://accounts.google.com/oauth" }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });
    expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/youtube/oauth-start", expect.objectContaining({ method: "POST" }));
  });

  it("shows error when OAuth start fails with error message", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Client ID not configured" }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });
    await waitFor(() => {
      expect(screen.getByText("Client ID not configured")).toBeInTheDocument();
    });
  });

  it("shows fallback error when OAuth start fails without error field", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });
    await waitFor(() => {
      expect(screen.getByText("Failed to start OAuth flow")).toBeInTheDocument();
    });
  });

  it("shows error on network failure during connect", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: false }) }).mockRejectedValueOnce(new Error("network"));
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("Disconnect button calls DELETE API and resets state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: {} }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON));
    expect(screen.getByText(/Are you sure/)).toBeInTheDocument();
    mockFetch.mockResolvedValueOnce({ ok: true });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
  });

  it("cancelling disconnect modal does not disconnect", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: {} }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON));
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
  });

  it("shows error on disconnect failure", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: true, metadata: {} }) })
      .mockRejectedValueOnce(new Error("network"));
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });
    await waitFor(() => {
      expect(screen.getByText("Failed to disconnect")).toBeInTheDocument();
    });
  });

  it("handles fetch config returning not ok", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
  });

  it("shows error when fetchConfig throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Failed to load configuration")).toBeInTheDocument();
    });
  });

  it("shows error from OAuth redirect search params", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: false }) });
    renderWithRouter(["/?error=access_denied"]);
    await waitFor(() => {
      expect(screen.getByText("Connection failed: access denied")).toBeInTheDocument();
    });
  });

  it("clears search params on connected=true redirect", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", hasToken: true, metadata: {} }) });
    renderWithRouter(["/?connected=true"]);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
  });

  it("handles privacy change via IonSelect", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: { privacy: "unlisted" } }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: { privacy: "public" } }),
    });
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "public" } });
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/platforms/youtube/settings",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ privacy: "public" }) }),
    );
  });

  it("shows error when privacy change fails with network error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: { privacy: "unlisted" } }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    mockFetch.mockRejectedValueOnce(new Error("network"));
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "public" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Failed to update privacy setting")).toBeInTheDocument();
    });
  });

  it("does not update config when privacy change returns not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", hasToken: true, metadata: { privacy: "unlisted" } }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({ ok: false });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: "public" } });
    });
    // Privacy still shows unlisted (unchanged)
    expect(select.value).toBe("unlisted");
  });
});
