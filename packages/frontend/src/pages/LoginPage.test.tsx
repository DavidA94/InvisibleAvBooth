import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { LoginPage } from "./LoginPage";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { TEST_ID_LOGIN_ERROR, TEST_ID_LOGIN_FORM, TEST_ID_LOGIN_PASSWORD, TEST_ID_LOGIN_REMEMBER, TEST_ID_LOGIN_SUBMIT, TEST_ID_LOGIN_USERNAME } from "../constants/testIds";

const mockReplace = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockReplace };
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
    expect(screen.getByTestId(TEST_ID_LOGIN_USERNAME)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_LOGIN_PASSWORD)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_LOGIN_REMEMBER)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_LOGIN_SUBMIT)).toBeInTheDocument();
  });

  it("successful login stores user and redirects to /dashboards", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ user: { user: { id: "u1", username: "admin", role: "ADMIN" } } }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(useStore.getState().user?.username).toBe("admin");
    });
    expect(mockReplace).toHaveBeenCalledWith("/admin", { replace: true });
  });

  it("requiresPasswordChange redirects to /change-password", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        user: { user: { id: "u1", username: "admin", role: "ADMIN" }, requiresPasswordChange: true },
      }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/change-password", { replace: true });
    });
  });

  it("failed login shows error message", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Invalid credentials" }),
    });
    renderPage();
    fireEvent.submit(screen.getByTestId(TEST_ID_LOGIN_FORM));
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_LOGIN_ERROR)).toBeInTheDocument();
    });
  });
});
