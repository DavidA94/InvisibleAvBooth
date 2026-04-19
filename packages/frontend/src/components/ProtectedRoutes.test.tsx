import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Switch } from "react-router-dom";
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
      <Switch>
        <Route path="/login" render={() => <div data-testid="login-page">Login</div>} />
        <Route path="/change-password" render={() => <div data-testid="change-password-page">Change Password</div>} />
        <Route path="/dashboards" render={() => <div data-testid="dashboards-page">Dashboards</div>} />
        <Route path="*" render={() => <ProtectedRoutes>{children}</ProtectedRoutes>} />
      </Switch>
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
    // Render directly on /change-password — the Switch will match the /change-password route
    // but we need to test that ProtectedRoutes doesn't redirect AWAY from /change-password.
    // So we render ProtectedRoutes wrapping the change-password content directly.
    render(
      <MemoryRouter initialEntries={["/change-password"]}>
        <Route path="/change-password">
          <ProtectedRoutes>
            <div data-testid="protected">Protected</div>
          </ProtectedRoutes>
        </Route>
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
