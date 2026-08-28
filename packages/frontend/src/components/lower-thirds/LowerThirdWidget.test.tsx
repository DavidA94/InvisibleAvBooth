import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../../test/ionicMocks";
import { LowerThirdWidget } from "./LowerThirdWidget";
import { LowerThirdRow } from "./LowerThirdRow";
import { ActiveCountdown } from "./ActiveCountdown";
import { PaginationControls } from "./PaginationControls";
import { PreviewDialog } from "./PreviewDialog";
import { useStore } from "../../store";
import { INITIAL_LOWER_THIRD_STATE } from "../../store/lowerThirdSlice";
import type { LowerThirdItem, LowerThirdState } from "@invisible-av-booth/shared";

const mockEmit = vi.fn();
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 300,
}));

vi.mock("../scripture/ScriptureReferenceInput", () => ({
  ScriptureReferenceInput: () => <div data-testid="scripture-input" />,
}));

const titleItem: LowerThirdItem = {
  id: "item-1",
  type: "Title",
  style: "blue_rhombus",
  content: { title: "John Smith" },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  pages: null,
};

const templateItem: LowerThirdItem = {
  ...titleItem,
  id: "item-2",
  source: "template",
  templateId: "tmpl-1",
  templateName: "Speaker Name",
};

const scriptureItem: LowerThirdItem = {
  id: "item-3",
  type: "Scripture",
  style: "blue_rhombus",
  content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 }, formattedReference: "Genesis 1:1-3", verses: [] },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:01Z",
  pages: {
    totalPages: 2,
    currentPage: 1,
    pages: [
      { pageNumber: 1, startVerse: 1, endVerse: 2 },
      { pageNumber: 2, startVerse: 3, endVerse: 3 },
    ],
    useWideWidth: false,
  },
};

function setState(partial: Partial<LowerThirdState>): void {
  useStore.setState({
    user: { id: "u1", username: "admin", role: "ADMIN" },
    lowerThirdState: { ...INITIAL_LOWER_THIRD_STATE, ...partial },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setState({});
});

describe("LowerThirdWidget", () => {
  it("renders empty states when nothing is active or in library", () => {
    setState({});
    render(<LowerThirdWidget />);
    expect(screen.getByText("Nothing active")).toBeInTheDocument();
    expect(screen.getByText("No items available")).toBeInTheDocument();
  });

  it("renders active item in Active section", () => {
    setState({ active: titleItem, phase: "visible" });
    render(<LowerThirdWidget />);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.queryByText("Nothing active")).not.toBeInTheDocument();
  });

  it("renders library items sorted: templates first, then volunteer", () => {
    setState({ library: [titleItem, templateItem] });
    render(<LowerThirdWidget />);
    const rows = screen.getAllByTestId(/lower-third-row-/);
    // Template item should be first
    expect(rows[0]).toHaveAttribute("data-testid", "lower-third-row-item-2");
    expect(rows[1]).toHaveAttribute("data-testid", "lower-third-row-item-1");
  });

  it("shows overlay connection indicator as unhealthy when disconnected", () => {
    setState({ overlayConnected: false });
    render(<LowerThirdWidget />);
    // The WidgetContainer renders the connection indicator
    expect(screen.getByText("Lower Thirds")).toBeInTheDocument();
  });
});

