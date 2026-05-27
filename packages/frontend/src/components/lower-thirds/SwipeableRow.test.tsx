import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SwipeableRow } from "./SwipeableRow";

function getContentTransform(): string {
  const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content") as HTMLElement;
  return content.style.transform;
}

describe("SwipeableRow", () => {
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
    expect(getContentTransform()).toBe("translateX(0px)");
  });

  it("moves content on pointer drag to the left (reveals left actions)", () => {
    render(
      <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    fireEvent.pointerDown(content, { clientX: 200 });
    fireEvent.pointerMove(content, { clientX: 170 });

    expect(getContentTransform()).toBe("translateX(-30px)");
  });

  it("snaps open when dragged past threshold", () => {
    render(
      <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    fireEvent.pointerDown(content, { clientX: 200 });
    fireEvent.pointerMove(content, { clientX: 175 }); // -25px, past threshold of 20
    fireEvent.pointerUp(content);

    expect(getContentTransform()).toBe("translateX(-48px)"); // 1 button × 48px
  });

  it("snaps closed when not past threshold", () => {
    render(
      <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    fireEvent.pointerDown(content, { clientX: 200 });
    fireEvent.pointerMove(content, { clientX: 190 }); // -10px, below threshold
    fireEvent.pointerUp(content);

    expect(getContentTransform()).toBe("translateX(0px)");
  });

  it("uses leftCount=2 for wider reveal", () => {
    render(
      <SwipeableRow leftActions={<><button>Edit</button><button>Delete</button></>} leftCount={2}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    fireEvent.pointerDown(content, { clientX: 200 });
    fireEvent.pointerMove(content, { clientX: 175 });
    fireEvent.pointerUp(content);

    expect(getContentTransform()).toBe("translateX(-96px)"); // 2 buttons × 48px
  });

  it("moves content on pointer drag to the right (reveals right actions)", () => {
    render(
      <SwipeableRow rightActions={<button>Go Live</button>} rightCount={1}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    fireEvent.pointerDown(content, { clientX: 100 });
    fireEvent.pointerMove(content, { clientX: 130 });
    fireEvent.pointerUp(content);

    expect(getContentTransform()).toBe("translateX(48px)");
  });

  it("does not move right when no rightActions", () => {
    render(
      <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    fireEvent.pointerDown(content, { clientX: 100 });
    fireEvent.pointerMove(content, { clientX: 130 });

    expect(getContentTransform()).toBe("translateX(0px)");
  });

  it("closes when content is clicked while revealed", () => {
    render(
      <SwipeableRow leftActions={<button>Delete</button>} leftCount={1}>
        <div>Content</div>
      </SwipeableRow>,
    );
    const content = screen.getByTestId("swipeable-row").querySelector(".swipeable-content")!;

    // Open it
    fireEvent.pointerDown(content, { clientX: 200 });
    fireEvent.pointerMove(content, { clientX: 175 });
    fireEvent.pointerUp(content);
    expect(getContentTransform()).toBe("translateX(-48px)");

    // Click to close
    fireEvent.click(content);
    expect(getContentTransform()).toBe("translateX(0px)");
  });
});
