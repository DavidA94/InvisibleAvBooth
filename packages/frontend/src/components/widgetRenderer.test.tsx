import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { renderWidget } from "./widgetRenderer";
import type { GridCell } from "../types";

// Mock all widget components to avoid complex dependency chains
vi.mock("./obs/ObsWidget", () => ({
  ObsWidget: () => <div data-testid="mock-obs-widget">OBS Widget</div>,
}));
vi.mock("./lower-thirds/LowerThirdWidget", () => ({
  LowerThirdWidget: () => <div data-testid="mock-lt-widget">Lower Third Widget</div>,
}));
vi.mock("./obs-preview/ObsPreviewWidget", () => ({
  ObsPreviewWidget: () => <div data-testid="mock-obs-preview-widget">OBS Preview Widget</div>,
}));
vi.mock("./camera/CameraWidget", () => ({
  CameraWidget: () => <div data-testid="mock-camera-widget">Camera Widget</div>,
}));

const makeCell = (widgetId: string, title = widgetId): GridCell => ({
  widgetId,
  title,
  col: 0,
  row: 0,
  colSpan: 2,
  rowSpan: 2,
  roleMinimum: "AvVolunteer",
});

describe("renderWidget", () => {
  it("renders ObsWidget for widgetId 'obs'", () => {
    render(<>{renderWidget(makeCell("obs", "OBS"))}</>);
    expect(screen.getByTestId("mock-obs-widget")).toBeInTheDocument();
  });

  it("renders LowerThirdWidget for widgetId 'lower-thirds'", () => {
    render(<>{renderWidget(makeCell("lower-thirds", "Lower Thirds"))}</>);
    expect(screen.getByTestId("mock-lt-widget")).toBeInTheDocument();
  });

  it("renders ObsPreviewWidget for widgetId 'obs-preview'", () => {
    render(<>{renderWidget(makeCell("obs-preview", "OBS Preview"))}</>);
    expect(screen.getByTestId("mock-obs-preview-widget")).toBeInTheDocument();
  });

  it("renders CameraWidget for widgetId 'camera'", () => {
    render(<>{renderWidget(makeCell("camera", "Camera"))}</>);
    expect(screen.getByTestId("mock-camera-widget")).toBeInTheDocument();
  });

  it("renders placeholder for unknown widget ID with title", () => {
    render(<>{renderWidget(makeCell("audio", "Audio Mixer"))}</>);
    expect(screen.getByTestId("widget-audio")).toBeInTheDocument();
    expect(screen.getByText("Audio Mixer")).toBeInTheDocument();
  });

  it("renders placeholder for another unknown widget ID", () => {
    render(<>{renderWidget(makeCell("future-widget", "Future"))}</>);
    expect(screen.getByTestId("widget-future-widget")).toBeInTheDocument();
    expect(screen.getByText("Future")).toBeInTheDocument();
  });
});
