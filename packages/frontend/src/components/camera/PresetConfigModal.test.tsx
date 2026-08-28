import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "../../test/ionicMocks";
import { PresetConfigModal } from "./PresetConfigModal";
import {
  TEST_ID_MODAL_CONTAINER,
  TEST_ID_PRESET_SLOT_INPUT,
  TEST_ID_PRESET_STORE_ON_CAMERA_TOGGLE,
  TEST_ID_PRESET_NAME_INPUT,
  TEST_ID_PRESET_SAVE_BUTTON,
} from "../../constants/testIds";

vi.mock("../../hooks/useResizeObserver", () => ({
  useResizeObserver: () => 300,
}));

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
    // Slot input exists but is disabled by default
    expect(screen.getByTestId(TEST_ID_PRESET_SLOT_INPUT)).toBeDisabled();
    fireEvent.click(screen.getByTestId(TEST_ID_PRESET_STORE_ON_CAMERA_TOGGLE));
    expect(screen.getByTestId(TEST_ID_PRESET_SLOT_INPUT)).not.toBeDisabled();
  });

  it("capture position and save calls both handlers", async () => {
    render(<PresetConfigModal open={true} onClose={onClose} onSave={onSave} onCapturePosition={onCapturePosition} />);
    // Set the name via the IonInput mock (renders as plain input with data-testid)
    const nameInput = screen.getByTestId(TEST_ID_PRESET_NAME_INPUT);
    fireEvent.change(nameInput, { target: { value: "My Preset" } });
    await act(async () => {
      fireEvent.click(screen.getByTestId(TEST_ID_PRESET_SAVE_BUTTON));
    });
    expect(onCapturePosition).toHaveBeenCalled();
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: "My Preset", storedOnCamera: false, cameraPresetSlot: null }));
  });
});
