import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { DashboardSelectionScreen } from "./DashboardSelectionScreen";

const mockPush = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockPush,
    useLocation: () => ({ pathname: "/dashboards", state: undefined }),
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
        { id: "d1", name: "Main Dashboard", description: "Standard view" },
        { id: "d2", name: "Tech Dashboard", description: "Advanced controls" },
      ],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getAllByTestId("dashboard-option")).toHaveLength(2);
    });
    expect(screen.getByText("Main Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Tech Dashboard")).toBeInTheDocument();
  });

  it("shows no-dashboards empty state", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("no-dashboards-screen")).toBeInTheDocument();
    });
  });

  it("selecting a dashboard stores name and navigates", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [{ id: "d1", name: "Main Dashboard", description: "Standard view" }],
    });
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("dashboard-option")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId("dashboard-option"));
    expect(localStorage.getItem("dashboardName")).toBe("Main Dashboard");
    expect(mockPush).toHaveBeenCalledWith("/dashboard/d1");
  });
});
