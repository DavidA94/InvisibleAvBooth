import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GlobalTitleBar } from "./GlobalTitleBar";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual };
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
    expect(screen.getByTestId("title-bar-username")).toHaveTextContent("John");
    expect(screen.getByTestId("title-bar-role")).toHaveTextContent("(AvVolunteer)");
  });

  it("shows 'No Dashboard Selected' with (choose) when no dashboard name", () => {
    renderBar("/dashboards");
    expect(screen.getByText("No Dashboard Selected")).toBeInTheDocument();
    expect(screen.getByText("(choose)")).toBeInTheDocument();
  });

  it("shows dashboard name with (change) when on a dashboard", () => {
    localStorage.setItem("dashboardName", "Main Dashboard");
    renderBar("/dashboard/default");
    expect(screen.getByText("Main Dashboard")).toBeInTheDocument();
    expect(screen.getByText("(change)")).toBeInTheDocument();
  });

  it("reduced variant on /change-password hides role and nav", () => {
    renderBar("/change-password");
    expect(screen.getByTestId("title-bar-username")).toBeInTheDocument();
    expect(screen.queryByTestId("title-bar-role")).not.toBeInTheDocument();
    expect(screen.queryByTestId("title-bar-dashboard-nav")).not.toBeInTheDocument();
  });

  it("logout link points to /auth/logout", () => {
    renderBar();
    const logoutBtn = screen.getByTestId("title-bar-logout-btn");
    expect(logoutBtn).toBeInTheDocument();
  });
});
