import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScriptureReferenceInput } from "./ScriptureReferenceInput";
import {
  TEST_ID_SCRIPTURE_BOOK_SELECT,
  TEST_ID_SCRIPTURE_CHAPTER_SELECT,
  TEST_ID_SCRIPTURE_VERSE_SELECT,
  TEST_ID_SCRIPTURE_VERSE_END_SELECT,
} from "../../constants/testIds";

describe("ScriptureReferenceInput", () => {
  it("renders all four select fields", () => {
    render(
      <ScriptureReferenceInput
        bookId={null}
        chapter={null}
        verse={null}
        verseEnd={null}
        onBookChange={vi.fn()}
        onChapterChange={vi.fn()}
        onVerseChange={vi.fn()}
        onVerseEndChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId(TEST_ID_SCRIPTURE_BOOK_SELECT)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_SCRIPTURE_CHAPTER_SELECT)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_SCRIPTURE_VERSE_SELECT)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_SCRIPTURE_VERSE_END_SELECT)).toBeInTheDocument();
  });

  it("renders with selected values", () => {
    render(
      <ScriptureReferenceInput
        bookId={1}
        chapter={3}
        verse={16}
        verseEnd={17}
        onBookChange={vi.fn()}
        onChapterChange={vi.fn()}
        onVerseChange={vi.fn()}
        onVerseEndChange={vi.fn()}
      />,
    );
    expect(screen.getByText("Genesis")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("16")).toBeInTheDocument();
    expect(screen.getByText("17")).toBeInTheDocument();
  });

  it("renders default options when no book selected", () => {
    render(
      <ScriptureReferenceInput
        bookId={null}
        chapter={null}
        verse={null}
        verseEnd={null}
        onBookChange={vi.fn()}
        onChapterChange={vi.fn()}
        onVerseChange={vi.fn()}
        onVerseEndChange={vi.fn()}
      />,
    );
    // Placeholder text visible for all selects
    expect(screen.getByText("Book")).toBeInTheDocument();
    expect(screen.getByText("Ch")).toBeInTheDocument();
  });
});
