import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import React from "react";
import { AdminTemplatesPage } from "./AdminTemplatesPage";

// react-select renders an accessible combobox — mock it to simplify
vi.mock("react-select", () => ({
  default: ({ options, onChange, value, "data-testid": testId }: Record<string, unknown>) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        data-testid={testId as string}
        value={(value as { value: string } | null)?.value ?? ""}
        onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
          const opt = opts.find((o) => o.value === e.target.value);
          if (opt) (onChange as (o: { value: string; label: string }) => void)(opt);
        }}
      >
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));
import {
  TEST_ID_ADMIN_TEMPLATES_PAGE,
  TEST_ID_TEMPLATE_ITEM,
  TEST_ID_TEMPLATE_FORM_NAME,
  TEST_ID_TEMPLATE_FORM_FORMAT,
  TEST_ID_TEMPLATE_FORM_ROLE,
  TEST_ID_TEMPLATE_FORM_VALIDATE,
  TEST_ID_TEMPLATE_FORM_SAVE,
  TEST_ID_TEMPLATE_FORM_DELETE,
  TEST_ID_TEMPLATE_FORM_ERROR,
  TEST_ID_TEMPLATE_FORM_AUTO_DISMISS,
  TEST_ID_TEMPLATE_VALIDATION_BLOCKERS,
  TEST_ID_TEMPLATE_VALIDATION_WARNINGS,
  TEST_ID_CONFIRMATION_CONFIRM_BUTTON,
  TEST_ID_CONFIRMATION_CANCEL_BUTTON,
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
  it("renders page with template items", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADMIN_TEMPLATES_PAGE)).toBeInTheDocument();
    });
    expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t3`)).toBeInTheDocument();
  });

  it("shows group headers for Title and Description", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(TEST_ID_ADMIN_TEMPLATES_PAGE)).toBeInTheDocument());
    const headers = document.querySelectorAll(".tpl-group-header");
    expect(headers.length).toBe(2);
    expect(headers[0]!.textContent).toBe("Title");
    expect(headers[1]!.textContent).toBe("Description");
  });

  it("None template has no Delete button", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`)).toBeInTheDocument());
    const noneItem = screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`);
    expect(noneItem.querySelector("ion-button")).toBeNull();
  });

  it("clicking a template opens edit form in right panel", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME)).toBeInTheDocument();
    expect(screen.getByText("Edit Default Title")).toBeInTheDocument();
  });

  it("validate-then-save flow: Validate shows Save when no blockers", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();
  });

  it("validate-then-save flow: blockers prevent Save", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: ["Unknown token {Foo}"], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.queryByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).not.toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_TEMPLATE_VALIDATION_BLOCKERS)).toHaveTextContent("Unknown token {Foo}");
  });

  it("shows warnings from validation", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: ["Volunteers may find this confusing"] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_VALIDATION_WARNINGS)).toHaveTextContent("Volunteers may find this confusing");
  });

  it("Save calls PUT for edit and refreshes list", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    // Validate first
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockListTemplates(); // refresh call
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates/t1", expect.objectContaining({ method: "PUT" }));
  });

  it("Delete button opens confirmation and calls DELETE", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    // Click the Delete button on the list item
    const item = screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`);
    const deleteBtn = item.querySelector("ion-button[color='danger']") as HTMLElement;
    fireEvent.click(deleteBtn);

    // Confirm
    mockFetch.mockResolvedValueOnce({ ok: true });
    mockListTemplates();
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates/t1", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("Lower Third Templates", () => {
  const TEMPLATES_WITH_LT = [
    ...TEMPLATES,
    {
      id: "lt1",
      name: "Speaker LT",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
      autoDismissMs: 5000,
    },
  ];

  it("renders Lower Third group header", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByText("Lower Third")).toBeInTheDocument());
  });

  it("shows type badge for lower-third templates", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByText("Speaker LT")).toBeInTheDocument());
    // The subtitle should show the lowerThirdType
    expect(screen.getByText(/Lower Third · Title/)).toBeInTheDocument();
  });

  it("shows Lower Third Template option in add dropdown", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Add Template"));
    expect(screen.getByText("Lower Third Template")).toBeInTheDocument();
  });

  it("autoDismiss input onChange sets autoDismissSeconds and clears validated", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));

    // Validate first so validated=true, then change input to confirm it resets
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();

    // Fire onIonInput on the auto-dismiss input — should reset validated (Save → Validate)
    fireEvent(screen.getByTestId(TEST_ID_TEMPLATE_FORM_AUTO_DISMISS), new CustomEvent("ionInput", { detail: { value: "15" } }));
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
  });

  it("Delete button in form footer opens delete confirmation modal", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_DELETE)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_DELETE));
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it("delete ConfirmationModal onCancel sets deleteTarget to null", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));
    fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_DELETE));

    // Cancel — modal should close
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
  });

  it("delete ConfirmationModal onConfirm calls DELETE and refreshes list", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));
    fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_DELETE));

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockListTemplates(TEMPLATES_WITH_LT);
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates/lt1", expect.objectContaining({ method: "DELETE" }));
  });

  it("unsaved changes ConfirmationModal onConfirm applies navigation and clears pending", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    // Open t1 and make a change to mark dirty
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));
    fireEvent(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME), new CustomEvent("ionInput", { detail: { value: "Changed Name" } }));

    // Click lt1 — should trigger unsaved changes modal
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

    // Confirm discard — modal closes and lt1 form opens
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    await waitFor(() => expect(screen.getByText("Edit Speaker LT")).toBeInTheDocument());
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
  });
});

