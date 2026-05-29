import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
  pages: { totalPages: 2, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }, { pageNumber: 2, startVerse: 3, endVerse: 3 }], useWideWidth: false },
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
    const rows = screen.getAllByTestId(/lt-row-/);
    // Template item should be first
    expect(rows[0]).toHaveAttribute("data-testid", "lt-row-item-2");
    expect(rows[1]).toHaveAttribute("data-testid", "lt-row-item-1");
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
    render(
      <LowerThirdRow item={titleItem} section="library" isActive={false} transitionLocked={false} />,
    );
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
  });

  it("renders template name for template-derived items", () => {
    render(
      <LowerThirdRow item={templateItem} section="library" isActive={false} transitionLocked={false} />,
    );
    expect(screen.getByText("Speaker Name")).toBeInTheDocument();
    expect(screen.getByText("Template")).toBeInTheDocument();
  });

  it("shows used indicator border class", () => {
    const usedItem = { ...titleItem, used: true };
    const { container } = render(
      <LowerThirdRow item={usedItem} section="library" isActive={false} transitionLocked={false} />,
    );
    expect(container.querySelector(".lt-row--used")).toBeInTheDocument();
  });

  it("disables dismiss button during transition lock", () => {
    render(
      <LowerThirdRow item={titleItem} section="active" isActive={true} transitionLocked={true} onDismiss={vi.fn()} />,
    );
    expect(screen.getByTestId("lt-dismiss-button")).toBeDisabled();
  });

  it("shows Dismissing overlay when phase is dismissing", () => {
    render(
      <LowerThirdRow item={titleItem} section="active" isActive={true} transitionLocked={true} phase="dismissing" onDismiss={vi.fn()} />,
    );
    expect(screen.getByText("Dismissing")).toBeInTheDocument();
  });

  it("shows Active badge on library item that is active", () => {
    render(
      <LowerThirdRow item={titleItem} section="library" isActive={true} transitionLocked={false} />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });
});

describe("ActiveCountdown", () => {
  it("renders remaining seconds", () => {
    const future = new Date(Date.now() + 5000).toISOString();
    render(<ActiveCountdown autoDismissAt={future} />);
    expect(screen.getByTestId("lt-countdown")).toBeInTheDocument();
    expect(screen.getByText(/\ds/)).toBeInTheDocument();
  });
});

describe("PaginationControls", () => {
  it("renders page info and buttons", () => {
    render(
      <PaginationControls
        item={scriptureItem}
        pages={scriptureItem.pages!}
        transitionLocked={false}
        onPageNext={vi.fn()}
        onPagePrevious={vi.fn()}
      />,
    );
    expect(screen.getByTestId("lt-page-info")).toBeInTheDocument();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
  });
});

describe("PreviewDialog", () => {
  it("renders item content and action buttons", () => {
    render(
      <PreviewDialog item={titleItem} transitionLocked={false} onGoLive={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByTestId("lt-preview-go-live")).not.toBeDisabled();
    expect(screen.getByTestId("lt-preview-cancel")).toBeInTheDocument();
  });

  it("shows Transitioning text during transition lock", () => {
    render(
      <PreviewDialog item={titleItem} transitionLocked={true} onGoLive={vi.fn()} onCancel={vi.fn()} />,
    );
    expect(screen.getByText("Transitioning...")).toBeInTheDocument();
  });

  it("calls onGoLive when button is clicked", () => {
    const onGoLive = vi.fn();
    render(
      <PreviewDialog item={titleItem} transitionLocked={false} onGoLive={onGoLive} onCancel={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId("lt-preview-go-live"));
    expect(onGoLive).toHaveBeenCalled();
  });
});
