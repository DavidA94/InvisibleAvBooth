import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { GlobalTitleBar } from "./GlobalTitleBar";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import {
  TEST_ID_GLOBAL_TITLE_BAR,
  TEST_ID_TITLE_BAR_DASHBOARD_NAV,
  TEST_ID_TITLE_BAR_LOGOUT_BUTTON,
  TEST_ID_TITLE_BAR_ROLE,
  TEST_ID_TITLE_BAR_USERNAME,
  TEST_ID_TITLE_BAR_ADMIN_LINK,
  TEST_ID_FULLSCREEN_BUTTON,
} from "../constants/testIds";

import "../test/ionicMocks";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

beforeEach(() => {
  useStore.setState({
    user: { id: "u1", username: "John", role: "AvVolunteer" },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
  localStorage.clear();
  mockNavigate.mockClear();
});

function renderBar(path = "/dashboard/default"): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalTitleBar />
    </MemoryRouter>,
  );
}

describe("GlobalTitleBar", () => {
  it("displays username and role", () => {
    renderBar();
    expect(screen.getByTestId(TEST_ID_TITLE_BAR_USERNAME)).toHaveTextContent("John");
    expect(screen.getByTestId(TEST_ID_TITLE_BAR_ROLE)).toHaveTextContent("(AvVolunteer)");
  });

  it("shows 'No Dashboard Selected' with (CHANGE) when no dashboard name", () => {
    renderBar("/dashboards");
    expect(screen.getByText("No Dashboard Selected")).toBeInTheDocument();
    expect(screen.getByText("(CHANGE)")).toBeInTheDocument();
  });

  it("shows dashboard name with (CHANGE) when on a dashboard", () => {
    localStorage.setItem("dashboardName", "Main Dashboard");
    renderBar("/dashboard/default");
    expect(screen.getByText("Main Dashboard")).toBeInTheDocument();
    expect(screen.getByText("(CHANGE)")).toBeInTheDocument();
  });

  it("reduced variant on /change-password hides role and nav", () => {
    renderBar("/change-password");
    expect(screen.getByTestId(TEST_ID_TITLE_BAR_USERNAME)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_TITLE_BAR_ROLE)).not.toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_TITLE_BAR_DASHBOARD_NAV)).not.toBeInTheDocument();
  });

  it("logout link points to /auth/logout", () => {
    renderBar();
    const logoutBtn = screen.getByTestId(TEST_ID_TITLE_BAR_LOGOUT_BUTTON);
    expect(logoutBtn).toBeInTheDocument();
  });

  it("shows Admin Pages link for ADMIN users", () => {
    useStore.setState({ user: { id: "u1", username: "Admin", role: "ADMIN" } });
    renderBar();
    expect(screen.getByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK)).toHaveTextContent("Admin Pages");
  });

  it("does not show Admin Pages link for non-ADMIN users", () => {
    useStore.setState({ user: { id: "u1", username: "John", role: "AvVolunteer" } });
    renderBar();
    expect(screen.queryByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK)).not.toBeInTheDocument();
  });

  it("does not show Admin Pages link for AvPowerUser", () => {
    useStore.setState({ user: { id: "u1", username: "Jane", role: "AvPowerUser" } });
    renderBar();
    expect(screen.queryByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK)).not.toBeInTheDocument();
  });

  it("returns null when user is not set", () => {
    useStore.setState({ user: null });
    renderBar();
    expect(screen.queryByTestId(TEST_ID_GLOBAL_TITLE_BAR)).not.toBeInTheDocument();
  });

  it("(CHANGE) button navigates to /dashboards", async () => {
    const user = userEvent.setup();
    renderBar();
    await user.click(screen.getByText("(CHANGE)"));
    expect(mockNavigate).toHaveBeenCalledWith("/dashboards");
  });

  it("Admin Pages button navigates to /admin", async () => {
    const user = userEvent.setup();
    useStore.setState({ user: { id: "u1", username: "Admin", role: "ADMIN" } });
    renderBar();
    await user.click(screen.getByTestId(TEST_ID_TITLE_BAR_ADMIN_LINK));
    expect(mockNavigate).toHaveBeenCalledWith("/admin");
  });

  it("shows fullscreen button when fullscreenEnabled is true", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: true, configurable: true });
    renderBar();
    expect(screen.getByTestId(TEST_ID_FULLSCREEN_BUTTON)).toBeInTheDocument();
  });

  it("does not show fullscreen button when fullscreenEnabled is false", () => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false, configurable: true });
    renderBar();
    expect(screen.queryByTestId(TEST_ID_FULLSCREEN_BUTTON)).not.toBeInTheDocument();
  });
});
