import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaginationControls } from "./PaginationControls";
import { TEST_ID_LOWER_THIRD_PAGINATION, TEST_ID_LOWER_THIRD_PAGE_INFO } from "../../constants/testIds";
import type { LowerThirdItem, PageBreakdown } from "@invisible-av-booth/shared";

function makeItem(bookId = 1, chapter = 3): LowerThirdItem {
  return {
    id: "item-1",
    type: "Scripture",
    style: "blue_rhombus",
    content: {
      reference: { bookId, chapter, verse: 1, verseEnd: 6 },
      formattedReference: "Genesis 3:1-6",
      verses: [],
    },
    autoDismissMs: null,
    source: "template",
    templateId: null,
    templateName: null,
    used: false,
    createdAt: "2026-01-01T00:00:00Z",
    pages: null,
  };
}

function makePages(currentPage: number, totalPages: number, pages?: PageBreakdown["pages"]): PageBreakdown {
  return {
    currentPage,
    totalPages,
    useWideWidth: false,
    pages: pages ?? [
      { pageNumber: 1, startVerse: 1, endVerse: 2 },
      { pageNumber: 2, startVerse: 3, endVerse: 4 },
      { pageNumber: 3, startVerse: 5, endVerse: 6 },
    ],
  };
}

describe("PaginationControls", () => {
  it("renders pagination container", () => {
    render(<PaginationControls item={makeItem()} pages={makePages(1, 3)} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGINATION)).toBeInTheDocument();
  });

  it("displays verse range for current page", () => {
    render(<PaginationControls item={makeItem()} pages={makePages(2, 3)} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGE_INFO)).toHaveTextContent("Genesis 3:3-4");
  });

  it("displays single verse when startVerse equals endVerse", () => {
    const pages = makePages(1, 2, [
      { pageNumber: 1, startVerse: 5, endVerse: 5 },
      { pageNumber: 2, startVerse: 6, endVerse: 7 },
    ]);
    render(<PaginationControls item={makeItem()} pages={pages} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGE_INFO)).toHaveTextContent("Genesis 3:5");
  });

  it("disables previous button on first page", () => {
    render(<PaginationControls item={makeItem()} pages={makePages(1, 3)} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
  });

  it("disables next button on last page", () => {
    render(<PaginationControls item={makeItem()} pages={makePages(3, 3)} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("enables both buttons on a middle page", () => {
    render(<PaginationControls item={makeItem()} pages={makePages(2, 3)} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByLabelText("Previous page")).not.toBeDisabled();
    expect(screen.getByLabelText("Next page")).not.toBeDisabled();
  });

  it("disables both buttons when transitionLocked", () => {
    render(<PaginationControls item={makeItem()} pages={makePages(2, 3)} transitionLocked={true} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeDisabled();
  });

  it("calls onPageNext when next button clicked", async () => {
    const user = userEvent.setup();
    const onPageNext = vi.fn();
    render(<PaginationControls item={makeItem()} pages={makePages(1, 3)} transitionLocked={false} onPageNext={onPageNext} onPagePrevious={vi.fn()} />);
    await user.click(screen.getByLabelText("Next page"));
    expect(onPageNext).toHaveBeenCalledOnce();
  });

  it("calls onPagePrevious when previous button clicked", async () => {
    const user = userEvent.setup();
    const onPagePrevious = vi.fn();
    render(<PaginationControls item={makeItem()} pages={makePages(2, 3)} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={onPagePrevious} />);
    await user.click(screen.getByLabelText("Previous page"));
    expect(onPagePrevious).toHaveBeenCalledOnce();
  });

  it("shows empty string when currentPage has no matching page info", () => {
    const pages = makePages(5, 5, [{ pageNumber: 1, startVerse: 1, endVerse: 2 }]);
    render(<PaginationControls item={makeItem()} pages={pages} transitionLocked={false} onPageNext={vi.fn()} onPagePrevious={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGE_INFO)).toHaveTextContent("");
  });

  it("uses correct book name from BIBLE_BOOKS", () => {
    // bookId 19 = Psalms
    render(
      <PaginationControls
        item={makeItem(19, 23)}
        pages={makePages(1, 1, [{ pageNumber: 1, startVerse: 1, endVerse: 6 }])}
        transitionLocked={false}
        onPageNext={vi.fn()}
        onPagePrevious={vi.fn()}
      />,
    );
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGE_INFO)).toHaveTextContent("Psalms 23:1-6");
  });

  it("shows empty book name for unknown bookId", () => {
    render(
      <PaginationControls
        item={makeItem(999, 1)}
        pages={makePages(1, 1, [{ pageNumber: 1, startVerse: 1, endVerse: 3 }])}
        transitionLocked={false}
        onPageNext={vi.fn()}
        onPagePrevious={vi.fn()}
      />,
    );
    // Unknown bookId renders empty string for book name: " 1:1-3"
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGE_INFO)).toHaveTextContent("1:1-3");
  });
});
