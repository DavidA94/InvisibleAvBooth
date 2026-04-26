import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminUserManagement } from "./AdminUserManagement";
import {
  TEST_ID_USER_LIST, TEST_ID_CREATE_USERNAME, TEST_ID_CREATE_PASSWORD,
  TEST_ID_CREATE_USER_SUBMIT, TEST_ID_CREATE_USER_ERROR, TEST_ID_EDIT_USERNAME,
  TEST_ID_EDIT_SAVE, TEST_ID_EDIT_CANCEL, TEST_ID_EDIT_ROLE_SELECT,
} from "../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", username: "admin", role: "ADMIN" }, isRole: () => true }),
}));

const USERS = [
  { id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: false, createdAt: "2026-01-01" },
  { id: "u2", username: "volunteer", role: "AvVolunteer", requiresPasswordChange: false, createdAt: "2026-01-02" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function mockListUsers() {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => USERS });
}

function renderPage() {
  return render(<AdminUserManagement />);
}

describe("AdminUserManagement", () => {
  it("renders user list from API", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId("user-row-u1")).toBeInTheDocument();
      expect(screen.getByTestId("user-row-u2")).toBeInTheDocument();
    });
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("volunteer")).toBeInTheDocument();
  });

  it("create user form submits and refreshes list", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(TEST_ID_USER_LIST)).toBeInTheDocument());

    const usernameInput = screen.getByTestId(TEST_ID_CREATE_USERNAME);
    const passwordInput = screen.getByTestId(TEST_ID_CREATE_PASSWORD);
    fireEvent(usernameInput, new CustomEvent("ionInput", { detail: { value: "newuser" } }));
    fireEvent(passwordInput, new CustomEvent("ionInput", { detail: { value: "pass123" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "u3", username: "newuser", role: "AvVolunteer" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [...USERS, { id: "u3", username: "newuser", role: "AvVolunteer" }] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CREATE_USER_SUBMIT));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows create error on failure", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(TEST_ID_USER_LIST)).toBeInTheDocument());

    const usernameInput = screen.getByTestId(TEST_ID_CREATE_USERNAME);
    const passwordInput = screen.getByTestId(TEST_ID_CREATE_PASSWORD);
    fireEvent(usernameInput, new CustomEvent("ionInput", { detail: { value: "taken" } }));
    fireEvent(passwordInput, new CustomEvent("ionInput", { detail: { value: "pass" } }));

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Username taken" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CREATE_USER_SUBMIT));
    });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_CREATE_USER_ERROR)).toHaveTextContent("Username taken");
    });
  });

  it("edit user opens form and saves", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-button-u2")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-button-u2"));
    expect(screen.getByTestId(TEST_ID_EDIT_USERNAME)).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "u2", username: "updated", role: "AvVolunteer" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => USERS });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_EDIT_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "PUT" }));
    });
  });

  it("edit cancel closes form without saving", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-button-u2")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-button-u2"));
    expect(screen.getByTestId(TEST_ID_EDIT_USERNAME)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(TEST_ID_EDIT_CANCEL));
    expect(screen.queryByTestId(TEST_ID_EDIT_USERNAME)).not.toBeInTheDocument();
  });

  it("delete user calls API and refreshes", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("delete-button-u2")).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [USERS[0]] });

    await act(async () => {
      fireEvent.click(screen.getByTestId("delete-button-u2"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("disables role dropdown when editing own user", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-button-u1")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-button-u1"));
    const roleSelect = screen.getByTestId(TEST_ID_EDIT_ROLE_SELECT);
    // react-select sets aria-disabled on the input when isDisabled is true
    const input = roleSelect.querySelector("input");
    expect(input).toHaveAttribute("disabled");
  });
});
