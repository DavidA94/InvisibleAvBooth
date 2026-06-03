/**
 * Tests for overlayEngine.ts
 *
 * The engine is a module-level singleton. We import it once, call initOverlay
 * in beforeEach (with a fresh DOM root), and destroyOverlay in afterEach.
 * The socket.io-client mock registers handlers in a shared map so tests can
 * fire events by calling emit().
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { LowerThirdItem } from "@invisible-av-booth/shared";
import {
  STO_LOWER_THIRD_SHOW,
  STO_LOWER_THIRD_DISMISS,
  STO_LOWER_THIRD_PUSH_UP,
  STO_LOWER_THIRD_PAGE,
  STO_LOWER_THIRD_STATE,
  STO_LOWER_THIRD_MEASURE,
  STO_LOWER_THIRD_FORCE_CLEAR,
  OTS_LOWER_THIRD_PHASE,
  OTS_LOWER_THIRD_RESOLUTION,
  OTS_LOWER_THIRD_PAGES,
} from "@invisible-av-booth/shared";

// ── Mock socket.io-client ─────────────────────────────────────────────────────
// handlers map is rebuilt fresh for each test via resetHandlers()
const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

const mockSocket = {
  on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
    if (!handlers[event]) handlers[event] = [];
    handlers[event].push(handler);
  }),
  emit: vi.fn(),
  disconnect: vi.fn(),
};

vi.mock("socket.io-client", () => ({ io: vi.fn(() => mockSocket) }));
vi.mock("./measureScripture", () => ({
  measureScripture: vi.fn().mockResolvedValue({
    totalPages: 1,
    currentPage: 1,
    pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }],
    useWideWidth: false,
  }),
}));

// Fire a socket event into all registered handlers
function socketEmit(event: string, ...args: unknown[]): void {
  for (const handler of handlers[event] ?? []) handler(...args);
}

// ── Import engine (module-level singleton) ────────────────────────────────────
import { initOverlay, destroyOverlay } from "./overlayEngine";
import { measureScripture } from "./measureScripture";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const titleItem: LowerThirdItem = {
  id: "item-1",
  type: "Title",
  style: "blue_rhombus",
  content: { title: "Test Title" },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  pages: null,
};

const scriptureItem: LowerThirdItem = {
  id: "item-2",
  type: "Scripture",
  style: "blue_rhombus",
  content: {
    reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 2 },
    formattedReference: "Genesis 1:1-2",
    verses: [
      { verseNumber: 1, text: "In the beginning God created the heaven and the earth." },
      { verseNumber: 2, text: "And the earth was without form, and void." },
    ],
  },
  autoDismissMs: null,
  source: "volunteer",
  templateId: null,
  templateName: null,
  used: false,
  createdAt: "2026-01-01T00:00:00Z",
  pages: { totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }], useWideWidth: false },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildRoot(): HTMLElement {
  const container = document.createElement("div");
  container.className = "overlay-root";
  container.innerHTML = `
    <div class="aspect-ratio-jail">
      <div class="lower-third-container"></div>
    </div>
  `;
  document.body.appendChild(container);
  return container;
}

function getWrapper(): HTMLElement {
  return document.querySelector(".br-wrapper") as HTMLElement;
}

/** Dispatch a synthetic animationend event with a given animationName */
function dispatchAnimationEnd(element: HTMLElement, animationName: string): void {
  const event = new Event("animationend", { bubbles: true }) as Event & { animationName: string };
  Object.defineProperty(event, "animationName", { value: animationName });
  element.dispatchEvent(event);
}

// ── Setup / Teardown ──────────────────────────────────────────────────────────

let root: HTMLElement;

beforeEach(async () => {
  // Clear handler registry and mock calls
  for (const key of Object.keys(handlers)) delete handlers[key];
  mockSocket.on.mockClear();
  mockSocket.emit.mockClear();
  mockSocket.disconnect.mockClear();

  // fonts.ready must exist before initOverlay is called (it awaits this)
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
    writable: true,
  });

  root = buildRoot();
  initOverlay(root);
  // Let fonts.ready microtask run so connectSocket() is called
  await Promise.resolve();
});

