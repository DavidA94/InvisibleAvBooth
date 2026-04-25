import { MOCK_JWT } from "../test/setup";
import { setAuthToken } from "../api/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ChangePasswordPage } from "./ChangePasswordPage";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";

const mockReplace = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockReplace };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  setAuthToken(MOCK_JWT);
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: true },
    obsState: INITIAL_OBS_STATE,
    obsPending: false,
    manifest: {},
    interpolatedStreamTitle: "",
    notifications: [],
  });
  vi.clearAllMocks();
});

function renderPage(): ReturnType<typeof render> {
  return render(
    <MemoryRouter>
      <ChangePasswordPage />
    </MemoryRouter>,
  );
}

// Helper to fire ionInput events on IonInput elements
function ionInput(testId: string, value: string): void {
  const el = screen.getByTestId(testId);
  fireEvent(el, new CustomEvent("ionInput", { detail: { value } }));
}

describe("ChangePasswordPage", () => {
  it("success redirects to /dashboards and clears flag", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    renderPage();

    ionInput("new-password-input", "newpass");
    ionInput("confirm-password-input", "newpass");
    fireEvent.submit(screen.getByTestId("change-password-form"));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/dashboards", { replace: true });
    });
    expect(useStore.getState().user?.requiresPasswordChange).toBe(false);
  });

  it("shows error on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "Weak password" }),
    });
    renderPage();

    ionInput("new-password-input", "pw");
    ionInput("confirm-password-input", "pw");
    fireEvent.submit(screen.getByTestId("change-password-form"));

    await waitFor(() => {
      expect(screen.getByTestId("change-password-error")).toBeInTheDocument();
    });
  });

  it("shows validation error for mismatched passwords", async () => {
    renderPage();

    ionInput("new-password-input", "pass1");
    ionInput("confirm-password-input", "pass2");
    fireEvent.submit(screen.getByTestId("change-password-form"));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
