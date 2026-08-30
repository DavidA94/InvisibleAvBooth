import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PresetsArea } from "./PresetsArea";
import type { MixerPresetSummary } from "@invisible-av-booth/shared";
import {
  TEST_ID_MIXER_PRESETS_AREA,
  TEST_ID_MIXER_PRESET_BUTTON,
  TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON,
  TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL,
} from "../../constants/testIds";

const makePresets = (n: number): MixerPresetSummary[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Preset ${i + 1}`, sortOrder: i }));

describe("PresetsArea", () => {
  it("renders nothing when there are zero presets (Req 15.4)", () => {
    const { container } = render(<PresetsArea presets={[]} onActivate={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders preset buttons inline when they fit", () => {
    render(<PresetsArea presets={makePresets(3)} inlineLimit={6} onActivate={vi.fn()} />);
    expect(screen.getByTestId(TEST_ID_MIXER_PRESETS_AREA)).toBeInTheDocument();
    expect(screen.getByTestId(`${TEST_ID_MIXER_PRESET_BUTTON}-p1`)).toBeInTheDocument();
    expect(screen.queryByTestId(TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON)).toBeNull();
  });

  it("activates a preset and fires onActivate with id + name", () => {
    const onActivate = vi.fn();
    render(<PresetsArea presets={makePresets(2)} inlineLimit={6} onActivate={onActivate} />);
    fireEvent.click(screen.getByTestId(`${TEST_ID_MIXER_PRESET_BUTTON}-p1`));
    expect(onActivate).toHaveBeenCalledWith("p1", "Preset 1");
  });

  it("shows View all presets on overflow and lists all in the modal", () => {
    render(<PresetsArea presets={makePresets(10)} inlineLimit={6} onActivate={vi.fn()} />);
    const viewAll = screen.getByTestId(TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON);
    expect(viewAll).toBeInTheDocument();
    fireEvent.click(viewAll);
    const modal = screen.getByTestId(TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL);
    // All 10 presets appear in the modal.
    expect(modal.querySelectorAll("button")).toHaveLength(10);
  });

  it("activating from the modal fires onActivate and auto-closes the modal", () => {
    const onActivate = vi.fn();
    render(<PresetsArea presets={makePresets(10)} inlineLimit={6} onActivate={onActivate} />);
    fireEvent.click(screen.getByTestId(TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON));
    fireEvent.click(screen.getByTestId(`${TEST_ID_MIXER_PRESET_BUTTON}-modal-p9`));
    expect(onActivate).toHaveBeenCalledWith("p9", "Preset 9");
    // Modal auto-closes → its content is gone.
    expect(screen.queryByTestId(TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL)).toBeNull();
  });
});
