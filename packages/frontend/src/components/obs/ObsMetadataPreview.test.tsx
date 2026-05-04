import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ObsMetadataPreview } from "./ObsMetadataPreview";

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
    // Clicking doesn't throw — popover opens (Ionic handles rendering)
    fireEvent.click(previewArea);
    expect(previewArea).toBeInTheDocument();
  });

  it("has keyboard support when title is present", () => {
    render(<ObsMetadataPreview interpolatedStreamTitle="Title" onEditDetails={vi.fn()} />);
    const previewArea = screen.getByText("Title").closest("[role='button']")!;
    expect(previewArea).toHaveAttribute("tabindex", "0");
  });
});
