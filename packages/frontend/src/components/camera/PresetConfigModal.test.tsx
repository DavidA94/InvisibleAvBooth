import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "../../test/ionicMocks";
import { PresetConfigModal } from "./PresetConfigModal";
import { TEST_ID_MODAL_CONTAINER } from "../../constants/testIds";

describe("PresetConfigModal", () => {
  const onClose = vi.fn();
  const onSave = vi.fn();
  const onCapturePosition = vi.fn().mockResolvedValue({ pan: 0.5, tilt: -0.2, zoom: 0.75, focus: null, autoFocus: true });

  beforeEach(() => vi.clearAllMocks());

  it("does not render when closed", () => {
    render(<PresetConfigModal open={false} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.queryByTestId(TEST_ID_MODAL_CONTAINER)).not.toBeInTheDocument();
  });

  it("renders when open", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.getByTestId(TEST_ID_MODAL_CONTAINER)).toBeInTheDocument();
  });

  it("shows Create Preset title for new preset", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.getByText("Create Preset")).toBeInTheDocument();
  });

  it("shows Edit Preset title when editing", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} initialName="Wide" />);
    expect(screen.getByText("Edit Preset: Wide")).toBeInTheDocument();
  });

  it("store-on-camera toggle reveals slot input", () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    expect(screen.queryByTestId("preset-slot-input")).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Store on Camera"));
    expect(screen.getByTestId("preset-slot-input")).toBeInTheDocument();
  });

  it("capture position and save calls both handlers", async () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    // Set the name via the input
    const nameInput = screen.getByTestId("preset-name-input").querySelector("input")!;
    fireEvent.change(nameInput, { target: { value: "My Preset" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId("preset-save-btn"));
    });
    expect(onCapturePosition).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "My Preset", storedOnCamera: false, cameraPresetSlot: null }));
  });
});
