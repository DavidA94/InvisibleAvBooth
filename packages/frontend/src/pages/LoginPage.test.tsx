import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

const mockReplace = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useHistory: () => ({ push: vi.fn(), replace: mockReplace }) };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("renders form elements", () => {
    renderPage();
    expect(screen.getByTestId("login-username")).toBeInTheDocument();
    expect(screen.getByTestId("login-password")).toBeInTheDocument();
    expect(screen.getByTestId("login-remember")).toBeInTheDocument();
    expect(screen.getByTestId("login-submit")).toBeInTheDocument();
  });

  it("successful login stores user and redirects to /dashboards", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { id: "u1", username: "admin", role: "ADMIN" } }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId("login-form"));
    await waitFor(() => {
      expect(useStore.getState().user?.username).toBe("admin");
    });
    expect(mockReplace).toHaveBeenCalledWith("/dashboards");
  });

  it("requiresPasswordChange redirects to /change-password", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: true },
      }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId("login-form"));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/change-password");
    });
  });

  it("failed login shows error message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Invalid credentials" }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId("login-form"));
    await waitFor(() => {
      expect(screen.getByTestId("login-error")).toBeInTheDocument();
    });
  });
});
