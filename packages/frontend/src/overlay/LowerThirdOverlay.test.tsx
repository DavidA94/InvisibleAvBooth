import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BlueRhombusStyle } from "./styles/BlueRhombusStyle";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

vi.mock("socket.io-client", () => ({ io: vi.fn(() => ({ on: vi.fn(), emit: vi.fn(), disconnect: vi.fn() })) }));

const titleItem: LowerThirdItem = {
  id: "item-1", type: "Title", style: "blue_rhombus", content: { title: "John Smith" },
  autoDismissMs: null, source: "volunteer", templateId: null, templateName: null, used: false, createdAt: "2026-01-01T00:00:00Z", pages: null,
};

const scriptureItem: LowerThirdItem = {
  id: "item-2", type: "Scripture", style: "blue_rhombus",
  content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 }, formattedReference: "Genesis 1:1-2", verses: [{ verseNumber: 1, text: "In the beginning God created the heaven and the earth." }, { verseNumber: 2, text: "And the earth was without form, and void." }] },
  autoDismissMs: null, source: "volunteer", templateId: null, templateName: null, used: false, createdAt: "2026-01-01T00:00:00Z",
  pages: { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }], useWideWidth: false },
};

describe("BlueRhombusStyle", () => {
  it("renders Title content", () => {
    render(<BlueRhombusStyle item={titleItem} phase="visible" onAnimationEnd={vi.fn()} />);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
  });

  it("renders TitleSubtitle content", () => {
    const item: LowerThirdItem = { ...titleItem, type: "TitleSubtitle", content: { title: "John Smith", subtitle: "Senior Pastor" } };
    render(<BlueRhombusStyle item={item} phase="visible" onAnimationEnd={vi.fn()} />);
    expect(screen.getByText("Senior Pastor")).toBeInTheDocument();
  });

  it("renders Scripture reference and verses", () => {
    render(<BlueRhombusStyle item={scriptureItem} phase="visible" onAnimationEnd={vi.fn()} />);
    expect(screen.getByText("Genesis 1:1-2")).toBeInTheDocument();
    expect(screen.getByText(/In the beginning/)).toBeInTheDocument();
  });

  it("applies phase class", () => {
    const { container } = render(<BlueRhombusStyle item={titleItem} phase="showing" onAnimationEnd={vi.fn()} />);
    expect(container.querySelector(".br-phase--showing")).toBeInTheDocument();
  });

  it("renders push-up with prev and new content", () => {
    const prevItem: LowerThirdItem = { ...titleItem, id: "prev", content: { title: "Old Name" } };
    render(<BlueRhombusStyle item={titleItem} prevItem={prevItem} phase="showing" isPushUp={true} onAnimationEnd={vi.fn()} />);
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("Old Name")).toBeInTheDocument();
  });

  it("uses fixed reference for scripture page turn", () => {
    const page2Item: LowerThirdItem = {
      ...scriptureItem,
      pages: { totalPages: 2, currentPage: 2, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }, { pageNumber: 2, startVerse: 2, endVerse: 2 }], useWideWidth: false },
    };
    const { container } = render(
      <BlueRhombusStyle item={page2Item} prevItem={scriptureItem} phase="showing" isPushUp={true} onAnimationEnd={vi.fn()} />,
    );
    expect(screen.getAllByText("Genesis 1:1-2")).toHaveLength(1);
    expect(container.querySelector(".br-verse-area")).toBeInTheDocument();
  });

  it("Force Clear renders nothing when phase is hidden", () => {
    const { container } = render(<BlueRhombusStyle item={titleItem} phase="hidden" onAnimationEnd={vi.fn()} />);
    expect(container.querySelector(".br-phase--hidden")).toBeInTheDocument();
  });
});

describe("measureScripture", () => {
  it("rejects when signal is already aborted", async () => {
    const { measureScripture } = await import("./measureScripture");
    const controller = new AbortController();
    controller.abort();
    await expect(measureScripture([], controller.signal)).rejects.toThrow("aborted");
  });
});
