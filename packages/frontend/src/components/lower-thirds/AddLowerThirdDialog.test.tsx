import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "../../test/ionicMocks";
import { AddLowerThirdDialog } from "./AddLowerThirdDialog";

vi.mock("../scripture/ScriptureReferenceInput", () => ({
  ScriptureReferenceInput: ({ bookId, chapter, verse, verseEnd, onBookChange, onChapterChange, onVerseChange, onVerseEndChange }: Record<string, unknown>) => (
    <div data-testid="scripture-input">
      <button data-testid="set-book" onClick={() => (onBookChange as (v: number) => void)(1)}>
        Set Book
      </button>
      <button data-testid="set-chapter" onClick={() => (onChapterChange as (v: number) => void)(1)}>
        Set Chapter
      </button>
      <button data-testid="set-verse" onClick={() => (onVerseChange as (v: number) => void)(1)}>
        Set Verse
      </button>
      <button data-testid="set-verse-end" onClick={() => (onVerseEndChange as (v: number) => void)(5)}>
        Set VerseEnd
      </button>
      <span data-testid="scripture-values">{`${bookId}-${chapter}-${verse}-${verseEnd}`}</span>
    </div>
  ),
}));

const onSave = vi.fn();
const onGoLive = vi.fn();
const onCancel = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AddLowerThirdDialog — Title type", () => {
  it("renders title input", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    expect(screen.getByTestId("lt-add-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("lt-add-title-input")).toBeInTheDocument();
  });

  it("save is disabled when title is empty", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    expect(screen.getByTestId("lt-add-save")).toBeDisabled();
  });

  it("calls onSave with correct input when title is filled", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-add-title-input"), { target: { value: "Speaker" } });
    fireEvent.click(screen.getByTestId("lt-add-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: "Title", content: { title: "Speaker" } }));
  });

  it("calls onGoLive with correct input", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-add-title-input"), { target: { value: "Speaker" } });
    fireEvent.click(screen.getByText("Go Live"));
    expect(onGoLive).toHaveBeenCalledWith(expect.objectContaining({ type: "Title", content: { title: "Speaker" } }));
  });

  it("calls onCancel when cancel is clicked", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("lt-add-cancel"));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe("AddLowerThirdDialog — TitleSubtitle type", () => {
  it("renders title and subtitle inputs", () => {
    render(<AddLowerThirdDialog type="TitleSubtitle" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    expect(screen.getByTestId("lt-add-title-input")).toBeInTheDocument();
    expect(screen.getByTestId("lt-add-subtitle-input")).toBeInTheDocument();
  });

  it("save is disabled when only title is filled", () => {
    render(<AddLowerThirdDialog type="TitleSubtitle" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-add-title-input"), { target: { value: "Name" } });
    expect(screen.getByTestId("lt-add-save")).toBeDisabled();
  });

  it("calls onSave with title and subtitle", () => {
    render(<AddLowerThirdDialog type="TitleSubtitle" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-add-title-input"), { target: { value: "Name" } });
    fireEvent.change(screen.getByTestId("lt-add-subtitle-input"), { target: { value: "Role" } });
    fireEvent.click(screen.getByTestId("lt-add-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: "TitleSubtitle", content: { title: "Name", subtitle: "Role" } }));
  });
});

describe("AddLowerThirdDialog — Scripture type", () => {
  it("renders scripture input instead of title input", () => {
    render(<AddLowerThirdDialog type="Scripture" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    expect(screen.getByTestId("scripture-input")).toBeInTheDocument();
    expect(screen.queryByTestId("lt-add-title-input")).not.toBeInTheDocument();
  });

  it("save is disabled until book, chapter, verse are set", () => {
    render(<AddLowerThirdDialog type="Scripture" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    expect(screen.getByTestId("lt-add-save")).toBeDisabled();
  });

  it("calls onSave with scripture reference when all fields set", () => {
    render(<AddLowerThirdDialog type="Scripture" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("set-book"));
    fireEvent.click(screen.getByTestId("set-chapter"));
    fireEvent.click(screen.getByTestId("set-verse"));
    fireEvent.click(screen.getByTestId("lt-add-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ type: "Scripture", content: { reference: { bookId: 1, chapter: 1, verse: 1 } } }));
  });

  it("includes verseEnd when set", () => {
    render(<AddLowerThirdDialog type="Scripture" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("set-book"));
    fireEvent.click(screen.getByTestId("set-chapter"));
    fireEvent.click(screen.getByTestId("set-verse"));
    fireEvent.click(screen.getByTestId("set-verse-end"));
    fireEvent.click(screen.getByTestId("lt-add-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ content: { reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 5 } } }));
  });
});

describe("AddLowerThirdDialog — auto-dismiss", () => {
  it("includes autoDismissMs when toggle is enabled", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-add-title-input"), { target: { value: "Test" } });
    // Enable auto-dismiss toggle — the mock renders a checkbox input
    fireEvent.click(screen.getByTestId("lt-add-autodismiss-toggle"));
    fireEvent.click(screen.getByTestId("lt-add-save"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ autoDismissMs: 10000 }));
  });

  it("does not include autoDismissMs when toggle is disabled", () => {
    render(<AddLowerThirdDialog type="Title" onSave={onSave} onGoLive={onGoLive} onCancel={onCancel} />);
    fireEvent.change(screen.getByTestId("lt-add-title-input"), { target: { value: "Test" } });
    fireEvent.click(screen.getByTestId("lt-add-save"));
    expect(onSave).toHaveBeenCalledWith(expect.not.objectContaining({ autoDismissMs: expect.anything() }));
  });
});