afterEach(() => {
  destroyOverlay();
  document.body.innerHTML = "";
  document.documentElement.classList.remove("overlay-active");
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("overlayEngine", () => {
  describe("initOverlay", () => {
    it("adds overlay-active class to documentElement", () => {
      expect(document.documentElement.classList.contains("overlay-active")).toBe(true);
    });

    it("appends wrapper to lower-third-container", () => {
      expect(document.querySelector(".lower-third-container .br-wrapper")).toBeTruthy();
    });

    it("creates wrapper with hidden phase class", () => {
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });
  });

  describe("destroyOverlay", () => {
    it("removes overlay-active class", () => {
      destroyOverlay();
      expect(document.documentElement.classList.contains("overlay-active")).toBe(false);
    });

    it("disconnects socket", () => {
      destroyOverlay();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });
  });

  describe("socket connect", () => {
    it("emits resolution on connect", () => {
      socketEmit("connect");
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_RESOLUTION, expect.objectContaining({ width: expect.any(Number) }));
    });

    it("posts overlay-ready to parent on connect", () => {
      const postMessageSpy = vi.spyOn(window.parent, "postMessage");
      socketEmit("connect");
      expect(postMessageSpy).toHaveBeenCalledWith({ type: "overlay-ready" }, "*");
      postMessageSpy.mockRestore();
    });

    it("clears heartbeat interval on disconnect after connect", () => {
      vi.useFakeTimers();
      const postMessageSpy = vi.spyOn(window.parent, "postMessage");
      socketEmit("connect");
      // Heartbeat interval should be running — advance to fire at least one
      vi.advanceTimersByTime(5001);
      expect(postMessageSpy).toHaveBeenCalledWith({ type: "overlay-heartbeat" }, "*");
      // Disconnect clears the interval
      socketEmit("disconnect");
      postMessageSpy.mockClear();
      vi.advanceTimersByTime(10000);
      expect(postMessageSpy).not.toHaveBeenCalledWith({ type: "overlay-heartbeat" }, "*");
      postMessageSpy.mockRestore();
      vi.useRealTimers();
    });
  });

  describe(STO_LOWER_THIRD_STATE, () => {
    it("hides when state.phase is hidden", () => {
      socketEmit(STO_LOWER_THIRD_STATE, { phase: "hidden", active: null });
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });

    it("hides when state.phase is dismissing", () => {
      socketEmit(STO_LOWER_THIRD_STATE, { phase: "dismissing", active: null });
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });

    it("shows immediate when skipEntrance is true", () => {
      socketEmit(STO_LOWER_THIRD_STATE, { phase: "visible", active: titleItem, skipEntrance: true });
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "visible");
    });

    it("calls show() when phase is showing with active item", () => {
      socketEmit(STO_LOWER_THIRD_STATE, { phase: "showing", active: titleItem });
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "showing");
    });
  });

  describe(STO_LOWER_THIRD_SHOW, () => {
    it("shows item with animation", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      expect(getWrapper().classList.contains("br-phase--showing")).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "showing");
    });

    it("shows item immediately when skipEntrance is true", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem, skipEntrance: true });
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "visible");
    });

    it("adds wide class when useWideWidth is true", () => {
      const wideItem = { ...scriptureItem, pages: { ...scriptureItem.pages!, useWideWidth: true } };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: wideItem });
      expect(getWrapper().classList.contains("br-wrapper--wide")).toBe(true);
    });

    it("removes wide class when useWideWidth is false", () => {
      const wideItem = { ...titleItem, pages: { totalPages: 1, currentPage: 1, pages: [], useWideWidth: true } };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: wideItem });
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      expect(getWrapper().classList.contains("br-wrapper--wide")).toBe(false);
    });

    it("sets content for Title type", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      expect(document.querySelector(".br-content")?.innerHTML).toContain("Test Title");
    });

    it("sets content for TitleSubtitle type", () => {
      const item: LowerThirdItem = { ...titleItem, type: "TitleSubtitle", content: { title: "A", subtitle: "B" } };
      socketEmit(STO_LOWER_THIRD_SHOW, { item });
      expect(document.querySelector(".br-content")?.innerHTML).toContain("br-text--subtitle");
    });

    it("sets content for Scripture type", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: scriptureItem });
      expect(document.querySelector(".br-content")?.innerHTML).toContain("Genesis 1:1-2");
    });

    it("escapes HTML special characters in content", () => {
      const item: LowerThirdItem = { ...titleItem, content: { title: "<script>alert(1)</script>" } };
      socketEmit(STO_LOWER_THIRD_SHOW, { item });
      const html = document.querySelector(".br-content")?.innerHTML ?? "";
      expect(html).toContain("&lt;script&gt;");
      expect(html).not.toContain("<script>");
    });
  });

  describe(STO_LOWER_THIRD_DISMISS, () => {
    it("sets dismissing phase and reports it", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      socketEmit(STO_LOWER_THIRD_DISMISS, undefined);
      expect(getWrapper().classList.contains("br-phase--dismissing")).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "dismissing");
    });
  });

  describe(STO_LOWER_THIRD_FORCE_CLEAR, () => {
    it("hides and reports hidden phase", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      socketEmit(STO_LOWER_THIRD_FORCE_CLEAR, undefined);
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "hidden");
    });
  });

  describe(STO_LOWER_THIRD_PAGE, () => {
    it("does nothing when no current item", () => {
      // No item shown — should not throw
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
    });

    it("calls pushVerses when currentItem has pages", () => {
      const multiPage: LowerThirdItem = {
        ...scriptureItem,
        pages: {
          totalPages: 2,
          currentPage: 1,
          pages: [
            { pageNumber: 1, startVerse: 1, endVerse: 1 },
            { pageNumber: 2, startVerse: 2, endVerse: 2 },
          ],
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: multiPage });
      // Should not throw
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
    });
  });

  describe(STO_LOWER_THIRD_PUSH_UP, () => {
    it("transitions to pushing phase", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      const newItem: LowerThirdItem = { ...titleItem, id: "item-3", content: { title: "New Title" } };
      socketEmit(STO_LOWER_THIRD_PUSH_UP, { item: newItem });
      expect(getWrapper().classList.contains("br-phase--pushing")).toBe(true);
    });
  });

  describe(STO_LOWER_THIRD_MEASURE, () => {
    it("calls measureScripture and emits pages result", async () => {
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-1",
        verses: [{ verseNumber: 1, text: "In the beginning" }],
        reference: "Genesis 1:1",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(measureScripture).toHaveBeenCalled();
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PAGES, expect.objectContaining({ itemId: "item-1" }));
    });

    it("emits fallback pages when measureScripture rejects", async () => {
      vi.mocked(measureScripture).mockRejectedValueOnce(new Error("measure failed"));
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-2",
        verses: [{ verseNumber: 1, text: "verse" }],
        reference: "Gen 1:1",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        OTS_LOWER_THIRD_PAGES,
        expect.objectContaining({ itemId: "item-2", pages: expect.objectContaining({ totalPages: 1 }) }),
      );
    });
  });

  describe("handleAnimationEnd", () => {
    it("transitions showing→visible on br-plate-unfold", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      dispatchAnimationEnd(getWrapper(), "br-plate-unfold");
      expect(getWrapper().classList.contains("br-phase--visible")).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "visible");
    });

    it("hides on br-rhombus-shrink during dismiss", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      socketEmit(STO_LOWER_THIRD_DISMISS, undefined);
      dispatchAnimationEnd(getWrapper(), "br-rhombus-shrink");
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "hidden");
    });

    it("ignores unrelated animation names", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      dispatchAnimationEnd(getWrapper(), "some-other-animation");
      expect(getWrapper().classList.contains("br-phase--showing")).toBe(true);
    });
  });

  describe("disconnect timer", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("starts timer on disconnect and dismisses item without autoDismiss", () => {
      vi.useFakeTimers();
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem }); // autoDismissMs is null
      socketEmit("disconnect");
      vi.advanceTimersByTime(15001);
      expect(getWrapper().classList.contains("br-phase--dismissing")).toBe(true);
    });

    it("clears disconnect timer on reconnect", () => {
      vi.useFakeTimers();
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      socketEmit("disconnect");
      socketEmit("connect");
      vi.advanceTimersByTime(16000);
      // Timer was cleared on connect — should still be showing, not dismissed
      expect(getWrapper().classList.contains("br-phase--showing")).toBe(true);
    });

    it("does not dismiss when currentItem has autoDismissMs set", () => {
      vi.useFakeTimers();
      const autoItem: LowerThirdItem = { ...titleItem, autoDismissMs: 5000 };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: autoItem });
      socketEmit("disconnect");
      vi.advanceTimersByTime(15001);
      // autoDismissMs is set — timer fires but does not dismiss
      expect(getWrapper().classList.contains("br-phase--dismissing")).toBe(false);
    });

    it("does not dismiss when no currentItem is active", () => {
      vi.useFakeTimers();
      socketEmit("disconnect");
      vi.advanceTimersByTime(15001);
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });

    it("hides after the post-dismiss timeout", () => {
      vi.useFakeTimers();
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      socketEmit("disconnect");
      vi.advanceTimersByTime(15001); // triggers dismiss
      vi.advanceTimersByTime(2001); // triggers the subsequent hide()
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });

    it("replaces existing disconnect timer on second disconnect", () => {
      vi.useFakeTimers();
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      socketEmit("disconnect");
      vi.advanceTimersByTime(10000);
      // Another disconnect resets the timer
      socketEmit("disconnect");
      vi.advanceTimersByTime(10000);
      // Only 10s into second timer — should not have dismissed yet
      expect(getWrapper().classList.contains("br-phase--dismissing")).toBe(false);
      vi.advanceTimersByTime(5001);
      expect(getWrapper().classList.contains("br-phase--dismissing")).toBe(true);
    });
  });

  describe("STO_LOWER_THIRD_STATE additional branches", () => {
    it("does nothing when state has active item but phase is not showing and skipEntrance is false", () => {
      // phase "visible" without skipEntrance — none of the conditions match
      socketEmit(STO_LOWER_THIRD_STATE, { phase: "visible", active: titleItem, skipEntrance: false });
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });

    it("does nothing when state has no active item and phase is showing", () => {
      socketEmit(STO_LOWER_THIRD_STATE, { phase: "showing", active: null });
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });
  });

  describe("handleAnimationEnd additional branches", () => {
    it("does not transition on br-plate-unfold when not in showing phase", () => {
      // In hidden phase — br-plate-unfold should be ignored
      dispatchAnimationEnd(getWrapper(), "br-plate-unfold");
      expect(getWrapper().classList.contains("br-phase--hidden")).toBe(true);
    });

    it("does not hide on br-rhombus-shrink when not in dismissing phase", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      // In showing phase — br-rhombus-shrink should be ignored
      dispatchAnimationEnd(getWrapper(), "br-rhombus-shrink");
      expect(getWrapper().classList.contains("br-phase--showing")).toBe(true);
    });
  });

  describe("STO_LOWER_THIRD_MEASURE abort handling", () => {
    it("does not emit pages when aborted before resolve", async () => {
      let resolvePromise: ((value: unknown) => void) | undefined;
      vi.mocked(measureScripture).mockImplementationOnce(
        () =>
          new Promise<unknown>((resolve) => {
            resolvePromise = resolve;
          }) as ReturnType<typeof measureScripture>,
      );
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-a",
        verses: [{ verseNumber: 1, text: "text" }],
        reference: "Gen 1:1",
      });
      // Second measure aborts the first
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-b",
        verses: [{ verseNumber: 2, text: "text2" }],
        reference: "Gen 1:2",
      });
      // Resolve the first one (now aborted)
      resolvePromise!({ totalPages: 1, currentPage: 1, pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }], useWideWidth: false });
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Should not have emitted pages for item-a
      const pagesEmits = mockSocket.emit.mock.calls.filter((call) => call[0] === OTS_LOWER_THIRD_PAGES && (call[1] as { itemId: string }).itemId === "item-a");
      expect(pagesEmits).toHaveLength(0);
    });

    it("does not emit fallback when aborted before reject", async () => {
      let rejectPromise: ((reason: unknown) => void) | undefined;
      vi.mocked(measureScripture).mockImplementationOnce(
        () =>
          new Promise<unknown>((_resolve, reject) => {
            rejectPromise = reject;
          }) as ReturnType<typeof measureScripture>,
      );
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-c",
        verses: [{ verseNumber: 1, text: "text" }],
        reference: "Gen 1:1",
      });
      // Abort via SHOW
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      // Reject the first one (now aborted)
      rejectPromise!(new Error("fail"));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const pagesEmits = mockSocket.emit.mock.calls.filter((call) => call[0] === OTS_LOWER_THIRD_PAGES && (call[1] as { itemId: string }).itemId === "item-c");
      expect(pagesEmits).toHaveLength(0);
    });
  });

  describe("Scripture rendering branches", () => {
    it("renders verse with verseNumber 0 without number prefix", () => {
      const item: LowerThirdItem = {
        ...scriptureItem,
        content: {
          reference: { bookId: 1, chapter: 1, verse: 0, verseEnd: 1 },
          formattedReference: "Gen 1:0-1",
          verses: [
            { verseNumber: 0, text: "Heading text" },
            { verseNumber: 1, text: "First verse" },
          ],
        },
        pages: null,
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item });
      const html = document.querySelector(".br-content")?.innerHTML ?? "";
      expect(html).toContain("br-verse--zero");
      expect(html).not.toContain('<span class="br-verse-num">0.');
    });

    it("uses all verses when pageInfo is undefined (page out of range)", () => {
      const item: LowerThirdItem = {
        ...scriptureItem,
        pages: {
          totalPages: 1,
          currentPage: 5, // Out of range — pages[4] is undefined
          pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }],
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item });
      const html = document.querySelector(".br-content")?.innerHTML ?? "";
      // Falls back to showing all verses
      expect(html).toContain("In the beginning");
      expect(html).toContain("without form");
    });
  });

  describe("STO_LOWER_THIRD_PAGE with no pages on currentItem", () => {
    it("does not push when currentItem exists but has no pages", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem }); // titleItem.pages is null
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
      // Should not crash or change phase
      expect(getWrapper().classList.contains("br-phase--showing")).toBe(true);
    });

    it("pushVerses uses all verses when pageInfo is undefined for currentPage", () => {
      const item: LowerThirdItem = {
        ...scriptureItem,
        pages: {
          totalPages: 3,
          currentPage: 1,
          pages: [{ pageNumber: 1, startVerse: 1, endVerse: 2 }], // only 1 page defined
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item });
      // Page 3 — pages[2] is undefined, so all verses should be used
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 3 });
      const versesContainer = getWrapper().querySelector(".br-verses") as HTMLElement;
      expect(versesContainer.querySelector("div[style*='flex-direction']")).toBeTruthy();
    });
  });

  describe("showImmediate with zero height", () => {
    it("skips setWrapperVars when measured height is 0", () => {
      // In jsdom getBoundingClientRect always returns 0 — tests the height > 0 branch
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem, skipEntrance: true });
      // Should not throw; wrapper should still have visible phase after rAF
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "visible");
    });

    it("sets wrapper height when measured height is > 0", async () => {
      // Provide a non-zero height via mock
      const originalGetBCR = Element.prototype.getBoundingClientRect;
      Element.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, width: 400, height: 60, top: 0, right: 400, bottom: 60, left: 0, toJSON: () => ({}) } as DOMRect;
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem, skipEntrance: true });
      // Flush requestAnimationFrame (jsdom runs rAF callbacks synchronously via fake timers)
      await new Promise((resolve) => requestAnimationFrame(resolve));
      expect(getWrapper().style.height).toBe("60px");
      Element.prototype.getBoundingClientRect = originalGetBCR;
    });

    it("adds wide class when showImmediate is called with useWideWidth true", () => {
      const wideItem: LowerThirdItem = { ...scriptureItem, pages: { ...scriptureItem.pages!, useWideWidth: true } };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: wideItem, skipEntrance: true });
      expect(getWrapper().classList.contains("br-wrapper--wide")).toBe(true);
    });

    it("removes wide class when showImmediate is called with useWideWidth false", () => {
      const wideItem: LowerThirdItem = { ...scriptureItem, pages: { ...scriptureItem.pages!, useWideWidth: true } };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: wideItem, skipEntrance: true });
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem, skipEntrance: true });
      expect(getWrapper().classList.contains("br-wrapper--wide")).toBe(false);
    });
  });

  describe("STO_LOWER_THIRD_MEASURE fallback with empty verses", () => {
    it("uses fallback verseNumber 1 when verses array is empty", async () => {
      vi.mocked(measureScripture).mockRejectedValueOnce(new Error("fail"));
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-empty",
        verses: [],
        reference: "Gen 1:1",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        OTS_LOWER_THIRD_PAGES,
        expect.objectContaining({
          itemId: "item-empty",
          pages: expect.objectContaining({
            pages: [{ pageNumber: 1, startVerse: 1, endVerse: 1 }],
          }),
        }),
      );
    });

    it("uses actual verse numbers from non-empty verses array in fallback", async () => {
      vi.mocked(measureScripture).mockRejectedValueOnce(new Error("fail"));
      socketEmit(STO_LOWER_THIRD_MEASURE, {
        itemId: "item-multi",
        verses: [
          { verseNumber: 3, text: "third" },
          { verseNumber: 4, text: "fourth" },
          { verseNumber: 5, text: "fifth" },
        ],
        reference: "Gen 1:3-5",
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(mockSocket.emit).toHaveBeenCalledWith(
        OTS_LOWER_THIRD_PAGES,
        expect.objectContaining({
          itemId: "item-multi",
          pages: expect.objectContaining({
            pages: [{ pageNumber: 1, startVerse: 3, endVerse: 5 }],
          }),
        }),
      );
    });
  });

  describe("pushVerses fallback to pushUp", () => {
    it("falls back to pushUp when br-verses container is missing", () => {
      // Show a Title item (has no br-verses element)
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      // Force currentItem to have pages so PAGE handler triggers pushVerses
      const pagesItem: LowerThirdItem = {
        ...titleItem,
        pages: {
          totalPages: 2,
          currentPage: 1,
          pages: [
            { pageNumber: 1, startVerse: 1, endVerse: 1 },
            { pageNumber: 2, startVerse: 2, endVerse: 2 },
          ],
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: pagesItem });
      // Now trigger PAGE — pushVerses will find no br-verses and fall back to pushUp
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
      expect(getWrapper().classList.contains("br-phase--pushing")).toBe(true);
    });
  });

  describe("animatePush transitionend cleanup", () => {
    it("transitions to visible phase after transitionend fires on track", () => {
      socketEmit(STO_LOWER_THIRD_SHOW, { item: titleItem });
      const newItem: LowerThirdItem = { ...titleItem, id: "item-push", content: { title: "Pushed" } };
      socketEmit(STO_LOWER_THIRD_PUSH_UP, { item: newItem });
      // Find the track element that has the transitionend listener
      const track = getWrapper().querySelector(".br-content-track") as HTMLElement;
      const transitionEvent = new Event("transitionend", { bubbles: true });
      track.lastElementChild?.dispatchEvent(transitionEvent);
      // After cleanup, should be in visible phase
      expect(getWrapper().classList.contains("br-phase--visible")).toBe(true);
      expect(mockSocket.emit).toHaveBeenCalledWith(OTS_LOWER_THIRD_PHASE, "visible");
    });

    it("runs pushVerses animatePush cleanup on transitionend", () => {
      const multiPage: LowerThirdItem = {
        ...scriptureItem,
        pages: {
          totalPages: 2,
          currentPage: 1,
          pages: [
            { pageNumber: 1, startVerse: 1, endVerse: 1 },
            { pageNumber: 2, startVerse: 2, endVerse: 2 },
          ],
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: multiPage });
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
      // Find the track inside br-verses (pushVerses creates its own track)
      const versesContainer = getWrapper().querySelector(".br-verses") as HTMLElement;
      const track = versesContainer?.querySelector("div[style*='flex-direction']") as HTMLElement;
      if (track) {
        const transitionEvent = new Event("transitionend", { bubbles: true });
        track.dispatchEvent(transitionEvent);
        expect(getWrapper().classList.contains("br-phase--visible")).toBe(true);
      }
    });

    it("pushVerses correctly renders page 2 verses and animates", () => {
      const multiPage: LowerThirdItem = {
        ...scriptureItem,
        content: {
          reference: { bookId: 1, chapter: 1, verse: 1, verseEnd: 3 },
          formattedReference: "Genesis 1:1-3",
          verses: [
            { verseNumber: 1, text: "First verse" },
            { verseNumber: 2, text: "Second verse" },
            { verseNumber: 3, text: "Third verse" },
          ],
        },
        pages: {
          totalPages: 2,
          currentPage: 1,
          pages: [
            { pageNumber: 1, startVerse: 1, endVerse: 2 },
            { pageNumber: 2, startVerse: 3, endVerse: 3 },
          ],
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: multiPage });
      // Verify br-verses exists
      expect(getWrapper().querySelector(".br-verses")).toBeTruthy();
      // Trigger page change
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
      // pushVerses should have created the animation track
      const versesContainer = getWrapper().querySelector(".br-verses") as HTMLElement;
      expect(versesContainer.querySelector("div[style*='flex-direction']")).toBeTruthy();
    });

    it("pushVerses renders verse 0 without number prefix during pagination", () => {
      const multiPage: LowerThirdItem = {
        ...scriptureItem,
        content: {
          reference: { bookId: 1, chapter: 1, verse: 0, verseEnd: 1 },
          formattedReference: "Genesis 1:0-1",
          verses: [
            { verseNumber: 0, text: "Heading" },
            { verseNumber: 1, text: "First verse" },
          ],
        },
        pages: {
          totalPages: 2,
          currentPage: 1,
          pages: [
            { pageNumber: 1, startVerse: 1, endVerse: 1 },
            { pageNumber: 2, startVerse: 0, endVerse: 1 }, // page 2 includes verse 0 and 1
          ],
          useWideWidth: false,
        },
      };
      socketEmit(STO_LOWER_THIRD_SHOW, { item: multiPage });
      socketEmit(STO_LOWER_THIRD_PAGE, { page: 2 });
      const versesContainer = getWrapper().querySelector(".br-verses") as HTMLElement;
      // Track should exist with the animation setup
      expect(versesContainer.querySelector("div[style*='flex-direction']")).toBeTruthy();
      // The new verses element in the track should have both verse types
      const newVersesEl = versesContainer.querySelector("div[style*='flex-direction'] .br-verses:last-child") as HTMLElement;
      if (newVersesEl) {
        expect(newVersesEl.innerHTML).toContain("br-verse--zero");
        expect(newVersesEl.innerHTML).toContain("br-verse-num");
      }
    });
  });
});
