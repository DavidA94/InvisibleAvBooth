import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminUserManagement } from "./AdminUserManagement";
import {
  TEST_ID_USER_LIST_ITEM,
  TEST_ID_ADD_USER_BUTTON,
  TEST_ID_USER_DETAIL_EMPTY,
  TEST_ID_USER_FORM_USERNAME,
  TEST_ID_USER_FORM_PASSWORD,
  TEST_ID_USER_FORM_SAVE,
  TEST_ID_USER_FORM_DELETE,
  TEST_ID_USER_FORM_ERROR,
  TEST_ID_USER_FORM_ROLE_SELECT,
  TEST_ID_USER_LIST_DELETE_BUTTON,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_CONFIRMATION_CANCEL_BUTTON,
} from "../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

vi.mock("../hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1", username: "admin", role: "ADMIN" }, isRole: () => true }),
}));

const USERS = [
  { id: "u1", username: "admin", role: "ADMIN", requiresPasswordChange: false, createdAt: "2026-01-01" },
  { id: "u2", username: "volunteer", role: "AvVolunteer", requiresPasswordChange: false, createdAt: "2026-01-02" },
  { id: "u3", username: "poweruser", role: "AvPowerUser", requiresPasswordChange: false, createdAt: "2026-01-03" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

function mockListUsers(users = USERS): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => users });
}

function renderPage(): ReturnType<typeof render> {
  return render(<AdminUserManagement />);
}

describe("AdminUserManagement", () => {
  it("renders user list from API sorted by role then username", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toBeInTheDocument();
    });
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("volunteer")).toBeInTheDocument();
    expect(screen.getByText("poweruser")).toBeInTheDocument();
  });

  it("shows role sublabel", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toHaveTextContent("Admin");
    expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toHaveTextContent("AV Volunteer");
  });

  it("shows empty detail panel initially", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_USER_DETAIL_EMPTY)).toBeInTheDocument();
    });
    expect(screen.getByText("Select a user or add a new one")).toBeInTheDocument();
  });

  it("clicking a user opens edit form in detail panel", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    expect(screen.getByText("Edit volunteer")).toBeInTheDocument();
  });

  it("add user button opens create form", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_USER_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_USER_BUTTON));
    expect(screen.getByText("New User")).toBeInTheDocument();
  });

  it("shows empty state when no users", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [] });
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("No users found")).toBeInTheDocument();
    });
  });

  it("create form submits POST and refreshes list", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_USER_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_USER_BUTTON));

    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "newuser" } }));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_PASSWORD), new CustomEvent("ionInput", { detail: { value: "pass123" } }));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "u4" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [...USERS, { id: "u4", username: "newuser", role: "AvVolunteer" }] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_USER_FORM_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users", expect.objectContaining({ method: "POST" }));
    });
  });

  it("shows error on failed create", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_USER_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_USER_BUTTON));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "taken" } }));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_PASSWORD), new CustomEvent("ionInput", { detail: { value: "pass" } }));

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Username taken" }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_USER_FORM_SAVE));
    });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_USER_FORM_ERROR)).toHaveTextContent("Username taken");
    });
  });

  it("edit form submits PUT and refreshes list", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => USERS[1] });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => USERS });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_USER_FORM_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "PUT" }));
    });
  });
});

describe("AdminUserManagement — delete", () => {
  it("list delete button opens confirmation for non-self user", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u2`));
    expect(screen.getByText(/Are you sure you want to delete "volunteer"/)).toBeInTheDocument();
  });

  it("confirming list delete calls DELETE API", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u2`));

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [USERS[0]] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("self delete button in list is disabled", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u1`)).toBeInTheDocument();
    });

    const deleteButton = screen.getByTestId(`${TEST_ID_USER_LIST_DELETE_BUTTON}-u1`) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
  });

  it("form delete button opens confirmation for non-self user", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    fireEvent.click(screen.getByTestId(TEST_ID_USER_FORM_DELETE));
    expect(screen.getByText(/Are you sure you want to delete "volunteer"/)).toBeInTheDocument();
  });

  it("confirming form delete calls DELETE API", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    fireEvent.click(screen.getByTestId(TEST_ID_USER_FORM_DELETE));

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => [USERS[0]] });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/users/u2", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("self delete button in form is disabled", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`));
    const deleteButton = screen.getByTestId(TEST_ID_USER_FORM_DELETE) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
  });
});

describe("AdminUserManagement — role change", () => {
  it("role dropdown is disabled when editing self", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`));
    const roleSelect = screen.getByTestId(TEST_ID_USER_FORM_ROLE_SELECT);
    const input = roleSelect.querySelector("input");
    expect(input).toHaveAttribute("disabled");
  });

  it("shows explanation text when role is disabled", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u1`));
    expect(screen.getByText("You cannot change your own role")).toBeInTheDocument();
  });

  it("role dropdown is enabled when editing another user", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    const roleSelect = screen.getByTestId(TEST_ID_USER_FORM_ROLE_SELECT);
    const input = roleSelect.querySelector("input");
    expect(input).not.toHaveAttribute("disabled");
  });
});

describe("AdminUserManagement — unsaved changes guard", () => {
  it("warns when navigating away with unsaved changes", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "changed" } }));
    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u3`));

    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();
  });

  it("discarding changes navigates to new user", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "changed" } }));
    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u3`));

    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    expect(screen.getByText("Edit poweruser")).toBeInTheDocument();
  });

  it("staying keeps the current form", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "changed" } }));
    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u3`));

    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    expect(screen.getByText("Edit volunteer")).toBeInTheDocument();
  });

  it("no warning when value reverts to original (a→b→a)", async () => {
    mockListUsers();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u2`));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "changed" } }));
    fireEvent(screen.getByTestId(TEST_ID_USER_FORM_USERNAME), new CustomEvent("ionInput", { detail: { value: "volunteer" } }));

    fireEvent.click(screen.getByTestId(`${TEST_ID_USER_LIST_ITEM}-u3`));
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
    expect(screen.getByText("Edit poweruser")).toBeInTheDocument();
  });
});
