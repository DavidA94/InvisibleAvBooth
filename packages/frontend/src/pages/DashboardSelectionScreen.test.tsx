import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DashboardSelectionScreen } from "./DashboardSelectionScreen";
import { TEST_ID_DASHBOARD_OPTION, TEST_ID_NO_DASHBOARDS_SCREEN } from "../constants/testIds";

const mockPush = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockPush,
  };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <DashboardSelectionScreen />
    </MemoryRouter>,
  );
}

describe("DashboardSelectionScreen", () => {
  it("renders dashboard list from API", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        { slug: "main", name: "Main Dashboard", description: "Standard view" },
        { slug: "tech", name: "Tech Dashboard", description: "Advanced controls" },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId(TEST_ID_DASHBOARD_OPTION)).toHaveLength(2);
    });
    expect(screen.getByText("Main Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Tech Dashboard")).toBeInTheDocument();
  });

  it("shows no-dashboards empty state", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_NO_DASHBOARDS_SCREEN)).toBeInTheDocument();
    });
  });

  it("selecting a dashboard stores name and navigates", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: "main", name: "Main Dashboard", description: "Standard view" }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_OPTION)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_DASHBOARD_OPTION));
    expect(localStorage.getItem("dashboardName")).toBe("Main Dashboard");
    expect(mockPush).toHaveBeenCalledWith("/dashboard/main");
  });

  it("auto-selects single dashboard on initial auth", async () => {
    sessionStorage.setItem("initialAuth", "true");
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: "only", name: "Only Dashboard", description: "" }],
    });
    renderPage();
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/only");
    });
  });

  it("redirects to cached dashboard on initial auth", async () => {
    sessionStorage.setItem("initialAuth", "true");
    localStorage.setItem("dashboardId", "cached-1");
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPage();
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/dashboard/cached-1", { replace: true });
    });
  });

  it("shows loading state before fetch resolves", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.queryByTestId(TEST_ID_DASHBOARD_OPTION)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_NO_DASHBOARDS_SCREEN)).not.toBeInTheDocument();
  });

  it("selects dashboard on Enter key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ slug: "main", name: "Main", description: "" }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_OPTION)).toBeInTheDocument();
    });
    const option = screen.getByTestId(TEST_ID_DASHBOARD_OPTION);
    option.focus();
    await userEvent.keyboard("{Enter}");
    expect(mockPush).toHaveBeenCalledWith("/dashboard/main");
  });
});
