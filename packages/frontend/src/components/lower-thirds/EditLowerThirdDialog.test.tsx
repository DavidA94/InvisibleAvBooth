import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../../test/ionicMocks";
import { EditLowerThirdDialog } from "./EditLowerThirdDialog";
import type { LowerThirdItem } from "@invisible-av-booth/shared";

vi.mock("../scripture/ScriptureReferenceInput", () => ({
  ScriptureReferenceInput: ({ bookId, chapter, verse, verseEnd, onBookChange, onChapterChange, onVerseChange, onVerseEndChange }: Record<string, unknown>) => (
    <div data-testid="scripture-input">
      <button data-testid="set-book" onClick={() => (onBookChange as (v: number) => void)(2)}>
        Set Book
      </button>
      <button data-testid="set-chapter" onClick={() => (onChapterChange as (v: number) => void)(3)}>
        Set Chapter
      </button>
      <button data-testid="set-verse" onClick={() => (onVerseChange as (v: number) => void)(4)}>
        Set Verse
      </button>
      <button data-testid="set-verse-end" onClick={() => (onVerseEndChange as (v: number) => void)(6)}>
        Set VerseEnd
      </button>
      <span data-testid="scripture-values">{`${bookId}-${chapter}-${verse}-${verseEnd}`}</span>
    </div>
  ),
}));

const titleItem: LowerThirdItem = {
  id: "item-1",
  type: "Title",
  style: "blue_rhombus",
  content: { title: "Original Title" },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  pages: null,
};

const titleSubtitleItem: LowerThirdItem = {
  ...titleItem,
  id: "item-2",
  type: "TitleSubtitle",
  content: { title: "Name", subtitle: "Role" },
};

const scriptureItem: LowerThirdItem = {
  ...titleItem,
  id: "item-3",
  type: "Scripture",
  content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 }, formattedReference: "Genesis 1:1-3", verses: [] },
};

const onSave = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("EditLowerThirdDialog — Title type", () => {
  it("renders pre-populated title input", () => {
    render(<EditLowerThirdDialog item={titleItem} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByTestId("lt-edit-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("lt-edit-title-input")).toHaveValue("Original Title");
  });

  it("save is disabled when title is cleared", () => {
    render(<EditLowerThirdDialog item={titleItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-edit-title-input"), { target: { value: "" } });
    expect(screen.getByTestId("lt-edit-save")).toBeDisabled();
  });

  it("calls onSave with item id and title patch", () => {
    render(<EditLowerThirdDialog item={titleItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-edit-title-input"), { target: { value: "New Title" } });
    fireEvent.click(screen.getByTestId("lt-edit-save"));
    expect(onSave).toHaveBeenCalledWith("item-1", expect.objectContaining({ content: { title: "New Title" } }));
  });

  it("calls onCancel when cancel is clicked", () => {
    render(<EditLowerThirdDialog item={titleItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("lt-edit-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("EditLowerThirdDialog — TitleSubtitle type", () => {
  it("renders pre-populated title and subtitle inputs", () => {
    render(<EditLowerThirdDialog item={titleSubtitleItem} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByTestId("lt-edit-title-input")).toHaveValue("Name");
    expect(screen.getByTestId("lt-edit-subtitle-input")).toHaveValue("Role");
  });

  it("save is disabled when subtitle is cleared", () => {
    render(<EditLowerThirdDialog item={titleSubtitleItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-edit-subtitle-input"), { target: { value: "" } });
    expect(screen.getByTestId("lt-edit-save")).toBeDisabled();
  });

  it("calls onSave with both title and subtitle in patch", () => {
    render(<EditLowerThirdDialog item={titleSubtitleItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-edit-title-input"), { target: { value: "New Name" } });
    fireEvent.click(screen.getByTestId("lt-edit-save"));
    expect(onSave).toHaveBeenCalledWith("item-2", expect.objectContaining({ content: { title: "New Name", subtitle: "Role" } }));
  });
});

describe("EditLowerThirdDialog — Scripture type", () => {
  it("renders scripture input with pre-populated values", () => {
    render(<EditLowerThirdDialog item={scriptureItem} onSave={onSave} onCancel={onCancel} />);
    expect(screen.getByTestId("scripture-input")).toBeInTheDocument();
    expect(screen.getByTestId("scripture-values")).toHaveTextContent("1-1-1-3");
  });

  it("calls onSave with updated scripture reference", () => {
    render(<EditLowerThirdDialog item={scriptureItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("set-book"));
    fireEvent.click(screen.getByTestId("set-chapter"));
    fireEvent.click(screen.getByTestId("set-verse"));
    fireEvent.click(screen.getByTestId("lt-edit-save"));
    expect(onSave).toHaveBeenCalledWith("item-3", expect.objectContaining({ content: { reference: { bookId: 2, chapter: 3, verse: 4, verseEnd: 3 } } }));
  });
});

describe("EditLowerThirdDialog — auto-dismiss", () => {
  it("includes autoDismissMs when toggle is enabled", () => {
    render(<EditLowerThirdDialog item={titleItem} onSave={onSave} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-edit-title-input"), { target: { value: "Test" } });
    fireEvent.click(screen.getByTestId("lt-edit-autodismiss-toggle"));
    fireEvent.click(screen.getByTestId("lt-edit-save"));
    expect(onSave).toHaveBeenCalledWith("item-1", expect.objectContaining({ autoDismissMs: 10000 }));
  });

  it("pre-populates auto-dismiss when item has autoDismissMs", () => {
    const itemWithDismiss = { ...titleItem, autoDismissMs: 5000 };
    render(<EditLowerThirdDialog item={itemWithDismiss} onSave={onSave} onCancel={onCancel} />);
    // Toggle should be checked — our mock renders it as a checkbox
    expect(screen.getByTestId("lt-edit-autodismiss-toggle")).toBeChecked();
  });
});
