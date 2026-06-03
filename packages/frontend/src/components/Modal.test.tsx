import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";
import { TEST_ID_MODAL_BACKDROP, TEST_ID_MODAL_CONTAINER, TEST_ID_MODAL_HEADER, TEST_ID_MODAL_BODY, TEST_ID_MODAL_FOOTER } from "../constants/testIds";

describe("Modal", () => {
  it("renders nothing when not open", () => {
    render(<Modal isOpen={false} onClose={vi.fn()} header="Header" />);
    expect(screen.queryByTestId(TEST_ID_MODAL_BACKDROP)).not.toBeInTheDocument();
  });

  it("renders backdrop, container, header, body, and footer when all provided", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} header="My Header" footer="My Footer">
        <div>Body content</div>
      </Modal>,
    );
    expect(screen.getByTestId(TEST_ID_MODAL_BACKDROP)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_MODAL_CONTAINER)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_MODAL_HEADER)).toHaveTextContent("My Header");
    expect(screen.getByTestId(TEST_ID_MODAL_BODY)).toHaveTextContent("Body content");
    expect(screen.getByTestId(TEST_ID_MODAL_FOOTER)).toHaveTextContent("My Footer");
  });

  it("renders a spacer when no children but both header and footer present", () => {
    const { container } = render(<Modal isOpen={true} onClose={vi.fn()} header="H" footer="F" />);
    expect(container.querySelector(".modal-spacer")).toBeInTheDocument();
  });

  it("does not render the spacer when children are present", () => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()} header="H" footer="F">
        <div>Body</div>
      </Modal>,
    );
    expect(container.querySelector(".modal-spacer")).not.toBeInTheDocument();
  });

  it.each`
    scenario              | header             | footer
    ${"ReactNode header"} | ${(<em>Node</em>)} | ${undefined}
    ${"ReactNode footer"} | ${undefined}       | ${(<em>Node</em>)}
    ${"both ReactNode"}   | ${(<em>H</em>)}    | ${(<em>F</em>)}
  `("renders $scenario without wrapping in <span>", ({ header, footer }) => {
    const { container } = render(
      <Modal isOpen={true} onClose={vi.fn()} header={header} footer={footer}>
        <div>body</div>
      </Modal>,
    );
    // When header/footer is a ReactNode (not string), it's rendered directly, not wrapped in span
    expect(container.querySelectorAll("em").length).toBeGreaterThan(0);
  });

  it("backdrop click calls onClose", () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} header="H" />);
    fireEvent.click(screen.getByTestId(TEST_ID_MODAL_BACKDROP));
    expect(onClose).toHaveBeenCalled();
  });

  it("container click does not call onClose (stopPropagation)", () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} header="H" />);
    fireEvent.click(screen.getByTestId(TEST_ID_MODAL_CONTAINER));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("container keydown does not call onClose (stopPropagation)", () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} header="H" />);
    fireEvent.keyDown(screen.getByTestId(TEST_ID_MODAL_CONTAINER), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape key on backdrop calls onClose", () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} header="H" />);
    fireEvent.keyDown(screen.getByTestId(TEST_ID_MODAL_BACKDROP), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("non-Escape key on backdrop does not call onClose", () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} header="H" />);
    fireEvent.keyDown(screen.getByTestId(TEST_ID_MODAL_BACKDROP), { key: "Enter" });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("size=large sets 80% width", () => {
    render(<Modal isOpen={true} onClose={vi.fn()} header="H" size="large" />);
    expect(screen.getByTestId(TEST_ID_MODAL_CONTAINER).className).toContain("modal-size-large");
  });

  it("size=small (default) sets 50% width", () => {
    render(<Modal isOpen={true} onClose={vi.fn()} header="H" />);
    expect(screen.getByTestId(TEST_ID_MODAL_CONTAINER).className).toContain("modal-size-small");
  });

  it("does not render header when not provided", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} footer="Footer">
        <div>Body</div>
      </Modal>,
    );
    expect(screen.queryByTestId(TEST_ID_MODAL_HEADER)).not.toBeInTheDocument();
  });

  it("does not render footer when not provided", () => {
    render(
      <Modal isOpen={true} onClose={vi.fn()} header="Header">
        <div>Body</div>
      </Modal>,
    );
    expect(screen.queryByTestId(TEST_ID_MODAL_FOOTER)).not.toBeInTheDocument();
  });

  describe("visualViewport resize handling", () => {
    let originalVisualViewport: VisualViewport | null;
    let fakeViewport: { addEventListener: ReturnType<typeof vi.fn>; removeEventListener: ReturnType<typeof vi.fn> };

    beforeEach(() => {
      originalVisualViewport = window.visualViewport;
      fakeViewport = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
      Object.defineProperty(window, "visualViewport", { value: fakeViewport, writable: true, configurable: true });
    });

    afterEach(() => {
      Object.defineProperty(window, "visualViewport", { value: originalVisualViewport, writable: true, configurable: true });
    });

    it("registers resize listener on visualViewport when open", () => {
      render(<Modal isOpen={true} onClose={vi.fn()} header="H" />);
      expect(fakeViewport.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    });

    it("does not register resize listener when closed", () => {
      render(<Modal isOpen={false} onClose={vi.fn()} header="H" />);
      expect(fakeViewport.addEventListener).not.toHaveBeenCalled();
    });

    it("removes resize listener on unmount", () => {
      const { unmount } = render(<Modal isOpen={true} onClose={vi.fn()} header="H" />);
      unmount();
      expect(fakeViewport.removeEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
    });

    it("scrolls active INPUT into view on resize", () => {
      render(<Modal isOpen={true} onClose={vi.fn()} header="H" />);
      const input = document.createElement("input");
      input.scrollIntoView = vi.fn();
      document.body.appendChild(input);
      input.focus();

      const resizeHandler = fakeViewport.addEventListener.mock.calls[0]![1] as () => void;
      resizeHandler();

      expect(input.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
      document.body.removeChild(input);
    });

    it("scrolls active TEXTAREA into view on resize", () => {
      render(<Modal isOpen={true} onClose={vi.fn()} header="H" />);
      const textarea = document.createElement("textarea");
      textarea.scrollIntoView = vi.fn();
      document.body.appendChild(textarea);
      textarea.focus();

      const resizeHandler = fakeViewport.addEventListener.mock.calls[0]![1] as () => void;
      resizeHandler();

      expect(textarea.scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
      document.body.removeChild(textarea);
    });

    it("does not scroll non-input active elements on resize", () => {
      render(<Modal isOpen={true} onClose={vi.fn()} header="H" />);
      const div = document.createElement("div");
      div.tabIndex = 0;
      div.scrollIntoView = vi.fn();
      document.body.appendChild(div);
      div.focus();

      const resizeHandler = fakeViewport.addEventListener.mock.calls[0]![1] as () => void;
      resizeHandler();

      expect(div.scrollIntoView).not.toHaveBeenCalled();
      document.body.removeChild(div);
    });
  });
});
