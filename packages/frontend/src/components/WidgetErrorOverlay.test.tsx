import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetErrorOverlay } from "./WidgetErrorOverlay";
import { TEST_ID_ERROR_OVERLAY_ACTION, TEST_ID_ERROR_OVERLAY_MESSAGE, TEST_ID_WIDGET_ERROR_OVERLAY } from "../constants/testIds";

describe("WidgetErrorOverlay", () => {
  it("renders children normally when not visible", () => {
    render(
      <WidgetErrorOverlay isVisible={false} message="Error" actionLabel="Retry" isPending={false}>
        <div data-testid="child">Content</div>
      </WidgetErrorOverlay>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_WIDGET_ERROR_OVERLAY)).not.toBeInTheDocument();
  });

  it("shows overlay when visible", () => {
    render(
      <WidgetErrorOverlay isVisible={true} message="OBS Disconnected" actionLabel="Tap to Retry" isPending={false}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    expect(screen.getByTestId(TEST_ID_WIDGET_ERROR_OVERLAY)).toBeInTheDocument();
    expect(screen.getByTestId(TEST_ID_ERROR_OVERLAY_MESSAGE)).toHaveTextContent("OBS Disconnected");
    expect(screen.getByTestId(TEST_ID_ERROR_OVERLAY_ACTION)).toHaveTextContent("Tap to Retry");
  });

  it("shows spinner when isPending", () => {
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Retry" isPending={true}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    expect(screen.getByTestId(TEST_ID_ERROR_OVERLAY_ACTION).querySelector("ion-spinner")).toBeInTheDocument();
  });

  it("onAction fires on click", () => {
    const onAction = vi.fn();
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Retry" isPending={false} onAction={onAction}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    fireEvent.click(screen.getByTestId(TEST_ID_WIDGET_ERROR_OVERLAY));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("onAction fires on enter", () => {
    const onAction = vi.fn();
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Retry" isPending={false} onAction={onAction}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    fireEvent.keyDown(screen.getByTestId(TEST_ID_WIDGET_ERROR_OVERLAY), { key: "Enter" });
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("non-interactive when onAction absent", () => {
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Contact Admin" isPending={false}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    const overlay = screen.getByTestId(TEST_ID_WIDGET_ERROR_OVERLAY);
    expect(overlay).not.toHaveAttribute("role", "button");
  });
});
