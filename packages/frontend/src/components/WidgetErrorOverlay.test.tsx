import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WidgetErrorOverlay } from "./WidgetErrorOverlay";

describe("WidgetErrorOverlay", () => {
  it("renders children normally when not visible", () => {
    render(
      <WidgetErrorOverlay isVisible={false} message="Error" actionLabel="Retry" isPending={false}>
        <div data-testid="child">Content</div>
      </WidgetErrorOverlay>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    expect(screen.queryByTestId("widget-error-overlay")).not.toBeInTheDocument();
  });

  it("shows overlay when visible", () => {
    render(
      <WidgetErrorOverlay isVisible={true} message="OBS Disconnected" actionLabel="Tap to Retry" isPending={false}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    expect(screen.getByTestId("widget-error-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("error-overlay-message")).toHaveTextContent("OBS Disconnected");
    expect(screen.getByTestId("error-overlay-action")).toHaveTextContent("Tap to Retry");
  });

  it("shows spinner when isPending", () => {
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Retry" isPending={true}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    expect(screen.getByTestId("error-overlay-action").querySelector("ion-spinner")).toBeInTheDocument();
  });

  it("onAction fires on click", () => {
    const onAction = vi.fn();
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Retry" isPending={false} onAction={onAction}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    fireEvent.click(screen.getByTestId("widget-error-overlay"));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it("non-interactive when onAction absent", () => {
    render(
      <WidgetErrorOverlay isVisible={true} message="Error" actionLabel="Contact Admin" isPending={false}>
        <div>Content</div>
      </WidgetErrorOverlay>,
    );
    const overlay = screen.getByTestId("widget-error-overlay");
    expect(overlay).not.toHaveAttribute("role", "button");
  });
});
