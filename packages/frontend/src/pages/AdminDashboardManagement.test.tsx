import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../test/ionicMocks";
import { AdminDashboardManagement } from "./AdminDashboardManagement";
import {
  TEST_ID_ADMIN_DASHBOARDS_PAGE,
  TEST_ID_DASHBOARD_LIST,
  TEST_ID_DASHBOARD_LIST_ITEM,
  TEST_ID_ADD_DASHBOARD_BUTTON,
  TEST_ID_DASHBOARD_FORM_NAME,
  TEST_ID_DASHBOARD_FORM_SLUG,
  TEST_ID_DASHBOARD_FORM_SAVE,
  TEST_ID_DASHBOARD_DETAIL_EMPTY,
  TEST_ID_DASHBOARD_DETAIL_PANEL,
  TEST_ID_DASHBOARD_GRID_TAB,
  TEST_ID_DASHBOARD_SLUG_ERROR,
  TEST_ID_GRID_EDITOR_ADD_WIDGET,
} from "../constants/testIds";

// Mock react-select
vi.mock("react-select", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  default: ({ options, onChange, value, placeholder }: any) => {
    const opts = options as Array<{ value: string; label: string }>;
    return (
      <select
        data-testid="role-select"
        multiple
        value={value?.map((v: { value: string }) => v.value) ?? []}
        onChange={(e: { target: HTMLSelectElement }) => {
          const selected = Array.from(e.target.selectedOptions).map((opt) => opts.find((o) => o.value === opt.value));
          onChange(selected.filter(Boolean));
        }}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {opts.map((o: { value: string; label: string }) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  },
}));

// Mock GridEditor
vi.mock("../components/grid-editor/GridEditor", () => ({
  GridEditor: ({ gridType, widgets }: { gridType: string; widgets: unknown[] }) => (
    <div data-testid="mock-grid-editor" data-grid-type={gridType} data-widget-count={widgets.length}>
      Mock Grid Editor
    </div>
  ),
  findFirstAvailablePosition: () => ({ col: 0, row: 0 }),
}));

// Mock snap logic
vi.mock("../components/grid-editor/snapLogic", () => ({
  findFirstAvailablePosition: () => ({ col: 0, row: 0 }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const mockDashboards = [
  { id: "d1", slug: "main", name: "Main Dashboard", description: "Primary", allowedRoles: ["AvVolunteer"], isComplete: true },
  { id: "d2", slug: "incomplete", name: "Incomplete", description: "", allowedRoles: [], isComplete: false },
];

const mockDetail = {
  id: "d1",
  slug: "main",
  name: "Main Dashboard",
  description: "Primary",
  allowedRoles: ["AvVolunteer"],
  isComplete: true,
  grids: {
    "large-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "large-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "small-landscape": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
    "small-portrait": [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" }],
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, json: async () => mockDashboards });
});

function renderPage(): ReturnType<typeof render> {
  return render(<AdminDashboardManagement />);
}

describe("AdminDashboardManagement", () => {
  it("renders the page container", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_ADMIN_DASHBOARDS_PAGE)).toBeInTheDocument();
    });
  });

  it("loads and displays dashboard list", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    expect(screen.getByText("Main Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Incomplete")).toBeInTheDocument();
  });

  it("shows empty detail panel initially", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_DETAIL_EMPTY)).toBeInTheDocument();
    });
  });

  it("shows detail panel when Add Dashboard is clicked", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_LIST)).toBeInTheDocument();
    });
    // Wait for loading to finish (list is populated)
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));
    expect(screen.getByTestId(TEST_ID_DASHBOARD_DETAIL_PANEL)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_DASHBOARD_FORM_NAME)).toBeInTheDocument();
  });

  it("loads detail when a dashboard is clicked", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockDashboards }).mockResolvedValueOnce({ ok: true, json: async () => mockDetail });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`));

    await waitFor(() => {
      expect(screen.getByTestId(TEST_ID_DASHBOARD_DETAIL_PANEL)).toBeInTheDocument();
    });
  });

  it("validates slug format in real-time", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));

    const slugInput = screen.getByTestId(TEST_ID_DASHBOARD_FORM_SLUG);
    await userEvent.type(slugInput, "Invalid Slug");

    expect(screen.getByTestId(TEST_ID_DASHBOARD_SLUG_ERROR)).toBeInTheDocument();
  });

  it("does not show slug error for valid slug", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));

    const slugInput = screen.getByTestId(TEST_ID_DASHBOARD_FORM_SLUG);
    await userEvent.type(slugInput, "valid-slug");

    expect(screen.queryByTestId(TEST_ID_DASHBOARD_SLUG_ERROR)).not.toBeInTheDocument();
  });

  it("shows grid tabs", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));

    expect(screen.getByTestId(`${TEST_ID_DASHBOARD_GRID_TAB}-large-landscape`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_DASHBOARD_GRID_TAB}-small-landscape`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_DASHBOARD_GRID_TAB}-large-portrait`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_DASHBOARD_GRID_TAB}-small-portrait`)).toBeInTheDocument();
  });

  it("shows add widget dropdown", async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));

    expect(screen.getByTestId(TEST_ID_GRID_EDITOR_ADD_WIDGET)).toBeInTheDocument();
  });

  it("sends correct payload on save", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockDashboards })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockDetail, id: "new-id", isComplete: false }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => mockDashboards });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));

    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_NAME), "New Dashboard");
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SLUG), "new-dashboard");
    await userEvent.click(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SAVE));

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/admin/dashboards",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining("new-dashboard"),
        }),
      );
    });
  });

  it("shows incomplete toast after saving incomplete dashboard", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockDashboards })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockDetail, isComplete: false }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => mockDashboards });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_NAME), "Test");
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SLUG), "test");
    await userEvent.click(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SAVE));

    await waitFor(() => {
      expect(screen.getByText(/incomplete and not visible/)).toBeInTheDocument();
    });
  });

  it("shows success toast after saving complete dashboard", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => mockDashboards })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ...mockDetail, isComplete: true }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => mockDashboards });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_NAME), "Test");
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SLUG), "test");
    await userEvent.click(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SAVE));

    await waitFor(() => {
      expect(screen.getByText(/saved successfully/)).toBeInTheDocument();
    });
  });

  it("displays form error from server", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockDashboards }).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: "A dashboard with slug 'test' already exists" }),
    });

    renderPage();
    await waitFor(() => {
      expect(screen.getByTestId(`${TEST_ID_DASHBOARD_LIST_ITEM}-d1`)).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId(TEST_ID_ADD_DASHBOARD_BUTTON));
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_NAME), "Test");
    await userEvent.type(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SLUG), "test");
    await userEvent.click(screen.getByTestId(TEST_ID_DASHBOARD_FORM_SAVE));

    await waitFor(() => {
      expect(screen.getByText(/already exists/)).toBeInTheDocument();
    });
  });
});
