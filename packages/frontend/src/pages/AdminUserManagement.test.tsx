import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminUserManagement } from "./AdminUserManagement";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const USERS = [
  { id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: false, createdAt: "2026-01-01" },
  { id: "u2", username: "volunteer", role: "AvVolunteer", requiresPasswordChange: false, createdAt: "2026-01-02" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function mockListUsers(): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => USERS });
}

function renderPage(): ReturnType<typeof render> {
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
    await waitFor(() => expect(screen.getByTestId("user-list")).toBeInTheDocument());

    // Fill form
    const usernameInput = screen.getByTestId("create-username");
    const passwordInput = screen.getByTestId("create-password");
    fireEvent(usernameInput, new CustomEvent("ionInput", { detail: { value: "newuser" } }));
    fireEvent(passwordInput, new CustomEvent("ionInput", { detail: { value: "pass123" } }));

    // Mock create + refresh
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "u3", username: "newuser", role: "AvVolunteer" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [...USERS, { id: "u3", username: "newuser", role: "AvVolunteer" }] });

    await act(async () => {
      fireEvent.click(screen.getByTestId("create-user-submit"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows create error on failure", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("user-list")).toBeInTheDocument());

    const usernameInput = screen.getByTestId("create-username");
    const passwordInput = screen.getByTestId("create-password");
    fireEvent(usernameInput, new CustomEvent("ionInput", { detail: { value: "taken" } }));
    fireEvent(passwordInput, new CustomEvent("ionInput", { detail: { value: "pass" } }));

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Username taken" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId("create-user-submit"));
    });

    await waitFor(() => {
      expect(screen.getByTestId("create-user-error")).toHaveTextContent("Username taken");
    });
  });

  it("edit user opens form and saves", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-btn-u2")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-btn-u2"));
    expect(screen.getByTestId("edit-username")).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "u2", username: "updated", role: "AvVolunteer" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => USERS });

    await act(async () => {
      fireEvent.click(screen.getByTestId("edit-save"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "PUT" }));
    });
  });

  it("edit cancel closes form without saving", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("edit-btn-u2")).toBeInTheDocument());

    fireEvent.click(screen.getByTestId("edit-btn-u2"));
    expect(screen.getByTestId("edit-username")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("edit-cancel"));
    expect(screen.queryByTestId("edit-username")).not.toBeInTheDocument();
  });

  it("delete user calls API and refreshes", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => expect(screen.getByTestId("delete-btn-u2")).toBeInTheDocument());

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [USERS[0]] });

    await act(async () => {
      fireEvent.click(screen.getByTestId("delete-btn-u2"));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "DELETE" }));
    });
  });
});
