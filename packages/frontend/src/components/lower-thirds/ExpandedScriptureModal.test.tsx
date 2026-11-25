import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "../../test/ionicMocks";
import { ExpandedScriptureModal } from "./ExpandedScriptureModal";
import {
  TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON,
  TEST_ID_LOWER_THIRD_EXPANDED_VERSES,
  TEST_ID_LOWER_THIRD_PAGINATION,
  TEST_ID_LOWER_THIRD_PAGE_INFO,
  TEST_ID_MODAL_FOOTER,
} from "../../constants/testIds";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

const verses = [
  { verseNumber: 1, text: "In the beginning" },
  { verseNumber: 2, text: "And the earth was without form" },
  { verseNumber: 3, text: "And God said, Let there be light" },
];

function scripture(currentPage: number, totalPages = 2): LowerThirdItem {
  return {
    id: "s1",
    type: "Scripture",
    style: "blue_rhombus",
    content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 }, formattedReference: "Genesis 1:1-3", verses },
    autoDismissMs: null,
    source: "volunteer",
    templateId: null,
    templateName: null,
    used: true,
    createdAt: "2026-01-01T00:00:00Z",
    pages:
      totalPages === 1
        ? { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 3 }], useWideWidth: false }
        : {
            totalPages: 2,
            currentPage,
            pages: [
              { pageNumber: 1, startVerse: 1, endVerse: 2 },
              { pageNumber: 2, startVerse: 3, endVerse: 3 },
            ],
            useWideWidth: false,
          },
  };
}

function renderModal(props: Partial<Parameters<typeof ExpandedScriptureModal>[0]> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onPageNext: vi.fn(),
    onPagePrevious: vi.fn(),
    onDismissAndClose: vi.fn(),
    onForceClear: vi.fn(),
  };
  render(<ExpandedScriptureModal item={scripture(1)} transitionLocked={false} {...handlers} {...props} />);
  return handlers;
}

describe("ExpandedScriptureModal", () => {
  it("shows the reference and only the verses on the current page", () => {
    renderModal({ item: scripture(1) });
    expect(screen.getByText("Genesis 1:1-3")).toBeInTheDocument();
    const verseList = screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VERSES);
    expect(verseList).toHaveTextContent("In the beginning");
    expect(verseList).toHaveTextContent("And the earth was without form");
    expect(verseList).not.toHaveTextContent("Let there be light");
  });

  it("follows the page when the item's current page changes", () => {
    const { rerender } = render(
      <ExpandedScriptureModal
        item={scripture(1)}
        transitionLocked={false}
        onClose={vi.fn()}
        onPageNext={vi.fn()}
        onPagePrevious={vi.fn()}
        onDismissAndClose={vi.fn()}
        onForceClear={vi.fn()}
      />,
    );
    rerender(
      <ExpandedScriptureModal
        item={scripture(2)}
        transitionLocked={false}
        onClose={vi.fn()}
        onPageNext={vi.fn()}
        onPagePrevious={vi.fn()}
        onDismissAndClose={vi.fn()}
        onForceClear={vi.fn()}
      />,
    );
    const verseList = screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VERSES);
    expect(verseList).toHaveTextContent("Let there be light");
    expect(verseList).not.toHaveTextContent("In the beginning");
  });

  it("shows pagination for multi-page scripture and wires Previous/Next", () => {
    const handlers = renderModal({ item: scripture(1) });
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGINATION)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_PAGE_INFO)).toHaveTextContent("Genesis 1:1-2");
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(handlers.onPageNext).toHaveBeenCalledTimes(1);
  });

  it("enables Previous and disables Next on the last page", () => {
    const handlers = renderModal({ item: scripture(2) });
    expect(screen.getByLabelText("Next page")).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(handlers.onPagePrevious).toHaveBeenCalledTimes(1);
  });

  it("hides pagination for single-page scripture", () => {
    renderModal({ item: scripture(1, 1) });
    expect(screen.queryByTestId(TEST_ID_LOWER_THIRD_PAGINATION)).not.toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_VERSES)).toHaveTextContent("Let there be light");
  });

  it("Close only closes", () => {
    const handlers = renderModal();
    fireEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON));
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(handlers.onDismissAndClose).not.toHaveBeenCalled();
    expect(handlers.onForceClear).not.toHaveBeenCalled();
  });

  it("Dismiss and close calls its handler", () => {
    const handlers = renderModal();
    fireEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON));
    expect(handlers.onDismissAndClose).toHaveBeenCalledTimes(1);
  });

  it("Force Clear calls its handler with no confirmation", () => {
    const handlers = renderModal();
    fireEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON));
    expect(handlers.onForceClear).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/are you sure/i)).not.toBeInTheDocument();
  });

  it("puts Force Clear first (left) and Close / Dismiss and close after it (right)", () => {
    renderModal();
    const footerButtons = within(screen.getByTestId(TEST_ID_MODAL_FOOTER)).getAllByRole("button");
    expect(footerButtons.map((button) => button.textContent)).toEqual(["Force Clear", "Close", "Dismiss and close"]);
  });

  it("under a transition lock disables Dismiss and close and paging, but not Close or Force Clear", () => {
    renderModal({ transitionLocked: true, item: scripture(1) });
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_DISMISS_AND_CLOSE_BUTTON)).toBeDisabled();
    expect(screen.getByLabelText("Next page")).toBeDisabled();
    expect(screen.getByLabelText("Previous page")).toBeDisabled();
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_CLOSE_BUTTON)).not.toBeDisabled();
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_EXPANDED_FORCE_CLEAR_BUTTON)).not.toBeDisabled();
  });
});
