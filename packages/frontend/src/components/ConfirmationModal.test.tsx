import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmationModal } from "./ConfirmationModal";

const defaultProps = {
  isOpen: true,
  title: "Are you sure?",
  body: "This cannot be undone.",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
};

describe("ConfirmationModal", () => {
  it("renders title and body", () => {
    render(<ConfirmationModal {...defaultProps} />);
    expect(screen.getByTestId("modal-header")).toHaveTextContent("Are you sure?");
    expect(screen.getByTestId("confirmation-body")).toHaveTextContent("This cannot be undone.");
  });

  it("renders string body as paragraph", () => {
    render(<ConfirmationModal {...defaultProps} body="Simple text" />);
    expect(screen.getByTestId("confirmation-body").querySelector("p")).toHaveTextContent("Simple text");
  });

  it("renders ReactNode body as-is", () => {
    render(<ConfirmationModal {...defaultProps} body={<span data-testid="custom-body">Custom</span>} />);
    expect(screen.getByTestId("custom-body")).toBeInTheDocument();
  });

  it("confirm callback fires on confirm button click", () => {
    const onConfirm = vi.fn();
    render(<ConfirmationModal {...defaultProps} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByTestId("confirmation-confirm-btn"));
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("cancel callback fires on cancel button click", () => {
    const onCancel = vi.fn();
    render(<ConfirmationModal {...defaultProps} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("confirmation-cancel-btn"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("does not render when closed", () => {
    render(<ConfirmationModal {...defaultProps} isOpen={false} />);
    expect(screen.queryByTestId("modal-header")).not.toBeInTheDocument();
  });

  it("no body renders without borders", () => {
    render(<ConfirmationModal {...defaultProps} body={undefined} />);
    expect(screen.getByTestId("modal-header")).toBeInTheDocument();
    expect(screen.queryByTestId("modal-body")).not.toBeInTheDocument();
  });
});