describe("LowerThirdRow", () => {
  it("renders title and subtitle for a volunteer item", () => {
    render(<LowerThirdRow item={titleItem} section="library" isActive={false} transitionLocked={false} />);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("renders template name for template-derived items", () => {
    render(<LowerThirdRow item={templateItem} section="library" isActive={false} transitionLocked={false} />);
    expect(screen.getByText("Speaker Name")).toBeInTheDocument();
    expect(screen.getByText("Template")).toBeInTheDocument();
  });

  it("shows used indicator border class", () => {
    const usedItem = { ...titleItem, used: true };
    const { container } = render(<LowerThirdRow item={usedItem} section="library" isActive={false} transitionLocked={false} />);
    expect(container.querySelector(".lt-row--used")).toBeInTheDocument();
  });

  it("disables dismiss button during transition lock", () => {
    render(<LowerThirdRow item={titleItem} section="active" isActive={true} transitionLocked={true} onDismiss={vi.fn()} />);
    expect(screen.getByTestId("lower-third-dismiss-button")).toBeDisabled();
  });

  it("shows Dismissing overlay when phase is dismissing", () => {
    render(<LowerThirdRow item={titleItem} section="active" isActive={true} transitionLocked={true} phase="dismissing" onDismiss={vi.fn()} />);
    expect(screen.getByText("Dismissing")).toBeInTheDocument();
  });

  it("shows Active badge on library item that is active", () => {
    render(<LowerThirdRow item={titleItem} section="library" isActive={true} transitionLocked={false} />);
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("displays formattedReference as title for Scripture items", () => {
    render(<LowerThirdRow item={scriptureItem} section="library" isActive={false} transitionLocked={false} />);
    expect(screen.getByText("Genesis 1:1-3")).toBeInTheDocument();
  });

  it("shows Scripture subtitle with page count", () => {
    render(<LowerThirdRow item={scriptureItem} section="library" isActive={false} transitionLocked={false} />);
    expect(screen.getByText("Scripture · 2 pages")).toBeInTheDocument();
  });

  it("shows Scripture · Pending when pages is null", () => {
    const noPagesItem = { ...scriptureItem, pages: null };
    render(<LowerThirdRow item={noPagesItem} section="library" isActive={false} transitionLocked={false} />);
    expect(screen.getByText("Scripture · Pending")).toBeInTheDocument();
  });

  it("shows Title + Subtitle subtitle for TitleSubtitle items", () => {
    const tsItem: LowerThirdItem = { ...titleItem, type: "TitleSubtitle", content: { title: "Name", subtitle: "Role" } };
    render(<LowerThirdRow item={tsItem} section="library" isActive={false} transitionLocked={false} />);
    expect(screen.getByText("Title + Subtitle")).toBeInTheDocument();
  });

  it("renders Force Clear button in active section", () => {
    const onForceClear = vi.fn();
    render(<LowerThirdRow item={titleItem} section="active" isActive={true} transitionLocked={false} onDismiss={vi.fn()} onForceClear={onForceClear} />);
    const forceClearBtn = screen.getByLabelText("Force Clear");
    fireEvent.click(forceClearBtn);
    expect(onForceClear).toHaveBeenCalled();
  });

  it("renders Go Live button for template items in library", () => {
    const onActivateImmediate = vi.fn();
    render(<LowerThirdRow item={templateItem} section="library" isActive={false} transitionLocked={false} onActivateImmediate={onActivateImmediate} />);
    const goLiveButtons = screen.getAllByLabelText("Go Live");
    fireEvent.click(goLiveButtons[0]!);
    expect(onActivateImmediate).toHaveBeenCalledWith("item-2");
  });

  it("renders Show button for library non-active items", () => {
    const onActivate = vi.fn();
    render(<LowerThirdRow item={titleItem} section="library" isActive={false} transitionLocked={false} onActivate={onActivate} />);
    const showBtn = screen.getByTestId("lower-third-show-button");
    fireEvent.click(showBtn);
    expect(onActivate).toHaveBeenCalledWith("item-1");
  });

  it("renders Edit and Delete buttons for volunteer items in library", () => {
    const onEdit = vi.fn();
    const onRemove = vi.fn();
    render(<LowerThirdRow item={titleItem} section="library" isActive={false} transitionLocked={false} onEdit={onEdit} onRemove={onRemove} />);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(onEdit).toHaveBeenCalledWith(titleItem);
    fireEvent.click(screen.getByLabelText("Delete"));
    expect(onRemove).toHaveBeenCalledWith("item-1");
  });
});

describe("ActiveCountdown", () => {
  it("renders remaining seconds", () => {
    const future = new Date(Date.now() + 5000).toISOString();
    render(<ActiveCountdown autoDismissAt={future} />);
    expect(screen.getByTestId("lower-third-countdown")).toBeInTheDocument();
    expect(screen.getByText(/\ds/)).toBeInTheDocument();
  });
});

describe("PaginationControls", () => {
  it("renders page info and buttons", () => {
    render(<PaginationControls item={scriptureItem} pages={scriptureItem.pages!} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByTestId("lower-third-page-info")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
  });
});

describe("PreviewDialog", () => {
  it("renders item content and action buttons", () => {
    render(<PreviewDialog item={titleItem} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByTestId("lower-third-preview-go-live")).not.toBeDisabled();
    expect(screen.getByTestId("lower-third-preview-cancel")).toBeInTheDocument();
  });

  it("shows Transitioning text during transition lock", () => {
    render(<PreviewDialog item={titleItem} transitionLocked={true} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Transitioning...")).toBeInTheDocument();
  });

  it("calls onGoLive when button is clicked", () => {
    const onGoLive = vi.fn();
    render(<PreviewDialog item={titleItem} transitionLocked={false} onGoLive={onGoLive} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByTestId("lower-third-preview-go-live"));
    expect(onGoLive).toHaveBeenCalled();
  });

  it("renders TitleSubtitle content with title and subtitle", () => {
    const item: LowerThirdItem = { ...titleItem, type: "TitleSubtitle", content: { title: "Name", subtitle: "Role" } };
    render(<PreviewDialog item={item} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Role")).toBeInTheDocument();
  });

  it("renders Scripture content with reference and verses", () => {
    const item: LowerThirdItem = {
      ...titleItem,
      type: "Scripture",
      content: {
        reference: { bookId: 1, chapter: 1, verse: 1 },
        formattedReference: "Genesis 1:1",
        verses: [{ verseNumber: 1, text: "In the beginning" }],
      },
      pages: null,
    };
    render(<PreviewDialog item={item} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Genesis 1:1")).toBeInTheDocument();
    expect(screen.getByText(/In the beginning/)).toBeInTheDocument();
  });

  it("renders Scripture with empty verses (no verse block)", () => {
    const item: LowerThirdItem = {
      ...titleItem,
      type: "Scripture",
      content: { reference: { bookId: 1, chapter: 1, verse: 1 }, formattedReference: "Genesis 1:1", verses: [] },
      pages: null,
    };
    render(<PreviewDialog item={item} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Genesis 1:1")).toBeInTheDocument();
  });

  it("renders Scripture verse without number when verseNumber is 0", () => {
    const item: LowerThirdItem = {
      ...titleItem,
      type: "Scripture",
      content: {
        reference: { bookId: 1, chapter: 1, verse: 1 },
        formattedReference: "Genesis 1:1",
        verses: [{ verseNumber: 0, text: "Some text" }],
      },
      pages: null,
    };
    const { container } = render(<PreviewDialog item={item} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(container.querySelector(".lt-preview-verse-num")).not.toBeInTheDocument();
  });

  it("shows pagination info when item has multiple pages", () => {
    render(<PreviewDialog item={scriptureItem} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("2 pages")).toBeInTheDocument();
  });
});

describe("LowerThirdWidget — Add dropdown flow", () => {
  it("opens dropdown when Add button is clicked", () => {
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText("Title + Subtitle")).toBeInTheDocument();
    expect(screen.getByText("Scripture")).toBeInTheDocument();
  });

  it("opens AddLowerThirdDialog for Title type", () => {
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title"));
    expect(screen.getByTestId("lower-third-add-dialog")).toBeInTheDocument();
  });

  it("opens AddLowerThirdDialog for TitleSubtitle type", () => {
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title + Subtitle"));
    expect(screen.getByTestId("lower-third-add-dialog")).toBeInTheDocument();
  });

  it("opens AddLowerThirdDialog for Scripture type", () => {
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Scripture"));
    expect(screen.getByTestId("lower-third-add-dialog")).toBeInTheDocument();
  });
});

describe("LowerThirdWidget — Edit flow", () => {
  it("opens EditLowerThirdDialog when edit is triggered on volunteer item", () => {
    setState({ library: [titleItem] });
    render(<LowerThirdWidget />);
    // The edit button is in swipe actions — find it by aria-label
    const editButton = screen.getByLabelText("Edit");
    fireEvent.click(editButton);
    expect(screen.getByTestId("lower-third-edit-dialog")).toBeInTheDocument();
  });
});

describe("LowerThirdWidget — handleAddGoLive", () => {
  it("calls sendCommand with activate after successful add-to-library", async () => {
    mockEmit.mockImplementation((_event: string, command: Record<string, unknown>, callback: (r: unknown) => void) => {
      if (command.type === "add-to-library") {
        callback({ success: true, itemId: "new-item-1" });
      } else {
        callback({ success: true });
      }
    });
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title"));
    // Fill in the title — AddLowerThirdDialog renders IonInput which is mocked as <input>
    fireEvent.change(screen.getByTestId("lower-third-add-title-input"), { target: { value: "Live Speaker" } });
    fireEvent.click(screen.getByText("Go Live"));
    // Wait for the promise chain
    await vi.waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "activate", itemId: "new-item-1" }), expect.any(Function));
    });
  });
});

describe("LowerThirdWidget — Pagination controls", () => {
  it("renders PaginationControls when active item has multiple pages", () => {
    setState({ active: scriptureItem, phase: "visible" });
    render(<LowerThirdWidget />);
    expect(screen.getByTestId("lower-third-page-info")).toBeInTheDocument();
  });
});

describe("LowerThirdWidget — deriveOverlayStatus branches", () => {
  it("shows overlay status as inactive when no templates in library", () => {
    setState({ library: [titleItem], overlayConnected: true, overlayResolutionCorrect: true });
    render(<LowerThirdWidget />);
    // No template items → inactive
    const indicators = screen.getByTestId("connection-indicators");
    expect(indicators.querySelector("[data-status='inactive']")).toBeInTheDocument();
  });

  it("shows overlay status as unhealthy when overlay disconnected with templates present", () => {
    setState({ library: [templateItem], overlayConnected: false, overlayResolutionCorrect: true });
    render(<LowerThirdWidget />);
    const indicators = screen.getByTestId("connection-indicators");
    expect(indicators.querySelector("[data-status='unhealthy']")).toBeInTheDocument();
  });

  it("shows overlay status as degraded when connected but resolution incorrect", () => {
    setState({ library: [templateItem], overlayConnected: true, overlayResolutionCorrect: false });
    render(<LowerThirdWidget />);
    const indicators = screen.getByTestId("connection-indicators");
    expect(indicators.querySelector("[data-status='degraded']")).toBeInTheDocument();
  });

  it("shows overlay status as healthy when connected with correct resolution and templates present", () => {
    setState({ library: [templateItem], overlayConnected: true, overlayResolutionCorrect: true });
    render(<LowerThirdWidget />);
    const indicators = screen.getByTestId("connection-indicators");
    expect(indicators.querySelector("[data-status='healthy']")).toBeInTheDocument();
  });
});

describe("LowerThirdWidget — dismiss and force-clear commands", () => {
  it("sends dismiss-active command when dismiss button is clicked on active item", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ active: titleItem, phase: "visible", transitionLocked: false });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByTestId("lower-third-dismiss-button"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "dismiss-active" }), expect.any(Function));
  });

  it("sends force-clear command when force-clear button is clicked on active item", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ active: titleItem, phase: "visible", transitionLocked: false });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByLabelText("Force Clear"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "force-clear" }), expect.any(Function));
  });
});

