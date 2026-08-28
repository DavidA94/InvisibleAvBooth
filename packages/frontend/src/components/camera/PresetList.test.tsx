import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PresetList } from "./PresetList";
import type { CameraPreset } from "@invisible-av-booth/shared";
import { TEST_ID_PRESET_ROW, TEST_ID_PRESET_ACTIVATE_BUTTON } from "../../constants/testIds";

const mockEmit = vi.fn((_event: string, _payload: unknown, ack?: (result: { success: boolean }) => void) => {
  ack?.({ success: true });
});
vi.mock("../../providers/SocketProvider", () => ({
  useSocket: () => ({ emit: mockEmit }),
}));

const presets: CameraPreset[] = [
  {
    id: "p1",
    name: "Wide",
    sortOrder: 0,
    storedOnCamera: false,
    cameraPresetSlot: null,
    pan: 0,
    tilt: 0,
    zoom: 0,
    focus: 0.5,
    autoFocus: true,
    aiTracking: false,
    aiTilt: false,
    aiZoom: false,
  },
  {
    id: "p2",
    name: "Close",
    sortOrder: 1,
    storedOnCamera: true,
    cameraPresetSlot: 1,
    pan: 0.5,
    tilt: 0.2,
    zoom: 0.8,
    focus: 0.3,
    autoFocus: false,
    aiTracking: false,
    aiTilt: false,
    aiZoom: false,
  },
  {
    id: "p3",
    name: "Left",
    sortOrder: 2,
    storedOnCamera: false,
    cameraPresetSlot: null,
    pan: -0.5,
    tilt: 0,
    zoom: 0.3,
    focus: 0.5,
    autoFocus: true,
    aiTracking: false,
    aiTilt: false,
    aiZoom: false,
  },
  {
    id: "p4",
    name: "Right",
    sortOrder: 3,
    storedOnCamera: false,
    cameraPresetSlot: null,
    pan: 0.5,
    tilt: 0,
    zoom: 0.3,
    focus: 0.5,
    autoFocus: true,
    aiTracking: false,
    aiTilt: false,
    aiZoom: false,
  },
];

describe("PresetList", () => {
  it("renders presets in order", () => {
    render(<PresetList presets={presets} activePresetId={null} cameraId="cam1" />);
    const rows = screen.getAllByTestId(TEST_ID_PRESET_ROW);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("Wide");
    expect(rows[1]).toHaveTextContent("Close");
  });

  it("activate button emits event", async () => {
    const user = userEvent.setup();
    const onToast = vi.fn();
    render(<PresetList presets={presets} activePresetId={null} cameraId="cam1" onToast={onToast} />);
    const buttons = screen.getAllByTestId(TEST_ID_PRESET_ACTIVATE_BUTTON);
    await user.click(buttons[0]!);
    expect(mockEmit).toHaveBeenCalledWith("cts:camera:preset:activate", { cameraId: "cam1", presetId: "p1" }, expect.any(Function));
    expect(onToast).toHaveBeenCalledWith("Preset activated");
  });

  it("active preset is highlighted", () => {
    render(<PresetList presets={presets} activePresetId="p2" cameraId="cam1" />);
    const rows = screen.getAllByTestId(TEST_ID_PRESET_ROW);
    expect(rows[1]).toHaveAttribute("data-active", "true");
    expect(rows[0]).toHaveAttribute("data-active", "false");
  });

  it("scrolls when more than 3 presets (list renders all)", () => {
    render(<PresetList presets={presets} activePresetId={null} cameraId="cam1" />);
    const rows = screen.getAllByTestId(TEST_ID_PRESET_ROW);
    expect(rows).toHaveLength(4);
  });

  it("calls onToast with error message on failed activation", async () => {
    const user = userEvent.setup();
    mockEmit.mockImplementation((_event: string, _payload: unknown, ack?: (result: { success: boolean; error?: string }) => void) => {
      ack?.({ success: false, error: "Camera offline" });
    });
    const onToast = vi.fn();
    render(<PresetList presets={presets} activePresetId={null} cameraId="cam1" onToast={onToast} />);
    const activateButtons = screen.getAllByTestId(TEST_ID_PRESET_ACTIVATE_BUTTON);
    await user.click(activateButtons[0]!);
    expect(onToast).toHaveBeenCalledWith("Camera offline");
  });
});
