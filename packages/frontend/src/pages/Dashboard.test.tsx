import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { Dashboard } from "./Dashboard";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import type { GridManifest } from "../types";
import { TEST_ID_DASHBOARD_GRID, TEST_ID_DASHBOARD_LOADING, TEST_ID_DASHBOARD_REFRESHING } from "../constants/testIds";

const mockReplace = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockReplace,
    useParams: () => ({ slug: "default" }),
  };
});

// Mock ObsWidget to avoid needing socket/ResizeObserver in Dashboard tests
vi.mock("../components/obs/ObsWidget", () => ({
  ObsWidget: () => <div data-testid="widget-obs">OBS Mock</div>,
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const TEST_MANIFEST: GridManifest = {
  grids: {
    "large-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "large-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "small-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "small-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
  },
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
  it("shows Loading spinner on first load", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // Never resolves
    renderPage();
    expect(screen.getByTestId(TEST_ID_DASHBOARD_LOADING)).toBeInTheDocument();
  });

  it("renders grid layout from fetched manifest", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => TEST_MANIFEST,
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
    expect(screen.getByTestId("widget-obs")).toBeInTheDocument();
  });

  it("falls back to localStorage cache on fetch failure", async () => {
    localStorage.setItem("dashboardLayout:default", JSON.stringify(TEST_MANIFEST));
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
    expect(screen.getByTestId("widget-obs")).toBeInTheDocument();
  });

  it("shows Refreshing spinner on structural change", async () => {
    vi.useFakeTimers();
    const cachedManifest: GridManifest = {
      grids: {
        "large-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        "large-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        "small-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        "small-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
      },
    };
    const freshManifest: GridManifest = {
      grids: {
        "large-landscape": [{ widgetId: "obs", title: "OBS", col: 1, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        "large-portrait": [{ widgetId: "obs", title: "OBS", col: 1, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        "small-landscape": [{ widgetId: "obs", title: "OBS", col: 1, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
        "small-portrait": [{ widgetId: "obs", title: "OBS", col: 1, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
      },
    };
    localStorage.setItem("dashboardLayout:default", JSON.stringify(cachedManifest));
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
    expect(screen.getByTestId(TEST_ID_DASHBOARD_REFRESHING)).toBeInTheDocument();

    // Advance past the 300ms setTimeout
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Grid should now be rendered with the fresh manifest
    expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("redirects on 404 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });
    renderPage();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboards", { replace: true });
    });
  });

  it("redirects on 403 response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403 });
    renderPage();
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboards", { replace: true });
    });
  });

  it("filters cells by user role", async () => {
    useStore.setState({ user: { id: "u1", username: "vol", role: "AvVolunteer" } });
    const cells = [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" as const },
      { widgetId: "admin-only", title: "Admin", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "ADMIN" as const },
    ];
    const manifest: GridManifest = {
      grids: {
        "large-landscape": cells,
        "large-portrait": cells,
        "small-landscape": cells,
        "small-portrait": cells,
      },
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => manifest });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
    expect(screen.getByTestId("widget-obs")).toBeInTheDocument();
    expect(screen.queryByText("Admin")).not.toBeInTheDocument();
  });

  it("uses default manifest when response has invalid format", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ version: 99, cells: [] }) });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
  });

  it("uses default manifest on fetch failure with no cache", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network"));
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
  });

  it("uses default manifest on 500 response with no cache", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
  });

  it("renders non-obs widget as placeholder", async () => {
    const cells = [{ widgetId: "audio", title: "Audio", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" as const }];
    const manifest: GridManifest = {
      grids: {
        "large-landscape": cells,
        "large-portrait": cells,
        "small-landscape": cells,
        "small-portrait": cells,
      },
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => manifest });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("widget-audio")).toBeInTheDocument();
    });
    expect(screen.getByText("Audio")).toBeInTheDocument();
  });

  it("normalizes legacy API response (version/cells format)", async () => {
    const legacyResponse = {
      version: 1,
      cells: [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => legacyResponse });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
    expect(screen.getByTestId("widget-obs")).toBeInTheDocument();
  });

  it("clears invalid cache from localStorage", async () => {
    localStorage.setItem("dashboardLayout:default", JSON.stringify({ version: 1, cells: [] }));
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => TEST_MANIFEST });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID)).toBeInTheDocument();
    });
    // The old format cache should have been cleared and replaced
    const cached = JSON.parse(localStorage.getItem("dashboardLayout:default")!);
    expect(cached).toHaveProperty("grids");
  });
});