describe("LowerThirdWidget — library item actions", () => {
  it("sends activate command when Show button is clicked on library item", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ library: [titleItem] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByTestId("lower-third-show-button"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "activate", itemId: "item-1" }), expect.any(Function));
  });

  it("sends activate with skipAnimation when Go Live is clicked on template item", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ library: [templateItem] });
    render(<LowerThirdWidget />);
    const goLiveButtons = screen.getAllByLabelText("Go Live");
    fireEvent.click(goLiveButtons[0]!);
    expect(mockEmit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "activate", itemId: "item-2", skipAnimation: true }),
      expect.any(Function),
    );
  });

  it("sends remove-from-library command when Delete is clicked on volunteer item", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ library: [titleItem] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByLabelText("Delete"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "remove-from-library", itemId: "item-1" }), expect.any(Function));
  });
});

describe("LowerThirdWidget — pagination commands", () => {
  it("sends page-next command when Next page button is clicked", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ active: scriptureItem, phase: "visible", transitionLocked: false });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "page-next" }), expect.any(Function));
  });

  it("does not render PaginationControls when active item has single page", () => {
    const singlePageItem: LowerThirdItem = {
      ...scriptureItem,
      pages: { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 3 }], useWideWidth: false },
    };
    setState({ active: singlePageItem, phase: "visible" });
    render(<LowerThirdWidget />);
    expect(screen.queryByTestId("lower-third-page-info")).not.toBeInTheDocument();
  });

  it("does not render PaginationControls when active item has no pages", () => {
    const noPagesItem: LowerThirdItem = { ...scriptureItem, pages: null };
    setState({ active: noPagesItem, phase: "visible" });
    render(<LowerThirdWidget />);
    expect(screen.queryByTestId("lower-third-page-info")).not.toBeInTheDocument();
  });
});

