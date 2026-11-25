import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import {
  TEST_ID_SCRIPTURE_BOOK_SELECT,
  TEST_ID_SCRIPTURE_CHAPTER_SELECT,
  TEST_ID_SCRIPTURE_VERSE_SELECT,
  TEST_ID_SCRIPTURE_VERSE_END_SELECT,
} from "../../constants/testIds";
import userEvent from "@testing-library/user-event";
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

  describe("numbers-only type to search (Req 19.10)", () => {
    function renderInput(props: { bookId?: number | null; chapter?: number | null } = {}): void {
      render(
        <ScriptureReferenceInput
          bookId={props.bookId ?? 19}
          chapter={props.chapter ?? 119}
          verse={null}
          verseEnd={null}
          onBookChange={vi.fn()}
          onChapterChange={onChapterChangeMock}
          onVerseChange={onVerseChangeMock}
          onVerseEndChange={onVerseEndChangeMock}
        />,
      );
    }
    // Query by wrapper test id: the placeholder-based description disappears once a field has a value.
    const FIELD_TEST_IDS: Record<string, string> = {
      Book: TEST_ID_SCRIPTURE_BOOK_SELECT,
      Ch: TEST_ID_SCRIPTURE_CHAPTER_SELECT,
      Verse: TEST_ID_SCRIPTURE_VERSE_SELECT,
      End: TEST_ID_SCRIPTURE_VERSE_END_SELECT,
    };
    const field = (name: string): HTMLInputElement => within(screen.getByTestId(FIELD_TEST_IDS[name]!)).getByRole("combobox") as HTMLInputElement;
    const visibleOptions = (): string[] => screen.queryAllByRole("option").map((option) => option.textContent ?? "");

    it.each(["Ch", "Verse", "End"])("%s asks tablets for the numeric keypad", (description) => {
      renderInput();
      expect(field(description)).toHaveAttribute("inputmode", "numeric");
      expect(field(description)).toHaveAttribute("pattern", "[0-9]*");
    });

    it("discards non-digits as they are typed", async () => {
      renderInput();
      await userEvent.type(field("Verse"), "1a7x");
      expect(field("Verse")).toHaveValue("17");
    });

    it("caps typed input at three digits", async () => {
      renderInput();
      await userEvent.type(field("Verse"), "1234");
      expect(field("Verse")).toHaveValue("123");
    });

    it("filters by prefix: typing 1 lists 1, 10-19, 100+ but not 21", async () => {
      renderInput(); // Psalm 119 has 176 verses
      await userEvent.type(field("Verse"), "1");
      const options = visibleOptions();
      expect(options[0]).toBe("1");
      expect(options).toContain("15");
      expect(options).toContain("176");
      expect(options).not.toContain("21");
    });

    it("Enter selects the exact number typed", async () => {
      onVerseChangeMock.mockClear();
      verseChangeMock.mockReturnValue(null);
      renderInput();
      await userEvent.type(field("Verse"), "17{Enter}");
      expect(onVerseChangeMock).toHaveBeenCalledWith(17);
    });

    it("typing in Chapter selects that chapter", async () => {
      onChapterChangeMock.mockClear();
      chapterChangeMock.mockReturnValue({ chapter: undefined, verse: undefined, verseEnd: undefined });
      renderInput({ chapter: null });
      await userEvent.type(field("Ch"), "23{Enter}");
      expect(onChapterChangeMock).toHaveBeenCalledWith(23);
    });

    it("shows no options for a number that does not exist", async () => {
      renderInput({ bookId: 65, chapter: 1 }); // Jude 1 has 25 verses
      await userEvent.type(field("Verse"), "9");
      expect(visibleOptions()).toEqual(["9"]);
      await userEvent.type(field("Verse"), "9");
      expect(visibleOptions()).toEqual([]);
    });

    it("leaves the book field as a normal text search", async () => {
      renderInput();
      await userEvent.type(field("Book"), "John");
      expect(field("Book")).toHaveValue("John");
      expect(field("Book")).not.toHaveAttribute("inputmode");
    });
  });

  describe("auto-advance on direct selection (Req 19.11)", () => {
    beforeEach(() => {
      // Earlier tests stub the cascade rules; auto-advance must run against the real ones.
      bookChangeMock.mockRestore();
      chapterChangeMock.mockRestore();
      verseChangeMock.mockRestore();
      verseEndChangeMock.mockRestore();
    });

    interface Initial {
      bookId?: number | null;
      chapter?: number | null;
      verse?: number | null;
      verseEnd?: number | null;
    }

    /** Stateful wrapper so selections flow back in as props, the same way the real dialogs use it. */
    function Harness({ initial }: { initial: Initial }): ReturnType<typeof ScriptureReferenceInput> {
      const [bookId, setBookId] = useState<number | null>(initial.bookId ?? null);
      const [chapter, setChapter] = useState<number | null>(initial.chapter ?? null);
      const [verse, setVerse] = useState<number | null>(initial.verse ?? null);
      const [verseEnd, setVerseEnd] = useState<number | null>(initial.verseEnd ?? null);
      return (
        <ScriptureReferenceInput
          bookId={bookId}
          chapter={chapter}
          verse={verse}
          verseEnd={verseEnd}
          onBookChange={setBookId}
          onChapterChange={setChapter}
          onVerseChange={setVerse}
          onVerseEndChange={setVerseEnd}
        />
      );
    }

    const FIELD_TEST_IDS: Record<string, string> = {
      Book: TEST_ID_SCRIPTURE_BOOK_SELECT,
      Ch: TEST_ID_SCRIPTURE_CHAPTER_SELECT,
      Verse: TEST_ID_SCRIPTURE_VERSE_SELECT,
      End: TEST_ID_SCRIPTURE_VERSE_END_SELECT,
    };
    const field = (name: string): HTMLInputElement => within(screen.getByTestId(FIELD_TEST_IDS[name]!)).getByRole("combobox") as HTMLInputElement;
    const pick = (name: string, option: string): Promise<void> => selectEvent.select(field(name), option, { container: document.body });

    it.each`
      from       | option    | initial                       | to
      ${"Book"}  | ${"John"} | ${{}}                         | ${"Ch"}
      ${"Ch"}    | ${"3"}    | ${{ bookId: 43 }}             | ${"Verse"}
      ${"Verse"} | ${"16"}   | ${{ bookId: 43, chapter: 3 }} | ${"End"}
    `("selecting $option in $from moves focus to an empty $to", async ({ from, option, initial, to }) => {
      render(<Harness initial={initial} />);
      await pick(from, option);
      expect(document.activeElement).toBe(field(to));
    });

    it.each`
      from       | option    | initial                                               | next
      ${"Book"}  | ${"John"} | ${{ bookId: 1, chapter: 3 }}                          | ${"Ch"}
      ${"Ch"}    | ${"3"}    | ${{ bookId: 43, chapter: 2, verse: 16 }}              | ${"Verse"}
      ${"Verse"} | ${"16"}   | ${{ bookId: 43, chapter: 3, verse: 1, verseEnd: 18 }} | ${"End"}
    `("selecting $option in $from does not move focus when $next already has a value", async ({ from, option, initial, next }) => {
      render(<Harness initial={initial} />);
      await pick(from, option);
      expect(document.activeElement).not.toBe(field(next));
    });

    it("selecting End does not move focus anywhere else", async () => {
      render(<Harness initial={{ bookId: 43, chapter: 3, verse: 16 }} />);
      await pick("End", "18");
      for (const name of ["Book", "Ch", "Verse"]) expect(document.activeElement).not.toBe(field(name));
    });

    it("walks a whole reference by direct selection: Book → Ch → Verse → End", async () => {
      render(<Harness initial={{}} />);
      await pick("Book", "John");
      expect(document.activeElement).toBe(field("Ch"));
      await pick("Ch", "3");
      expect(document.activeElement).toBe(field("Verse"));
      await pick("Verse", "16");
      expect(document.activeElement).toBe(field("End"));
    });

    it("advances by typing too: focus lands in Chapter, so digits typed next go there", async () => {
      render(<Harness initial={{ bookId: 43 }} />);
      await userEvent.type(field("Ch"), "3{Enter}");
      expect(document.activeElement).toBe(field("Verse"));
      await userEvent.keyboard("16{Enter}");
      expect(document.activeElement).toBe(field("End"));
      expect(screen.getByText("16")).toBeInTheDocument();
    });

    it("moves to Chapter when a book change cascade clears an invalid chapter", async () => {
      render(<Harness initial={{ bookId: 19, chapter: 150 }} />); // Psalms 150 → Jude has 1 chapter
      await pick("Book", "Jude");
      expect(document.activeElement).toBe(field("Ch"));
    });

    it("clearing a field does not move focus", async () => {
      render(<Harness initial={{ bookId: 43, chapter: 3 }} />);
      await selectEvent.clearFirst(field("Ch"));
      expect(document.activeElement).not.toBe(field("Verse"));
    });
  });
});
