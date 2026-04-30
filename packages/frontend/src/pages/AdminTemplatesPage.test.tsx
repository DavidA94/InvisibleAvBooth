import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminTemplatesPage } from "./AdminTemplatesPage";
import {
  TEST_ID_ADMIN_TEMPLATES_PAGE,
  TEST_ID_TITLE_TEMPLATE_LIST,
  TEST_ID_DESCRIPTION_TEMPLATE_LIST,
  TEST_ID_TEMPLATE_ITEM,
  TEST_ID_TEMPLATE_EDIT_BUTTON,
  TEST_ID_TEMPLATE_DELETE_BUTTON,
  TEST_ID_ADD_TITLE_TEMPLATE_BUTTON,
  TEST_ID_TEMPLATE_FORM_NAME,
  TEST_ID_TEMPLATE_FORM_FORMAT,
  TEST_ID_TEMPLATE_FORM_VALIDATE,
  TEST_ID_TEMPLATE_FORM_SAVE,
  TEST_ID_TEMPLATE_FORM_CANCEL,
  TEST_ID_TEMPLATE_VALIDATION_BLOCKERS,
  TEST_ID_TEMPLATE_VALIDATION_WARNINGS,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
} from "../constants/testIds";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const TEMPLATES = [
  { id: "t1", name: "Default Title", category: "title", formatString: "{Date} – {Speaker} – {Title}", roleMinimum: "AvVolunteer" },
  { id: "t2", name: "None", category: "description", formatString: "", roleMinimum: "AvVolunteer" },
  { id: "t3", name: "Full Description", category: "description", formatString: "Sermon by {Speaker}", roleMinimum: "AvPowerUser" },
];

function mockListTemplates(templates = TEMPLATES): void {
  mockFetch.mockResolvedValueOnce({ ok: true, json: async () => templates });
}

function renderPage(): ReturnType<typeof render> {
  return render(<AdminTemplatesPage />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AdminTemplatesPage", () => {
  it("renders page with template lists", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADMIN_TEMPLATES_PAGE)).toBeInTheDocument();
    });
    expect(screen.getByTestId(TEST_ID_TITLE_TEMPLATE_LIST)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_DESCRIPTION_TEMPLATE_LIST)).toBeInTheDocument();
  });

  it("renders templates from API", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument();
    });
    expect(screen.getByText("Default Title")).toBeInTheDocument();
    expect(screen.getByText("Full Description")).toBeInTheDocument();
  });

  it("shows role badge for non-None templates", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toHaveTextContent("Volunteer");
    expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t3`)).toHaveTextContent("Power User");
  });

  it("None template has no Edit/Delete buttons or role badge", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`)).toBeInTheDocument();
    });
    expect(screen.queryByTestId(`${TEST_ID_TEMPLATE_EDIT_BUTTON}-t2`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`${TEST_ID_TEMPLATE_DELETE_BUTTON}-t2`)).not.toBeInTheDocument();
  });

  it("non-None templates have Edit and Delete buttons", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_EDIT_BUTTON}-t1`)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`${TEST_ID_TEMPLATE_DELETE_BUTTON}-t1`)).toBeInTheDocument();
  });

  it("Add button opens create form", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));
    expect(screen.getByText("New Title Template")).toBeInTheDocument();
  });

  it("Edit button opens edit form with pre-filled data", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_EDIT_BUTTON}-t1`)).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_EDIT_BUTTON}-t1`));
    expect(screen.getByText("Edit Template")).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME)).toHaveValue("Default Title");
  });

  it("validate-then-save flow: Validate shows Save when no blockers", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));
    fireEvent.change(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME), { target: { value: "New" } });
    fireEvent.change(screen.getByTestId(TEST_ID_TEMPLATE_FORM_FORMAT), { target: { value: "{Speaker}" } });

    // Validate returns no blockers
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();
    });
  });

  it("validate-then-save flow: blockers prevent Save", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ blockers: ["Unknown token {Foo}"], warnings: [] }),
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_TEMPLATE_VALIDATION_BLOCKERS)).toHaveTextContent("Unknown token {Foo}");
    });
    expect(screen.queryByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).not.toBeInTheDocument();
  });

  it("shows warnings from validation", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ blockers: [], warnings: ["Multiple volunteer templates"] }),
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_TEMPLATE_VALIDATION_WARNINGS)).toHaveTextContent("Multiple volunteer templates");
    });
  });

  it("editing form field reverts to Validate button", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));

    // Validate successfully
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();
    });

    // Edit a field — should revert to Validate
    fireEvent.change(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME), { target: { value: "Changed" } });
    expect(screen.queryByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).not.toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
  });

  it("Save calls POST for create and refreshes", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));
    fireEvent.change(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME), { target: { value: "New" } });
    fireEvent.change(screen.getByTestId(TEST_ID_TEMPLATE_FORM_FORMAT), { target: { value: "{Speaker}" } });

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: "t4" }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => TEMPLATES });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates", expect.objectContaining({ method: "POST" }));
    });
  });

  it("Save calls PUT for edit", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_EDIT_BUTTON}-t1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_EDIT_BUTTON}-t1`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => TEMPLATES });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates/t1", expect.objectContaining({ method: "PUT" }));
    });
  });

  it("Delete button opens confirmation and calls DELETE", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_TEMPLATE_DELETE_BUTTON}-t1`)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_DELETE_BUTTON}-t1`));
    expect(screen.getByText(/Are you sure you want to delete "Default Title"/)).toBeInTheDocument();

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => TEMPLATES.slice(1) });

    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates/t1", expect.objectContaining({ method: "DELETE" }));
    });
  });

  it("Cancel closes form modal", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(TEST_ID_ADD_TITLE_TEMPLATE_BUTTON));
    expect(screen.getByText("New Title Template")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_CANCEL));
    expect(screen.queryByText("New Title Template")).not.toBeInTheDocument();
  });
});