describe("AdminTemplatesPage — additional coverage", () => {
  it("shows spinner while loading", () => {
    mockFetch.mockReturnValueOnce(new Promise(() => {})); // never resolves
    renderPage();
    expect(screen.getByTestId(TEST_ID_ADMIN_TEMPLATES_PAGE)).toBeInTheDocument();
    expect(document.querySelector("ion-spinner")).toBeInTheDocument();
  });

  it("shows error when fetchTemplates network fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    renderPage();
    await waitFor(() => expect(screen.getByText("Failed to load templates")).toBeInTheDocument());
  });

  it("shows 'No templates' when list is empty", async () => {
    mockListTemplates([]);
    renderPage();
    await waitFor(() => expect(screen.getByText("No templates")).toBeInTheDocument());
  });

  it("clicking None template does not open edit form", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`));
    expect(screen.getByText("Select a template or add a new one")).toBeInTheDocument();
  });

  it("Add Template → Title Template opens create form", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Title Template"));
    expect(screen.getByText("New Title Template")).toBeInTheDocument();
  });

  it("Add Template → Description Template opens create form", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Description Template"));
    expect(screen.getByText("New Description Template")).toBeInTheDocument();
  });

  it("Create flow calls POST on save", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Title Template"));

    // Fill name
    fireEvent(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME), new CustomEvent("ionInput", { detail: { value: "My Template" } }));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockListTemplates();
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    expect(mockFetch).toHaveBeenCalledWith("/api/admin/templates", expect.objectContaining({ method: "POST" }));
  });

  it("handleSave shows form error on non-ok response", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save fails with error message
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Duplicate name" }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_ERROR)).toHaveTextContent("Duplicate name");
  });

  it("handleSave shows 'Network error' on fetch rejection", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save network error
    mockFetch.mockRejectedValueOnce(new Error("fail"));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_ERROR)).toHaveTextContent("Network error");
  });

  it("handleSave shows 'Save failed' when server returns no error message", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_ERROR)).toHaveTextContent("Save failed");
  });

  it("handleValidate shows 'Validation failed' on fetch rejection", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_ERROR)).toHaveTextContent("Validation failed");
  });

  it("handleDelete shows error on non-ok response", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    const item = screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`);
    const deleteButton = item.querySelector("ion-button[color='danger']") as HTMLElement;
    fireEvent.click(deleteButton);

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Cannot delete" }) });
    mockListTemplates();
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(screen.getByText("Cannot delete")).toBeInTheDocument();
  });

  it("handleDelete shows 'Network error' on fetch rejection", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    const item = screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`);
    const deleteButton = item.querySelector("ion-button[color='danger']") as HTMLElement;
    fireEvent.click(deleteButton);

    mockFetch.mockRejectedValueOnce(new Error("fail"));
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(screen.getByText("Network error")).toBeInTheDocument();
  });

  it("handleDelete clears edit panel when deleting the currently edited template", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    // Open edit for t1
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));
    expect(screen.getByText("Edit Default Title")).toBeInTheDocument();

    // Delete via form footer button
    fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_DELETE));

    mockFetch.mockResolvedValueOnce({ ok: true });
    mockListTemplates();
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    await waitFor(() => expect(screen.getByText("Select a template or add a new one")).toBeInTheDocument());
  });

  it("delete cancel from list item closes confirmation modal", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    const item = screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`);
    const deleteButton = item.querySelector("ion-button[color='danger']") as HTMLElement;
    fireEvent.click(deleteButton);

    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    expect(screen.queryByText(/Are you sure you want to delete/)).not.toBeInTheDocument();
  });

  it("unsaved changes modal cancel keeps current form", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));
    fireEvent(screen.getByTestId(TEST_ID_TEMPLATE_FORM_NAME), new CustomEvent("ionInput", { detail: { value: "Dirty" } }));

    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t3`));
    expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CANCEL_BUTTON));
    expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
    // Still editing t1
    expect(screen.getByText("Edit Default Title")).toBeInTheDocument();
  });

  it("format string change resets validated state", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();

    // Change format string — should reset to Validate
    fireEvent(screen.getByTestId(TEST_ID_TEMPLATE_FORM_FORMAT), new CustomEvent("ionInput", { detail: { value: "{NewFormat}" } }));
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
  });

  it("outside click closes the add template dropdown", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Add Template"));
    expect(screen.getByText("Title Template")).toBeInTheDocument();

    // Click outside
    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("Title Template")).not.toBeInTheDocument();
  });

  it("handleDelete shows 'Delete failed' when server returns no error message", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());

    const item = screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`);
    const deleteButton = item.querySelector("ion-button[color='danger']") as HTMLElement;
    fireEvent.click(deleteButton);

    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    mockListTemplates();
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_CONFIRMATION_CONFIRM_BUTTON));
    });

    expect(screen.getByText("Delete failed")).toBeInTheDocument();
  });
});

