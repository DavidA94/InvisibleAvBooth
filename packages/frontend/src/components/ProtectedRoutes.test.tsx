import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";
import { ProtectedRoutes } from "./ProtectedRoutes";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import type { ReactNode } from "react";

function resetStore(): void {
  useStore.setState({
    user: null,
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
}

beforeEach(resetStore);

function renderWithRouter(initialPath: string, children: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div data-testid="login-page">Login</div>} />
        <Route path="/change-password" element={<div data-testid="change-password-page">Change Password</div>} />
        <Route path="/dashboards" element={<div data-testid="dashboards-page">Dashboards</div>} />
        <Route path="*" element={<ProtectedRoutes>{children}</ProtectedRoutes>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProtectedRoutes", () => {
  it("redirects unauthenticated user to /login", () => {
    renderWithRouter("/dashboard", <div data-testid="protected">Protected</div>);
    expect(screen.getByTestId("login-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("redirects requiresPasswordChange user to /change-password", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: true });
    renderWithRouter("/dashboard", <div data-testid="protected">Protected</div>);
    expect(screen.getByTestId("change-password-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("allows requiresPasswordChange user to stay on /change-password", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: true });
    render(
      <MemoryRouter initialEntries={["/change-password"]}>
        <Routes>
          <Route
            path="/change-password"
            element={
              <ProtectedRoutes>
                <div data-testid="protected">Protected</div>
              </ProtectedRoutes>
            }
          />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("redirects non-ADMIN away from /admin/* routes", () => {
    useStore.getState().setUser({ id: "u1", username: "vol", role: "AvVolunteer" });
    renderWithRouter("/admin/users", <div data-testid="protected">Protected</div>);
    expect(screen.getByTestId("dashboards-page")).toBeInTheDocument();
    expect(screen.queryByTestId("protected")).not.toBeInTheDocument();
  });

  it("allows ADMIN to access /admin/* routes", () => {
    useStore.getState().setUser({ id: "u1", username: "admin", role: "ADMIN" });
    renderWithRouter("/admin/users", <div data-testid="protected">Protected</div>);
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });

  it("allows authenticated user to access normal routes", () => {
    useStore.getState().setUser({ id: "u1", username: "vol", role: "AvVolunteer" });
    renderWithRouter("/dashboard", <div data-testid="protected">Protected</div>);
    expect(screen.getByTestId("protected")).toBeInTheDocument();
  });
});
