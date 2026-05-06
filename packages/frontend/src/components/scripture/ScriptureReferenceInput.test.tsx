import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ScriptureReferenceInput } from "./ScriptureReferenceInput";

import * as ScriptureCascade from "./scriptureCascade";
import selectEvent from "react-select-event";

const bookChangeMock = vi.spyOn(ScriptureCascade, "cascadeBookChange");
const chapterChangeMock = vi.spyOn(ScriptureCascade, "cascadeChapterChange");
const verseChangeMock = vi.spyOn(ScriptureCascade, "cascadeVerseChange");
const verseEndChangeMock = vi.spyOn(ScriptureCascade, "cascadeVerseEndChange");

const onBookChangeMock = vi.fn();
const onChapterChangeMock = vi.fn();
const onVerseChangeMock = vi.fn();
const onVerseEndChangeMock = vi.fn();

describe("ScriptureReferenceInput", () => {
  it("renders all four select fields", async () => {
    render(
      <ScriptureReferenceInput
        bookId={null}
        chapter={null}
        verse={null}
        verseEnd={null}
        onBookChange={onBookChangeMock}
        onChapterChange={onChapterChangeMock}
        onVerseChange={onVerseChangeMock}
        onVerseEndChange={onVerseEndChangeMock}
      />,
    );

    await selectEvent.select(screen.getByRole("combobox", { description: "Book" }), "Genesis", { container: document.body });
    await selectEvent.select(screen.getByRole("combobox", { description: "Ch" }), "2", { container: document.body });
    await selectEvent.select(screen.getByRole("combobox", { description: "Verse" }), "3", { container: document.body });
    await selectEvent.select(screen.getByRole("combobox", { description: "End" }), "4", { container: document.body });

    expect(bookChangeMock).toHaveBeenCalledWith(1, { chapter: null, verse: null, verseEnd: null });
    expect(onBookChangeMock).toHaveBeenCalledWith(1);
    expect(chapterChangeMock).toHaveBeenCalledWith(null, 2, { verse: null, verseEnd: null });
    expect(onChapterChangeMock).toHaveBeenCalledWith(2);
    expect(verseChangeMock).toHaveBeenCalledWith(3, null);
    expect(onVerseChangeMock).toHaveBeenCalledWith(3);
    expect(verseEndChangeMock).toHaveBeenCalledWith(null, 4);
    expect(onVerseEndChangeMock).toHaveBeenCalledWith(4);
  });

  it("updates the chapter, verse, and verseEnd on book change", async () => {
    render(
      <ScriptureReferenceInput
        bookId={null}
        chapter={null}
        verse={null}
        verseEnd={null}
        onBookChange={onBookChangeMock}
        onChapterChange={onChapterChangeMock}
        onVerseChange={onVerseChangeMock}
        onVerseEndChange={onVerseEndChangeMock}
      />,
    );

    bookChangeMock.mockReturnValue({ chapter: 1, verse: 2, verseEnd: 3 });

    await selectEvent.select(screen.getByRole("combobox", { description: "Book" }), "Genesis", { container: document.body });

    expect(bookChangeMock).toHaveBeenCalledWith(1, { chapter: null, verse: null, verseEnd: null });
    expect(onBookChangeMock).toHaveBeenCalledWith(1);
    expect(onChapterChangeMock).toHaveBeenCalledWith(2);
    expect(onVerseChangeMock).toHaveBeenCalledWith(3);
    expect(onVerseEndChangeMock).toHaveBeenCalledWith(4);
  });

  it("updates the verse, and verseEnd on chapter change", async () => {
    render(
      <ScriptureReferenceInput
        bookId={1}
        chapter={null}
        verse={5}
        verseEnd={6}
        onBookChange={onBookChangeMock}
        onChapterChange={onChapterChangeMock}
        onVerseChange={onVerseChangeMock}
        onVerseEndChange={onVerseEndChangeMock}
      />,
    );

    chapterChangeMock.mockReturnValue({ chapter: undefined, verse: 2, verseEnd: 3 });

    await selectEvent.select(screen.getByRole("combobox", { description: "Ch" }), "2", { container: document.body });

    expect(chapterChangeMock).toHaveBeenCalledWith(1, 2, { verse: 5, verseEnd: 6 });
    expect(onChapterChangeMock).toHaveBeenCalledWith(2);
    expect(onVerseChangeMock).toHaveBeenCalledWith(3);
    expect(onVerseEndChangeMock).toHaveBeenCalledWith(4);
  });

  it("updates the verse and verseEnd on verse update", async () => {
    render(
      <ScriptureReferenceInput
        bookId={null}
        chapter={null}
        verse={null}
        verseEnd={null}
        onBookChange={onBookChangeMock}
        onChapterChange={onChapterChangeMock}
        onVerseChange={onVerseChangeMock}
        onVerseEndChange={onVerseEndChangeMock}
      />,
    );

    verseChangeMock.mockReturnValue({ verse: 2, verseEnd: 3 });

    await selectEvent.select(screen.getByRole("combobox", { description: "Verse" }), "3", { container: document.body });

    expect(verseChangeMock).toHaveBeenCalledWith(3, null);
    expect(onVerseChangeMock).toHaveBeenCalledWith(3);
    expect(onVerseEndChangeMock).toHaveBeenCalledWith(4);
  });

  it("updates the verse and verseEnd on verse update", async () => {
    render(
      <ScriptureReferenceInput
        bookId={null}
        chapter={null}
        verse={null}
        verseEnd={null}
        onBookChange={onBookChangeMock}
        onChapterChange={onChapterChangeMock}
        onVerseChange={onVerseChangeMock}
        onVerseEndChange={onVerseEndChangeMock}
      />,
    );

    verseEndChangeMock.mockReturnValue({ verse: 2, verseEnd: 3 });

    await selectEvent.select(screen.getByRole("combobox", { description: "End" }), "4", { container: document.body });

    expect(onVerseChangeMock).toHaveBeenCalledWith(3);
    expect(verseEndChangeMock).toHaveBeenCalledWith(null, 4);
    expect(onVerseEndChangeMock).toHaveBeenCalledWith(4);
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
});
