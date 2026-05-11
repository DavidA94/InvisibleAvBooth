import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import { AdminTemplatesPage } from "./AdminTemplatesPage";
import {
  TEST_ID_ADMIN_TEMPLATES_PAGE,
  TEST_ID_TEMPLATE_ITEM,
  TEST_ID_TEMPLATE_FORM_NAME,
  TEST_ID_TEMPLATE_FORM_VALIDATE,
  TEST_ID_TEMPLATE_FORM_SAVE,
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
