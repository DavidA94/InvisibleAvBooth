import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { GlobalTitleBar } from "./GlobalTitleBar";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

const mockPush = vi.fn();
const mockReplace = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useHistory: () => ({ push: mockPush, replace: mockReplace }) };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  useStore.setState({
    user: { id: "u1", username: "John", role: "AvVolunteer" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
  vi.clearAllMocks();
  localStorage.clear();
});

function renderBar(path = "/dashboard"): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalTitleBar />
    </MemoryRouter>,
  );
}

describe("GlobalTitleBar", () => {
  it("displays username and role", () => {
    renderBar();
    expect(screen.getByTestId("title-bar-username")).toHaveTextContent("John");
    expect(screen.getByTestId("title-bar-role")).toHaveTextContent("AvVolunteer");
  });

  it("nav label shows 'Choose Dashboard' when no dashboard loaded", () => {
    renderBar();
    expect(screen.getByTestId("title-bar-dashboard-nav")).toHaveTextContent("Choose Dashboard");
  });

  it("nav label shows dashboard name when loaded", () => {
    localStorage.setItem("dashboardName", "Main Dashboard");
    renderBar();
    expect(screen.getByTestId("title-bar-dashboard-nav")).toHaveTextContent("Main Dashboard");
  });

  it("nav label navigates to /dashboards on click", async () => {
    renderBar();
    await userEvent.click(screen.getByTestId("title-bar-dashboard-nav"));
    expect(mockPush).toHaveBeenCalledWith("/dashboards");
  });

  it("Logout clears store and redirects to /login", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });
    localStorage.setItem("dashboardId", "d1");
    localStorage.setItem("dashboardName", "Main");
    localStorage.setItem("dashboardLayout:d1", "{}");
    renderBar();
    await userEvent.click(screen.getByTestId("title-bar-logout-btn"));
    await waitFor(() => {
      expect(useStore.getState().user).toBeNull();
    });
    expect(localStorage.getItem("dashboardId")).toBeNull();
    expect(localStorage.getItem("dashboardName")).toBeNull();
    expect(localStorage.getItem("dashboardLayout:d1")).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("reduced variant on /change-password hides role and nav", () => {
    renderBar("/change-password");
    expect(screen.getByTestId("title-bar-username")).toBeInTheDocument();
    expect(screen.queryByTestId("title-bar-role")).not.toBeInTheDocument();
    expect(screen.queryByTestId("title-bar-dashboard-nav")).not.toBeInTheDocument();
  });
});
