import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "../../test/ionicMocks";
import { GridEditor } from "./GridEditor";
import type { WidgetPlacement } from "./snapLogic";
import {
  TEST_ID_DASHBOARD_GRID_EDITOR,
  TEST_ID_GRID_EDITOR_WIDGET,
  TEST_ID_GRID_EDITOR_WIDGET_DELETE,
  TEST_ID_GRID_EDITOR_ADD_ROW,
  TEST_ID_GRID_EDITOR_SCREEN_EDGE,
} from "../../constants/testIds";

const baseWidgets: WidgetPlacement[] = [
  { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
  { widgetId: "camera", title: "Camera", col: 4, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
];

describe("GridEditor", () => {
  it("renders the grid editor container", () => {
    render(<GridEditor gridType="large-landscape" widgets={[]} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID_EDITOR)).toBeInTheDocument();
  });

  it("renders widgets with correct display names from registry", () => {
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET}-obs`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET}-camera`)).toBeInTheDocument();
    expect(screen.getByText("OBS")).toBeInTheDocument();
    expect(screen.getByText("Camera")).toBeInTheDocument();
  });

  it("displays role and size info on widgets", () => {
    const widgets: WidgetPlacement[] = [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 4, rowSpan: 3, roleMinimum: "ADMIN" }];
    render(<GridEditor gridType="large-landscape" widgets={widgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByText("ADMIN | 4×3")).toBeInTheDocument();
  });

  it("shows delete button for each widget", () => {
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET_DELETE}-obs`)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET_DELETE}-camera`)).toBeInTheDocument();
  });

  it("calls onDeleteWidget when delete button clicked", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} onDeleteWidget={onDelete} />);
    await user.click(screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET_DELETE}-obs`));
    expect(onDelete).toHaveBeenCalledWith("obs");
  });

  it("shows the screen edge indicator line", () => {
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_GRID_EDITOR_SCREEN_EDGE)).toBeInTheDocument();
  });

  it("shows add row button", () => {
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_GRID_EDITOR_ADD_ROW)).toBeInTheDocument();
  });

  it("has resize handle on widgets", () => {
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} />);
    const obsWidget = screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET}-obs`);
    const resizeHandle = obsWidget.querySelector(".grid-editor-resize-handle");
    expect(resizeHandle).toBeInTheDocument();
  });

  it("renders correctly with empty widget list", () => {
    render(<GridEditor gridType="small-portrait" widgets={[]} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_DASHBOARD_GRID_EDITOR)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_GRID_EDITOR_ADD_ROW)).toBeInTheDocument();
  });

  it("adapts grid dimensions to grid type", () => {
    const { rerender } = render(<GridEditor gridType="large-landscape" widgets={[]} onWidgetsChange={vi.fn()} />);
    const container1 = screen.getByTestId(TEST_ID_DASHBOARD_GRID_EDITOR);
    const width1 = container1.style.width;

    rerender(<GridEditor gridType="small-portrait" widgets={[]} onWidgetsChange={vi.fn()} />);
    const container2 = screen.getByTestId(TEST_ID_DASHBOARD_GRID_EDITOR);
    const width2 = container2.style.width;

    // small-portrait (3 cols) should be narrower than large-landscape (11 cols)
    expect(parseFloat(width2)).toBeLessThan(parseFloat(width1));
  });

  it("renders unknown widget types with their title", () => {
    const widgets: WidgetPlacement[] = [{ widgetId: "future-widget", title: "Future", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }];
    render(<GridEditor gridType="large-landscape" widgets={widgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByTestId(`${TEST_ID_GRID_EDITOR_WIDGET}-future-widget`)).toBeInTheDocument();
    expect(screen.getByText("Future")).toBeInTheDocument();
  });

  it("has accessible labels on delete buttons", () => {
    render(<GridEditor gridType="large-landscape" widgets={baseWidgets} onWidgetsChange={vi.fn()} />);
    expect(screen.getByLabelText("Remove OBS")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Camera")).toBeInTheDocument();
  });
});
