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
} from "../../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("FacebookPlatformConfig", () => {
  it("renders page", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    render(<MemoryRouter><FacebookPlatformConfig /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_FACEBOOK_CONFIG_PAGE)).toBeInTheDocument();
    });
  });

  it("shows Connect button when not connected", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    render(<MemoryRouter><FacebookPlatformConfig /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
    expect(screen.getByText("Connect Facebook Page")).toBeInTheDocument();
  });

  it("shows connected account when connected", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "facebook", hasToken: true, accountName: "Church Page" }),
    });
    render(<MemoryRouter><FacebookPlatformConfig /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_ACCOUNT_DISPLAY)).toBeInTheDocument();
    });
    expect(screen.getByText("Connected")).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_PLATFORM_DISCONNECT_BUTTON)).toBeInTheDocument();
  });

  it("Connect button calls OAuth start endpoint", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ platformType: "facebook", hasToken: false }) });
    render(<MemoryRouter><FacebookPlatformConfig /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ authUrl: "https://www.facebook.com/dialog/oauth" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/facebook/oauth-start", expect.objectContaining({ method: "POST" }));
  });

  it("Disconnect button calls DELETE API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ platformType: "facebook", hasToken: true, accountName: "Church Page" }),
    });
    render(<MemoryRouter><FacebookPlatformConfig /></MemoryRouter>);
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
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/platforms/facebook", expect.objectContaining({ method: "DELETE" }));
    });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
  });

  it("handles fetch error gracefully", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    render(<MemoryRouter><FacebookPlatformConfig /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_PLATFORM_CONNECT_BUTTON)).toBeInTheDocument();
    });
  });
});