describe("LowerThirdWidget — handleAddSave (Save without Go Live)", () => {
  it("sends add-to-library command without subsequent activate when Save is clicked", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true, itemId: "new-item-2" });
    });
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title"));
    fireEvent.change(screen.getByTestId("lower-third-add-title-input"), { target: { value: "Saved Speaker" } });
    fireEvent.click(screen.getByTestId("lower-third-add-save"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "add-to-library" }), expect.any(Function));
    // Should NOT call activate after save
    expect(mockEmit).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "activate" }), expect.any(Function));
  });

  it("closes add dialog after save", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true, itemId: "new-item-2" });
    });
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title"));
    fireEvent.change(screen.getByTestId("lower-third-add-title-input"), { target: { value: "Saved Speaker" } });
    fireEvent.click(screen.getByTestId("lower-third-add-save"));
    expect(screen.queryByTestId("lower-third-add-dialog")).not.toBeInTheDocument();
  });
});

describe("LowerThirdWidget — handleAddGoLive failure", () => {
  it("does not send activate when add-to-library returns success: false", async () => {
    mockEmit.mockImplementation((_event: string, command: Record<string, unknown>, callback: (r: unknown) => void) => {
      if (command.type === "add-to-library") {
        callback({ success: false, error: "Something went wrong" });
      } else {
        callback({ success: true });
      }
    });
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title"));
    fireEvent.change(screen.getByTestId("lower-third-add-title-input"), { target: { value: "Failed Speaker" } });
    fireEvent.click(screen.getByText("Go Live"));
    // Wait for promise to settle
    await vi.waitFor(() => {
      expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "add-to-library" }), expect.any(Function));
    });
    // activate should NOT have been called
    expect(mockEmit).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "activate" }), expect.any(Function));
  });
});

