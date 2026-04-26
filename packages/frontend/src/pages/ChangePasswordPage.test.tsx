import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { ChangePasswordPage } from "./ChangePasswordPage";
import { useStore } from "../store";
import { INITIAL_OBS_STATE } from "../store/obsSlice";
import { TEST_ID_CHANGE_PASSWORD_ERROR, TEST_ID_CHANGE_PASSWORD_FORM, TEST_ID_NEW_PASSWORD_INPUT, TEST_ID_CONFIRM_PASSWORD_INPUT } from "../constants/testIds";

const mockReplace = vi.fn();
vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockReplace };
});

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
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

    ionInput(TEST_ID_NEW_PASSWORD_INPUT, "newpass");
    ionInput(TEST_ID_CONFIRM_PASSWORD_INPUT, "newpass");
    fireEvent.submit(screen.getByTestId(TEST_ID_CHANGE_PASSWORD_FORM));

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

    ionInput(TEST_ID_NEW_PASSWORD_INPUT, "pw");
    ionInput(TEST_ID_CONFIRM_PASSWORD_INPUT, "pw");
    fireEvent.submit(screen.getByTestId(TEST_ID_CHANGE_PASSWORD_FORM));

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_CHANGE_PASSWORD_ERROR)).toBeInTheDocument();
    });
  });

  it("shows validation error for mismatched passwords", async () => {
    renderPage();

    ionInput(TEST_ID_NEW_PASSWORD_INPUT, "pass1");
    ionInput(TEST_ID_CONFIRM_PASSWORD_INPUT, "pass2");
    fireEvent.submit(screen.getByTestId(TEST_ID_CHANGE_PASSWORD_FORM));

    await waitFor(() => {
      expect(screen.getByText("Passwords do not match")).toBeInTheDocument();
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
