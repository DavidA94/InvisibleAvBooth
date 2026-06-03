import "../../test/ionicMocks";
import { MemoryRouter } from "react-router";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { FacebookPlatformConfig } from "./FacebookPlatformConfig";
import {
  TEST_ID_FACEBOOK_CONFIG_PAGE,
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
      <FacebookPlatformConfig />
    </MemoryRouter>,
  );
}

describe("FacebookPlatformConfig", () => {
  it("shows loading spinner initially", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {}));
    renderWithRouter();
    expect(screen.getByTestId(TEST_ID_FACEBOOK_CONFIG_PAGE)).toBeInTheDocument();
  });

  it("shows Connect buttons when not connected", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    expect(screen.getByText("Connect Facebook Page")).toBeInTheDocument();
    expect(screen.getByText("Connect My Profile")).toBeInTheDocument();
    expect(screen.getByText(/Facebook is not configured/)).toBeInTheDocument();
  });

  it("Connect Page button calls OAuth start with target page", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://facebook.com/oauth" }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/platforms/facebook/oauth-start",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ target: "page" }) }),
    );
  });

  it("Connect Profile button calls OAuth start with target profile", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Connect My Profile")).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://facebook.com/oauth" }) });
    await act(async () => {
      fireEvent.click(screen.getByText("Connect My Profile"));
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/platforms/facebook/oauth-start",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ target: "profile" }) }),
    );
  });

  it("shows fallback error when OAuth start fails without error field", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) })
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

  it("shows error when OAuth start fails with error message", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) })
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: "App ID not configured" }) });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });
    await waitFor(() => {
      expect(screen.getByText("App ID not configured")).toBeInTheDocument();
    });
  });

  it("shows network error on connect failure", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) })
      .mockRejectedValueOnce(new Error("network"));
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

  it("shows page selection when targetType is pending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: {
          targetType: "pending",
          userName: "John",
          pages: [
            { id: "p1", name: "Church Page" },
            { id: "p2", name: "Ministry Page" },
          ],
        },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
    });
    expect(screen.getByText("My Profile (John)")).toBeInTheDocument();
    expect(screen.getByText("Church Page (Page)")).toBeInTheDocument();
    expect(screen.getByText("Ministry Page (Page)")).toBeInTheDocument();
  });

  it("shows page selection with default userName when not provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "pending", pages: [] },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
    });
    expect(screen.getByText("My Profile (User)")).toBeInTheDocument();
  });

  it("handles page select success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "pending", userName: "John", pages: [{ id: "p1", name: "Church Page" }] },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "page", pageId: "p1", pageName: "Church Page" },
      }),
    });
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "p1" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Church Page")).toBeInTheDocument();
    });
  });

  it("shows error when page select returns not ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "pending", pages: [{ id: "p1", name: "Page" }] },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({ ok: false });
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "p1" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Failed to select page")).toBeInTheDocument();
    });
  });

  it("shows error when page select throws", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "pending", pages: [{ id: "p1", name: "Page" }] },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
    });
    mockFetch.mockRejectedValueOnce(new Error("network"));
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "p1" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Failed to select page")).toBeInTheDocument();
    });
  });

  it("shows configured state with targetType page and pageName", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "page", pageName: "My Church", pageId: "p1" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("My Church")).toBeInTheDocument();
    expect(screen.getByText("(Page)")).toBeInTheDocument();
    expect(screen.getByText("Public (Pages are always public)")).toBeInTheDocument();
  });

  it("shows configured state with targetType page without pageName", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "page", pageId: "p1" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("shows configured state with targetType user and userName", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user", userName: "John Smith", privacy: "ALL_FRIENDS" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("(Profile)")).toBeInTheDocument();
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("ALL_FRIENDS");
  });

  it("shows configured state with targetType user without userName", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("My Profile")).toBeInTheDocument();
  });

  it("defaults privacy to SELF for user target when not set", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    const select = screen.getByRole("combobox") as HTMLSelectElement;
    expect(select.value).toBe("SELF");
  });

  it("handles privacy change for user target", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user", privacy: "SELF" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user", privacy: "EVERYONE" },
      }),
    });
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "EVERYONE" } });
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/platforms/facebook/settings",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ privacy: "EVERYONE" }) }),
    );
  });

  it("shows error when privacy change throws", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user", privacy: "SELF" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    mockFetch.mockRejectedValueOnce(new Error("network"));
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "EVERYONE" } });
    });
    await waitFor(() => {
      expect(screen.getByText("Failed to update privacy")).toBeInTheDocument();
    });
  });

  it("shows generic connected state when targetType is unknown", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "something_else" },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();
  });

  it("Disconnect button calls DELETE API and resets state", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "facebook", hasToken: true, metadata: { targetType: "page", pageName: "Page" } }),
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
      json: async () => ({ platformType: "facebook", hasToken: true, metadata: { targetType: "page", pageName: "P" } }),
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
      .mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: true, metadata: { targetType: "page" } }) })
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
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    renderWithRouter(["/?error=access_denied"]);
    await waitFor(() => {
      expect(screen.getByText("Connection failed: access denied")).toBeInTheDocument();
    });
  });

  it("clears search params on connected=true redirect", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "facebook", hasToken: true, metadata: { targetType: "page", pageName: "P" } }),
    });
    renderWithRouter(["/?connected=true"]);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
  });

  it("handles page select with user option", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "pending", userName: "John", pages: [] },
      }),
    });
    renderWithRouter();
    await waitFor(() => {
      expect(screen.getByText("Select where to stream:")).toBeInTheDocument();
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        platformType: "facebook",
        hasToken: true,
        metadata: { targetType: "user", userName: "John" },
      }),
    });
    const select = screen.getByRole("combobox");
    await act(async () => {
      fireEvent.change(select, { target: { value: "user" } });
    });
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/admin/platforms/facebook/select-page",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ pageId: "user" }) }),
    );
  });
});
