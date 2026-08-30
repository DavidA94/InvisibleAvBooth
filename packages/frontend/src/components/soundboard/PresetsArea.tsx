import { useState } from "react";
import type { ReactNode } from "react";
import type { MixerPresetSummary } from "@invisible-av-booth/shared";
import { Modal } from "../Modal";
import {
  TEST_ID_MIXER_PRESETS_AREA,
  TEST_ID_MIXER_PRESET_BUTTON,
  TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON,
  TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL,
} from "../../constants/testIds";

interface PresetsAreaProps {
  presets: MixerPresetSummary[];
  /** Max presets shown inline before overflowing to "View all presets" (≤2 rows). */
  inlineLimit?: number;
  /** Activate a preset — shows a toast and (from the modal) auto-closes. */
  onActivate: (presetId: string, name: string) => void;
}

/**
 * Preset buttons rendered below the channel strips (Req 10.3/10.4). Buttons wrap
 * to at most two rows; when there are more presets than fit, a "View all presets"
 * button opens a modal listing all of them (same style, scrolls). Activating a
 * preset (either place) fires onActivate; the modal auto-closes on activation.
 * WHEN there are zero presets the area renders nothing (takes no space, Req 15.4).
 */
export function PresetsArea({ presets, inlineLimit = 6, onActivate }: PresetsAreaProps): ReactNode {
  const [modalOpen, setModalOpen] = useState(false);

  if (presets.length === 0) return null; // zero presets → no space

  const overflow = presets.length > inlineLimit;
  const inline = overflow ? presets.slice(0, inlineLimit - 1) : presets;

  const handleActivate = (preset: MixerPresetSummary, fromModal: boolean): void => {
    onActivate(preset.id, preset.name);
    if (fromModal) setModalOpen(false); // auto-close on activation from the modal
  };

  return (
    <>
      <div className="mixer-presets-area" data-testid={TEST_ID_MIXER_PRESETS_AREA}>
        {inline.map((preset) => (
          <button
            key={preset.id}
            type="button"
            className="mixer-preset-button"
            data-testid={`${TEST_ID_MIXER_PRESET_BUTTON}-${preset.id}`}
            onClick={() => handleActivate(preset, false)}
          >
            {preset.name}
          </button>
        ))}
        {overflow && (
          <button type="button" className="mixer-preset-button" data-testid={TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON} onClick={() => setModalOpen(true)}>
            View all presets
          </button>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} size="small" header="All Presets">
        <div className="mixer-presets-area mixer-presets-area-modal" data-testid={TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL}>
          {presets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="mixer-preset-button"
              data-testid={`${TEST_ID_MIXER_PRESET_BUTTON}-modal-${preset.id}`}
              onClick={() => handleActivate(preset, true)}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </Modal>
    </>
  );
}
