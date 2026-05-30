import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SwipeableRow } from "./SwipeableRow";

function getContent(): HTMLElement {
  return screen.getByTestId("swipeable-row").querySelector(".swipeable-content") as HTMLElement;
}

function getTransform(): string {
  return getContent().style.transform;
}

// Simulate a pointer gesture with timing for velocity calculation
function swipe(el: Element, startX: number, endX: number, durationMs = 200): void {
  const startTime = 1000;
  fireEvent.pointerDown(el, { clientX: startX, timeStamp: startTime, pointerId: 1 });
  fireEvent.pointerMove(el, { clientX: endX, timeStamp: startTime + durationMs, pointerId: 1 });
  fireEvent.pointerUp(el, { clientX: endX, timeStamp: startTime + durationMs, pointerId: 1 });
}

// Simulate a fast flick (short distance, very short time)
function flick(el: Element, startX: number, endX: number): void {
  swipe(el, startX, endX, 20); // 20ms = very fast
}

describe("SwipeableRow", () => {
  describe("rendering", () => {
    it("renders children", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>}>
          <div>Content</div>
        </SwipeableRow>,
      );
      expect(screen.getByText("Content")).toBeInTheDocument();
    });

    it("starts at offset 0", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>}>
          <div>Content</div>
        </SwipeableRow>,
      );
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("renders left actions container with correct width for leftCount=1", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const actions = screen.getByTestId("swipeable-row").querySelector(".swipeable-actions--left") as HTMLElement;
      expect(actions.style.width).toBe("48px");
    });

    it("renders left actions container with correct width for leftCount=2", () => {
      render(
        <SwipeableRow leftActions={<><button>Edit</button><button>Delete</button></>} leftCount={2}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const actions = screen.getByTestId("swipeable-row").querySelector(".swipeable-actions--left") as HTMLElement;
      expect(actions.style.width).toBe("96px");
    });

    it("renders right actions container with correct width", () => {
      render(
        <SwipeableRow rightActions={<button>Go Live</button>} rightCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const actions = screen.getByTestId("swipeable-row").querySelector(".swipeable-actions--right") as HTMLElement;
      expect(actions.style.width).toBe("48px");
    });

    it("applies touch-action: pan-y to content", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>}>
          <div>Content</div>
        </SwipeableRow>,
      );
      expect(getContent().style.touchAction).toBe("pan-y");
    });
  });

  describe("mouse swipe (pointer events)", () => {
    it("moves content during drag", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 200, timeStamp: 1000, pointerId: 1 });
      fireEvent.pointerMove(content, { clientX: 170, timeStamp: 1100, pointerId: 1 });
      expect(getTransform()).toBe("translateX(-30px)");
    });

    it("snaps open when dragged past 30% threshold (leftCount=1, threshold=14.4px)", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // 30% of 48px = 14.4px, so -15px should open
      swipe(getContent(), 200, 185);
      expect(getTransform()).toBe("translateX(-48px)");
    });

    it("snaps closed when not past threshold", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // 10px = MIN_DISTANCE_PX (not strictly greater), so velocity path won't trigger
      // And 10px < 14.4px (30% of 48px), so distance path won't trigger either
      swipe(getContent(), 200, 190, 500);
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("snaps open with leftCount=2 (threshold = 30% of 96px = 28.8px)", () => {
      render(
        <SwipeableRow leftActions={<><button>Edit</button><button>Delete</button></>} leftCount={2}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // Need to drag past 28.8px
      swipe(getContent(), 200, 170);
      expect(getTransform()).toBe("translateX(-96px)");
    });

    it("reveals right actions on swipe right", () => {
      render(
        <SwipeableRow rightActions={<button>Go Live</button>} rightCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 100, 115);
      expect(getTransform()).toBe("translateX(48px)");
    });

    it("does not move right when no rightActions", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 100, timeStamp: 1000, pointerId: 1 });
      fireEvent.pointerMove(content, { clientX: 130, timeStamp: 1100, pointerId: 1 });
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("does not move left when no leftActions", () => {
      render(
        <SwipeableRow rightActions={<button>Go Live</button>} rightCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 200, timeStamp: 1000, pointerId: 1 });
      fireEvent.pointerMove(content, { clientX: 170, timeStamp: 1100, pointerId: 1 });
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("clamps drag to max left width", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 200, timeStamp: 1000, pointerId: 1 });
      fireEvent.pointerMove(content, { clientX: 100, timeStamp: 1100, pointerId: 1 }); // -100px, clamped to -48
      expect(getTransform()).toBe("translateX(-48px)");
    });
  });

  describe("touch swipe (pointer events with touch type)", () => {
    it("opens on touch swipe left past threshold", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 200, timeStamp: 1000, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerMove(content, { clientX: 185, timeStamp: 1200, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerUp(content, { clientX: 185, timeStamp: 1200, pointerId: 1, pointerType: "touch" });
      expect(getTransform()).toBe("translateX(-48px)");
    });

    it("opens on touch swipe right past threshold", () => {
      render(
        <SwipeableRow rightActions={<button>Go Live</button>} rightCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 100, timeStamp: 1000, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerMove(content, { clientX: 115, timeStamp: 1200, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerUp(content, { clientX: 115, timeStamp: 1200, pointerId: 1, pointerType: "touch" });
      expect(getTransform()).toBe("translateX(48px)");
    });

    it("snaps back on pointerCancel (e.g. browser takes over scroll)", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      const content = getContent();
      fireEvent.pointerDown(content, { clientX: 200, timeStamp: 1000, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerMove(content, { clientX: 185, timeStamp: 1100, pointerId: 1, pointerType: "touch" });
      fireEvent.pointerCancel(content, { pointerId: 1, pointerType: "touch" });
      expect(getTransform()).toBe("translateX(0px)");
    });
  });

  describe("velocity-based detection", () => {
    it("opens on fast flick even with short distance (above min distance)", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // In jsdom, timeStamp is auto-set so velocity is always high for synchronous events.
      // This test verifies that distance > MIN_DISTANCE_PX (10px) triggers open via velocity.
      // 11px > 10px MIN_DISTANCE_PX → velocity path opens it
      flick(getContent(), 200, 189);
      expect(getTransform()).toBe("translateX(-48px)");
    });

    it("does not open when distance equals MIN_DISTANCE_PX exactly", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // 10px is NOT > 10px (strict inequality), so velocity path doesn't trigger
      // And 10px < 14.4px threshold, so distance path doesn't trigger either
      swipe(getContent(), 200, 190);
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("does not open when distance is below MIN_DISTANCE_PX", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // 5px < 10px MIN_DISTANCE_PX — never opens regardless of velocity
      swipe(getContent(), 200, 195);
      expect(getTransform()).toBe("translateX(0px)");
    });
  });

  describe("action interactions", () => {
    it("action buttons are clickable when revealed", () => {
      const onDelete = vi.fn();
      render(
        <SwipeableRow leftActions={<button onClick={onDelete}>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      // Open the row
      swipe(getContent(), 200, 185);
      expect(getTransform()).toBe("translateX(-48px)");

      // Click the action button
      fireEvent.click(screen.getByText("Delete"));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });

    it("right action buttons are clickable when revealed", () => {
      const onGoLive = vi.fn();
      render(
        <SwipeableRow rightActions={<button onClick={onGoLive}>Go Live</button>} rightCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 100, 115);
      expect(getTransform()).toBe("translateX(48px)");

      fireEvent.click(screen.getByText("Go Live"));
      expect(onGoLive).toHaveBeenCalledTimes(1);
    });

    it("multiple left actions are all clickable", () => {
      const onEdit = vi.fn();
      const onDelete = vi.fn();
      render(
        <SwipeableRow leftActions={<><button onClick={onEdit}>Edit</button><button onClick={onDelete}>Delete</button></>} leftCount={2}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 200, 170);
      expect(getTransform()).toBe("translateX(-96px)");

      fireEvent.click(screen.getByText("Edit"));
      expect(onEdit).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByText("Delete"));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });

  describe("close behavior", () => {
    it("closes when content is clicked while revealed", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 200, 185);
      expect(getTransform()).toBe("translateX(-48px)");

      // Simulate a tap (pointerdown with no move → pointerup settles at offset 0 → closes)
      fireEvent.pointerDown(getContent(), { clientX: 200, timeStamp: 5000, pointerId: 1 });
      fireEvent.pointerUp(getContent(), { clientX: 200, timeStamp: 5050, pointerId: 1 });
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("does not close on click when already closed", () => {
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
          <div>Content</div>
        </SwipeableRow>,
      );
      fireEvent.click(getContent());
      expect(getTransform()).toBe("translateX(0px)");
    });
  });

  describe("forceClose prop", () => {
    it("closes when forceClose becomes true", () => {
      const { rerender } = render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1} forceClose={false}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 200, 185);
      expect(getTransform()).toBe("translateX(-48px)");

      rerender(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1} forceClose={true}>
          <div>Content</div>
        </SwipeableRow>,
      );
      expect(getTransform()).toBe("translateX(0px)");
    });

    it("does nothing when forceClose is true but already closed", () => {
      const { rerender } = render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1} forceClose={false}>
          <div>Content</div>
        </SwipeableRow>,
      );
      expect(getTransform()).toBe("translateX(0px)");

      rerender(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1} forceClose={true}>
          <div>Content</div>
        </SwipeableRow>,
      );
      expect(getTransform()).toBe("translateX(0px)");
    });
  });

  describe("onOpen callback", () => {
    it("calls onOpen when row opens via swipe left", () => {
      const onOpen = vi.fn();
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1} onOpen={onOpen}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 200, 185);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("calls onOpen when row opens via swipe right", () => {
      const onOpen = vi.fn();
      render(
        <SwipeableRow rightActions={<button>Go Live</button>} rightCount={1} onOpen={onOpen}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 100, 115);
      expect(onOpen).toHaveBeenCalledTimes(1);
    });

    it("does not call onOpen when swipe does not open", () => {
      const onOpen = vi.fn();
      render(
        <SwipeableRow leftActions={<button>Delete</button>} leftCount={1} onOpen={onOpen}>
          <div>Content</div>
        </SwipeableRow>,
      );
      swipe(getContent(), 200, 195, 500); // too short and slow
      expect(onOpen).not.toHaveBeenCalled();
    });
  });
});
