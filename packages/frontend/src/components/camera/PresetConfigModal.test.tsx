import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "../../test/ionicMocks";
import { PresetConfigModal } from "./PresetConfigModal";

describe("PresetConfigModal", () => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onCapturePosition = vi.fn().mockResolvedValue({ pan: 0.5, tilt: -0.2, zoom: 0.75, focus: null, autoFocus: true });

  beforeEach(() => vi.clearAllMocks());

  it("does not render when closed", () => {
    render(<PresetConfigModal open={false} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.queryByTestId("preset-config-modal")).not.toBeInTheDocument();
  });

  it("renders when open", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.getByTestId("preset-config-modal")).toBeInTheDocument();
  });

  it("capture position displays summary", async () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("capture-position-btn"));
    });
    expect(screen.getByTestId("position-summary")).toBeInTheDocument();
    expect(screen.getByTestId("position-summary")).toHaveTextContent("0.5");
    expect(screen.getByTestId("position-summary")).toHaveTextContent("0.75");
  });

  it("null values show N/A", async () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    await act(async () => {
      fireEvent.click(screen.getByTestId("capture-position-btn"));
    });
    expect(screen.getByTestId("position-summary")).toHaveTextContent("N/A");
  });

  it("store-on-camera toggle reveals slot input", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.queryByTestId("preset-slot-input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Store on Camera"));
    expect(screen.getByTestId("preset-slot-input")).toBeInTheDocument();
  });

  it("save emits correct payload", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    const nameInput = screen.getByLabelText("Name");
    fireEvent.change(nameInput, { target: { value: "My Preset" } });
    fireEvent.click(screen.getByTestId("preset-save-btn"));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "My Preset", storedOnCamera: false, cameraPresetSlot: null }));
  });
});
