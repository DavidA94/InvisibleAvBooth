import { describe, it, expect, vi } from "vitest";
import type { ReactNode } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsMetadataPreview } from "./ObsMetadataPreview";

// Mock IonPopover — render as a div when open with a close button that invokes onDidDismiss.
// This lets us verify the dismiss handler clears popoverOpen state.
vi.mock("@ionic/react", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("@ionic/react");
  return {
    ...actual,
    IonPopover: ({ isOpen, onDidDismiss, children }: { isOpen: boolean; onDidDismiss: () => void; children: ReactNode }) =>
      isOpen ? (
        <div data-testid="mock-popover">
          {children}
          <button data-testid="mock-popover-dismiss" onClick={onDidDismiss}>
            Close
          </button>
        </div>
      ) : null,
  };
});

describe("ObsMetadataPreview", () => {
  it.each`
    scenario                   | title              | description         | expectText
    ${"empty title"}           | ${""}              | ${undefined}        | ${"No session details set"}
    ${"title only"}            | ${"Sunday Stream"} | ${undefined}        | ${"Sunday Stream"}
    ${"title and description"} | ${"Sunday Stream"} | ${"Weekly service"} | ${"Sunday Stream"}
  `("renders $scenario", ({ title, description, expectText }) => {
    render(<ObsMetadataPreview interpolatedStreamTitle={title} interpolatedDescription={description} onEditDetails={vi.fn()} />);
    expect(screen.getByText(expectText)).toBeInTheDocument();
  });

  it("shows description when provided", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" interpolatedDescription="Desc" onEditDetails={vi.fn()} />);
    expect(screen.getByText("Desc")).toBeInTheDocument();
  });

  it("calls onEditDetails when edit button clicked", () => {
    const onEdit = vi.fn();
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" interpolatedDescription="" onEditDetails={onEdit} />);
    fireEvent.click(screen.getByLabelText("Edit Details"));
    expect(onEdit).toHaveBeenCalled();
  });

  it("does not have clickable role when title is empty", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="" onEditDetails={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /edit/i })).toBeInTheDocument();
    expect(screen.getByText("No session details set").closest("[role='button']")).toBeNull();
  });

  it("title area is clickable when title present", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" interpolatedDescription="Desc" onEditDetails={vi.fn()} />);
    const previewArea = screen.getByText("Title").closest("[role='button']")!;
    expect(screen.queryByTestId("mock-popover")).not.toBeInTheDocument();
    fireEvent.click(previewArea);
    expect(screen.getByTestId("mock-popover")).toBeInTheDocument();
  });

  it("popover closes when dismissed", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" onEditDetails={vi.fn()} />);
    fireEvent.click(screen.getByText("Title").closest("[role='button']")!);
    expect(screen.getByTestId("mock-popover")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("mock-popover-dismiss"));
    expect(screen.queryByTestId("mock-popover")).not.toBeInTheDocument();
  });

  it("Enter key on preview area opens popover", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" onEditDetails={vi.fn()} />);
    const previewArea = screen.getByText("Title").closest("[role='button']")!;
    fireEvent.keyDown(previewArea, { key: "Enter" });
    expect(screen.getByTestId("mock-popover")).toBeInTheDocument();
  });

  it("has keyboard support when title is present", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" onEditDetails={vi.fn()} />);
    const previewArea = screen.getByText("Title").closest("[role='button']")!;
    expect(previewArea).toHaveAttribute("tabindex", "0");
  });
});
