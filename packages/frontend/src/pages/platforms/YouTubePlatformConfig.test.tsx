import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { YouTubePlatformConfig } from "./YouTubePlatformConfig";
import {
  TEST_ID_YOUTUBE_CONFIG_PAGE,
  TEST_ID_PLATFORM_CONNECT_BUTTON,
  TEST_ID_PLATFORM_DISCONNECT_BUTTON,
  TEST_ID_PLATFORM_ACCOUNT_DISPLAY,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
} from "../../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("YouTubePlatformConfig", () => {
  it("renders page", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", connected: false }) });
    render(<YouTubePlatformConfig />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_YOUTUBE_CONFIG_PAGE)).toBeInTheDocument();
    });
  });

  it("shows Connect button when not connected", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", connected: false }) });
    render(<YouTubePlatformConfig />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    expect(screen.getByText("Connect YouTube Account")).toBeInTheDocument();
  });

  it("shows connected account when connected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", connected: true, accountName: "My Channel" }),
    });
    render(<YouTubePlatformConfig />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("My Channel")).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
  });

  it("Connect button calls OAuth start endpoint", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "youtube", connected: false }) });
    render(<YouTubePlatformConfig />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });

    // Mock the OAuth start — the redirect will be a no-op in jsdom
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://accounts.google.com/oauth" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/youtube/oauth-start", expect.objectContaining({ method: "POST" }));
  });

  it("Disconnect button calls DELETE API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "youtube", connected: true, accountName: "My Channel" }),
    });
    render(<YouTubePlatformConfig />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON));
    expect(screen.getByText(/Are you sure you want to disconnect your YouTube account/)).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/youtube", expect.objectContaining({ method: "DELETE" }));
    });

    // Should show Connect button after disconnect
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
  });

  it("handles fetch error gracefully", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    render(<YouTubePlatformConfig />);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
  });
});