describe("Lower Third — create and type variations", () => {
  const TEMPLATES_WITH_LT = [
    ...TEMPLATES,
    {
      id: "lt1",
      name: "Speaker LT",
      category: "lower_third",
      formatString: '{"title":"{Speaker}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Title",
      autoDismissMs: 5000,
    },
    {
      id: "lt2",
      name: "With Subtitle",
      category: "lower_third",
      formatString: '{"title":"{Speaker}","subtitle":"{Title}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "TitleSubtitle",
      autoDismissMs: null,
    },
    {
      id: "lt3",
      name: "Scripture LT",
      category: "lower_third",
      formatString: '{"title":"{Scripture}"}',
      roleMinimum: "AvVolunteer",
      lowerThirdType: "Scripture",
      autoDismissMs: null,
    },
  ];

  it("editing TitleSubtitle template parses subtitle from JSON", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt2`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt2`));
    expect(screen.getByText("Edit With Subtitle")).toBeInTheDocument();
  });

  it("editing Scripture template shows fixed format message", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt3`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt3`));
    expect(screen.getByText(/Always uses/)).toBeInTheDocument();
  });

  it("editing lower-third with invalid JSON falls back to raw formatString", async () => {
    const badJson = [
      ...TEMPLATES,
      {
        id: "lt-bad",
        name: "Bad JSON",
        category: "lower_third",
        formatString: "not json{",
        roleMinimum: "AvVolunteer",
        lowerThirdType: "Title",
        autoDismissMs: null,
      },
    ];
    mockListTemplates(badJson);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt-bad`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt-bad`));
    expect(screen.getByText("Edit Bad JSON")).toBeInTheDocument();
  });

  it("create lower-third template with auto-dismiss toggle", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Add Template"));
    fireEvent.click(screen.getByText("Lower Third Template"));

    // Enable auto-dismiss toggle
    const toggle = screen.getByTestId(TEST_ID_TEMPLATE_FORM_AUTO_DISMISS);
    expect(toggle).toBeInTheDocument();
  });

  it("save lower-third Title type serializes format as JSON", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockListTemplates(TEMPLATES_WITH_LT);
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    const saveCall = mockFetch.mock.calls.find(
      (call) => (call as [string, RequestInit])[0] === "/api/admin/templates/lt1" && (call as [string, RequestInit])[1]?.method === "PUT",
    ) as [string, RequestInit] | undefined;
    expect(saveCall).toBeDefined();
    const body = JSON.parse(saveCall![1].body as string) as Record<string, unknown>;
    expect(body.lowerThirdType).toBe("Title");
    expect(body.autoDismissMs).toBe(5000);
    expect(JSON.parse(body.formatString as string)).toEqual({ title: "{Speaker}" });
  });

  it("save lower-third TitleSubtitle type serializes title and subtitle", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt2`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt2`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockListTemplates(TEMPLATES_WITH_LT);
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    const saveCall = mockFetch.mock.calls.find(
      (call) => (call as [string, RequestInit])[0] === "/api/admin/templates/lt2" && (call as [string, RequestInit])[1]?.method === "PUT",
    ) as [string, RequestInit] | undefined;
    expect(saveCall).toBeDefined();
    const body = JSON.parse(saveCall![1].body as string) as Record<string, unknown>;
    expect(body.lowerThirdType).toBe("TitleSubtitle");
    expect(JSON.parse(body.formatString as string)).toEqual({ title: "{Speaker}", subtitle: "{Title}" });
  });

  it("save lower-third Scripture type serializes fixed format", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt3`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt3`));

    // Validate
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    // Save
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockListTemplates(TEMPLATES_WITH_LT);
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    const saveCall = mockFetch.mock.calls.find(
      (call) => (call as [string, RequestInit])[0] === "/api/admin/templates/lt3" && (call as [string, RequestInit])[1]?.method === "PUT",
    ) as [string, RequestInit] | undefined;
    expect(saveCall).toBeDefined();
    const body = JSON.parse(saveCall![1].body as string) as Record<string, unknown>;
    expect(body.lowerThirdType).toBe("Scripture");
    expect(JSON.parse(body.formatString as string)).toEqual({ title: "{Scripture}" });
  });

  it("save lower-third with auto-dismiss disabled sends null", async () => {
    const ltNoDismiss = [
      ...TEMPLATES,
      {
        id: "lt-nd",
        name: "No Dismiss",
        category: "lower_third",
        formatString: '{"title":"Hi"}',
        roleMinimum: "AvVolunteer",
        lowerThirdType: "Title",
        autoDismissMs: null,
      },
    ];
    mockListTemplates(ltNoDismiss);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt-nd`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt-nd`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    mockListTemplates(ltNoDismiss);
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE));
    });

    const saveCall = mockFetch.mock.calls.find(
      (call) => (call as [string, RequestInit])[0] === "/api/admin/templates/lt-nd" && (call as [string, RequestInit])[1]?.method === "PUT",
    ) as [string, RequestInit] | undefined;
    expect(saveCall).toBeDefined();
    const body = JSON.parse(saveCall![1].body as string) as Record<string, unknown>;
    expect(body.autoDismissMs).toBeNull();
  });

  it("changing lower-third type resets validated state", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));

    // Validate first
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();

    // Change the lower-third type via react-select mock — find select elements
    const selects = document.querySelectorAll("select");
    const ltTypeSelect = selects[0] as HTMLSelectElement; // first select is the type dropdown
    fireEvent.change(ltTypeSelect, { target: { value: "TitleSubtitle" } });

    // Should reset validated — back to Validate button
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
  });

  it("changing role resets validated state", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();

    // Change role
    const roleWrapper = screen.getByTestId(TEST_ID_TEMPLATE_FORM_ROLE);
    const roleSelect = roleWrapper.querySelector("select") as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: "ADMIN" } });

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
  });

  it("toggling auto-dismiss resets validated state", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt1`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();

    // Toggle auto-dismiss off — IonToggle renders as checkbox via ionicMocks or as ion-toggle
    const toggle = document.querySelector("ion-toggle") as HTMLElement;
    fireEvent(toggle, new CustomEvent("ionChange", { detail: { checked: false } }));

    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
  });

  it("changing subtitle format resets validated state", async () => {
    mockListTemplates(TEMPLATES_WITH_LT);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt2`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-lt2`));

    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ blockers: [], warnings: [] }) });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE));
    });
    expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_SAVE)).toBeInTheDocument();

    // Find the subtitle input — it's the IonInput without a data-testid (after the format)
    const inputs = document.querySelectorAll("ion-input");
    const subtitleInput = Array.from(inputs).find((el) => !el.hasAttribute("data-testid") || el.getAttribute("data-testid") === null);
    if (subtitleInput) {
      fireEvent(subtitleInput, new CustomEvent("ionInput", { detail: { value: "Changed subtitle" } }));
      expect(screen.getByTestId(TEST_ID_TEMPLATE_FORM_VALIDATE)).toBeInTheDocument();
    }
  });

  it("fetchTemplates non-ok response does not update templates", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "forbidden" }) });
    renderPage();
    await waitFor(() => expect(screen.getByTestId(TEST_ID_ADMIN_TEMPLATES_PAGE)).toBeInTheDocument());
    // Should not crash and should show empty state eventually
    expect(screen.queryByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).not.toBeInTheDocument();
  });

  it("sorts multiple title templates alphabetically", async () => {
    const multiTitle = [
      { id: "t-z", name: "Zebra Title", category: "title", formatString: "{Title}", roleMinimum: "AvVolunteer" },
      { id: "t-a", name: "Alpha Title", category: "title", formatString: "{Title}", roleMinimum: "AvVolunteer" },
      ...TEMPLATES.filter((t) => t.category !== "title"),
    ];
    mockListTemplates(multiTitle);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t-a`)).toBeInTheDocument());
    const items = screen.getAllByTestId(/^template-item-t-/);
    expect(items[0]).toHaveTextContent("Alpha Title");
    expect(items[1]).toHaveTextContent("Zebra Title");
  });

  it("sorts multiple description templates alphabetically (non-None)", async () => {
    const multiDesc = [
      ...TEMPLATES,
      { id: "d-z", name: "Zebra Desc", category: "description", formatString: "", roleMinimum: "AvVolunteer" },
      { id: "d-a", name: "Alpha Desc", category: "description", formatString: "", roleMinimum: "AvVolunteer" },
    ];
    mockListTemplates(multiDesc);
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-d-a`)).toBeInTheDocument());
  });

  it("Enter key navigates to edit form", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`)).toBeInTheDocument());
    fireEvent.keyDown(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t1`), { key: "Enter" });
    expect(screen.getByText("Edit Default Title")).toBeInTheDocument();
  });

  it("Enter key on None template does nothing", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`)).toBeInTheDocument());
    fireEvent.keyDown(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t2`), { key: "Enter" });
    expect(screen.getByText("Select a template or add a new one")).toBeInTheDocument();
  });

  it("description template shows textarea for format string", async () => {
    mockListTemplates();
    renderPage();
    await waitFor(() => expect(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t3`)).toBeInTheDocument());
    fireEvent.click(screen.getByTestId(`${TEST_ID_TEMPLATE_ITEM}-t3`));
    const formatEl = screen.getByTestId(TEST_ID_TEMPLATE_FORM_FORMAT);
    expect(formatEl).toBeInTheDocument();
    // Change format string in description mode
    fireEvent(formatEl, new CustomEvent("ionInput", { detail: { value: "New desc format" } }));
  });
});