describe("LowerThirdWidget — handleEditSave", () => {
  it("sends edit-library-item command and closes dialog", () => {
    mockEmit.mockImplementation((_event: string, _command: unknown, callback: (r: unknown) => void) => {
      callback({ success: true });
    });
    setState({ library: [titleItem] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByTestId("lower-third-edit-dialog")).toBeInTheDocument();
    // Change title
    fireEvent.change(screen.getByTestId("lower-third-edit-title-input"), { target: { value: "Updated Name" } });
    fireEvent.click(screen.getByTestId("lower-third-edit-save"));
    expect(mockEmit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ type: "edit-library-item", itemId: "item-1" }), expect.any(Function));
    // Dialog should close
    expect(screen.queryByTestId("lower-third-edit-dialog")).not.toBeInTheDocument();
  });
});

describe("LowerThirdWidget — Add dropdown toggle", () => {
  it("closes dropdown when Add button is clicked again", () => {
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    expect(screen.getByText("Scripture")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Add"));
    expect(screen.queryByText("Scripture")).not.toBeInTheDocument();
  });
});

describe("LowerThirdWidget — cancel dialogs", () => {
  it("closes add dialog when cancel is clicked", () => {
    setState({ library: [] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByText("Add"));
    fireEvent.click(screen.getByText("Title"));
    expect(screen.getByTestId("lower-third-add-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lower-third-add-cancel"));
    expect(screen.queryByTestId("lower-third-add-dialog")).not.toBeInTheDocument();
  });

  it("closes edit dialog when cancel is clicked", () => {
    setState({ library: [titleItem] });
    render(<LowerThirdWidget />);
    fireEvent.click(screen.getByLabelText("Edit"));
    expect(screen.getByTestId("lower-third-edit-dialog")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("lower-third-edit-cancel"));
    expect(screen.queryByTestId("lower-third-edit-dialog")).not.toBeInTheDocument();
  });
});

describe("LowerThirdWidget — socket disconnected", () => {
  it("resolves with error when socket is null", async () => {
    // Override the useSocket mock to return null
    const socketMock = await import("../../providers/SocketProvider");
    const useSocketSpy = vi.spyOn(socketMock, "useSocket").mockReturnValue(null);

    setState({ active: titleItem, phase: "visible", transitionLocked: false });
    render(<LowerThirdWidget />);
    // Clicking dismiss should not throw — it just resolves with failure
    fireEvent.click(screen.getByTestId("lower-third-dismiss-button"));
    expect(mockEmit).not.toHaveBeenCalled();

    useSocketSpy.mockRestore();
  });
});

describe("LowerThirdWidget — library sorting", () => {
  it("sorts templates alphabetically by templateName", () => {
    const templateA: LowerThirdItem = { ...templateItem, id: "tmpl-a", templateName: "Alpha" };
    const templateZ: LowerThirdItem = { ...templateItem, id: "tmpl-z", templateName: "Zulu" };
    setState({ library: [templateZ, templateA] });
    render(<LowerThirdWidget />);
    const rows = screen.getAllByTestId(/lower-third-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "lower-third-row-tmpl-a");
    expect(rows[1]).toHaveAttribute("data-testid", "lower-third-row-tmpl-z");
  });

  it("sorts volunteer items by createdAt ascending", () => {
    const older: LowerThirdItem = { ...titleItem, id: "vol-old", createdAt: "2026-01-01T00:00:00Z" };
    const newer: LowerThirdItem = { ...titleItem, id: "vol-new", createdAt: "2026-01-02T00:00:00Z" };
    setState({ library: [newer, older] });
    render(<LowerThirdWidget />);
    const rows = screen.getAllByTestId(/lower-third-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "lower-third-row-vol-old");
    expect(rows[1]).toHaveAttribute("data-testid", "lower-third-row-vol-new");
  });

  it("renders templates before volunteer items regardless of createdAt", () => {
    const volunteerOld: LowerThirdItem = { ...titleItem, id: "vol-1", createdAt: "2020-01-01T00:00:00Z" };
    const templateNew: LowerThirdItem = { ...templateItem, id: "tmpl-1", createdAt: "2026-12-01T00:00:00Z" };
    setState({ library: [volunteerOld, templateNew] });
    render(<LowerThirdWidget />);
    const rows = screen.getAllByTestId(/lower-third-row-/);
    expect(rows[0]).toHaveAttribute("data-testid", "lower-third-row-tmpl-1");
    expect(rows[1]).toHaveAttribute("data-testid", "lower-third-row-vol-1");
  });
});

describe("LowerThirdWidget — active item in library shows badge", () => {
  it("marks library item as active when it matches the active item", () => {
    setState({ active: titleItem, library: [titleItem], phase: "visible" });
    render(<LowerThirdWidget />);
    const librarySection = screen.getByTestId("lower-third-library-section");
    expect(librarySection.querySelector(".lt-badge")).toBeInTheDocument();
  });
});

describe("LowerThirdWidget — transitionLocked disables controls", () => {
  it("disables Show button on library items when transition is locked", () => {
    setState({ library: [titleItem], transitionLocked: true });
    render(<LowerThirdWidget />);
    expect(screen.getByTestId("lower-third-show-button")).toBeDisabled();
  });
});
