import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Dashboard } from "./Dashboard";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import type { GridManifest } from "../types";

const mockReplace = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useHistory: () => ({ replace: mockReplace }) };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const TEST_MANIFEST: GridManifest = {
  version: 1,
  cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
};

beforeEach(() => {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
  vi.clearAllMocks();
  localStorage.clear();
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  it("redirects to /dashboards when no dashboardId in localStorage", () => {
    renderPage();
    expect(mockReplace).toHaveBeenCalledWith("/dashboards");
  });

  it("shows Loading spinner on first load", () => {
    localStorage.setItem("dashboardId", "d1");
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // Never resolves
    renderPage();
    expect(screen.getByTestId("dashboard-loading")).toBeInTheDocument();
  });

  it("renders grid layout from fetched manifest", async () => {
    localStorage.setItem("dashboardId", "d1");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => TEST_MANIFEST,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-grid")).toBeInTheDocument();
    });
    expect(screen.getByTestId("widget-obs")).toBeInTheDocument();
  });

  it("falls back to localStorage cache on fetch failure", async () => {
    localStorage.setItem("dashboardId", "d1");
    localStorage.setItem("dashboardLayout:d1", JSON.stringify(TEST_MANIFEST));
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-grid")).toBeInTheDocument();
    });
    expect(screen.getByTestId("widget-obs")).toBeInTheDocument();
  });

  it("shows Refreshing spinner on structural change", async () => {
    vi.useFakeTimers();
    const cachedManifest: GridManifest = {
      version: 1,
      cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    };
    const freshManifest: GridManifest = {
      version: 1,
      cells: [{ widgetId: "obs", title: "OBS", col: 1, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    };
    localStorage.setItem("dashboardId", "d1");
    localStorage.setItem("dashboardLayout:d1", JSON.stringify(cachedManifest));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => freshManifest,
    });
    renderPage();

    // Let the fetch promise and state updates resolve
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    // Structural change detected — refreshing spinner should be visible
    expect(screen.getByTestId("dashboard-refreshing")).toBeInTheDocument();

    // Advance past the 300ms setTimeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Grid should now be rendered with the fresh manifest
    expect(screen.getByTestId("dashboard-grid")).toBeInTheDocument();
    vi.useRealTimers();
  });
});
