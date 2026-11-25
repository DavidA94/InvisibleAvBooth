import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../../test/ionicMocks";
import { ShowPageButton } from "./ShowPageButton";
import { TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON, TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER, TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION } from "../../constants/testIds";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

const item: LowerThirdItem = {
  id: "scripture-1",
  type: "Scripture",
  style: "blue_rhombus",
  content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 5 }, formattedReference: "Genesis 1:1-5", verses: [] },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  pages: {
    totalPages: 3,
    currentPage: 1,
    pages: [
      { pageNumber: 1, startVerse: 1, endVerse: 2 },
      { pageNumber: 2, startVerse: 3, endVerse: 4 },
      { pageNumber: 3, startVerse: 5, endVerse: 5 },
    ],
    useWideWidth: false,
  },
};

function renderButton(overrides: Partial<{ transitionLocked: boolean; onShowPage: (itemId: string, page: number) => void }> = {}) {
  const onShowPage = overrides.onShowPage ?? vi.fn();
  render(<ShowPageButton item={item} pages={item.pages!} transitionLocked={overrides.transitionLocked ?? false} onShowPage={onShowPage} />);
  return { onShowPage };
}

describe("ShowPageButton", () => {
  it("renders a Show page button with its label and the closed state, and no popover", () => {
    renderButton();
    const button = screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON);
    expect(button).toHaveTextContent("Show page");
    expect(button).toHaveAttribute("data-state", "closed");
    expect(screen.queryByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).not.toBeInTheDocument();
  });

  it("opens a popover listing every page with its verse range", () => {
    renderButton();
    fireEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON));

    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON)).toHaveAttribute("data-state", "open");
    expect(screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-1`)).toHaveTextContent("Page 1");
    expect(screen.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-1`)).toHaveTextContent("Genesis 1:1-2");
    expect(screen.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-2`)).toHaveTextContent("Genesis 1:3-4");
    // A single-verse page shows one verse, not "5-5"
    expect(screen.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-3`)).toHaveTextContent("Genesis 1:5");
    expect(screen.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-3`)).not.toHaveTextContent("5-5");
  });

  it("reports the chosen page with the item id and closes the popover", () => {
    const { onShowPage } = renderButton();
    fireEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON));
    fireEvent.click(screen.getByTestId(`${TEST_ID_LOWER_THIRD_SHOW_PAGE_OPTION}-2`));

    expect(onShowPage).toHaveBeenCalledTimes(1);
    expect(onShowPage).toHaveBeenCalledWith("scripture-1", 2);
    expect(screen.queryByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).not.toBeInTheDocument();
  });

  it("sends nothing when the popover is opened and not used", () => {
    const { onShowPage } = renderButton();
    fireEvent.click(screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON));
    expect(onShowPage).not.toHaveBeenCalled();
  });

  it("is disabled under a transition lock and does not open", () => {
    renderButton({ transitionLocked: true });
    const button = screen.getByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_BUTTON);
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(screen.queryByTestId(TEST_ID_LOWER_THIRD_SHOW_PAGE_POPOVER)).not.toBeInTheDocument();
  });
});
