import { describe, it, expect, vi, beforeEach } from "vitest";
import "../test/ionicMocks";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LoginPage } from "./LoginPage";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { TEST_ID_LOGIN_ERROR, TEST_ID_LOGIN_FORM, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_REMEMBER, TEST_ID_LOGIN_USERNAME } from "../constants/testIds";
import userEvent from "@testing-library/user-event";

const mockReplace = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockReplace };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  useStore.setState({ user: null, obsState: INITIAL_OBS_STATE, obsPending: false, manifest: {}, interpolatedStreamTitle: "", notifications: [] });
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
  it("logs in with typed credentials and navigates to /admin for ADMIN", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user: { id: "u1", username: "admin", role: "ADMIN" } } }),
    });
    renderPage();

    await userEvent.type(screen.getByTestId(TEST_ID_LOGIN_USERNAME), "admin");
    await userEvent.type(screen.getByTestId(TEST_ID_LOGIN_PASSWORD), "pass123");
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/auth/login",
        expect.objectContaining({ body: JSON.stringify({ username: "admin", password: "pass123", rememberMe: false }) }),
      );
    });
    await waitFor(() => {
      expect(useStore.getState().user?.username).toBe("admin");
    });
    expect(mockReplace).toHaveBeenCalledWith("/admin", { replace: true });
  });

  it("navigates to /dashboards for non-ADMIN", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user: { id: "u2", username: "vol", role: "AvVolunteer" } } }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboards", { replace: true });
    });
  });

  it("redirects to /change-password when required", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user: { id: "u1", username: "admin", role: "ADMIN" }, requiresPasswordChange: true } }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/change-password", { replace: true });
    });
  });

  it("shows error on invalid credentials", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ message: "Invalid credentials" }) });
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_LOGIN_ERROR)).toBeInTheDocument();
    });
  });

  it("shows network error when fetch throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network failure"));
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_LOGIN_ERROR)).toBeInTheDocument();
    });
  });

  it("sends rememberMe when checkbox is checked", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user: { id: "u1", username: "admin", role: "ADMIN" } } }),
    });
    renderPage();

    await userEvent.type(screen.getByTestId(TEST_ID_LOGIN_USERNAME), "admin");
    await userEvent.click(screen.getByTestId(TEST_ID_LOGIN_REMEMBER));
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ body: expect.stringContaining('"rememberMe":true') }));
    });
  });
});
