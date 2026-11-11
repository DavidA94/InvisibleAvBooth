import { useState } from "react";
import type { ReactNode } from "react";
import { IonSpinner } from "@ionic/react";
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
  /**
   * Preset ids currently awaiting the backend apply/verify ack. A button whose
   * id is here shows a spinner and is disabled — the tap is NOT optimistic, it
   * reflects real backend progress (Req: loading state until confirmed).
   */
  pendingPresetIds?: string[];
  /** Activate a preset — the parent marks it pending; the ack drives the toast. */
  onActivate: (presetId: string, name: string) => void;
}

/**
 * Preset buttons rendered below the channel strips (Req 10.3/10.4). Buttons wrap
 * to at most two rows; when there are more presets than fit, a "View all presets"
 * button opens a modal listing all of them (same style, scrolls). Activating a
 * preset puts its button into a LOADING state (spinner, disabled) until the
 * backend acks the apply+verify result — the volunteer sees the tap is being
 * worked, not silently assumed done. The modal auto-closes on activation.
 * WHEN there are zero presets the area renders nothing (takes no space, Req 15.4).
 */
export function PresetsArea({ presets, inlineLimit = 6, pendingPresetIds = [], onActivate }: PresetsAreaProps): ReactNode {
  const [modalOpen, setModalOpen] = useState(false);

  if (presets.length === 0) return null; // zero presets → no space

  const overflow = presets.length > inlineLimit;
  const inline = overflow ? presets.slice(0, inlineLimit - 1) : presets;

  const isPending = (presetId: string): boolean => pendingPresetIds.includes(presetId);

  const handleActivate = (preset: MixerPresetSummary, fromModal: boolean): void => {
    if (isPending(preset.id)) return; // ignore re-taps while a result is pending
    onActivate(preset.id, preset.name);
    if (fromModal) setModalOpen(false); // auto-close on activation from the modal
  };

  const renderButton = (preset: MixerPresetSummary, testId: string, fromModal: boolean): ReactNode => {
    const pending = isPending(preset.id);
    return (
      <button
        key={testId}
        type="button"
        className="mixer-preset-button"
        data-testid={testId}
        data-state={pending ? "loading" : "idle"}
        disabled={pending}
        onClick={() => handleActivate(preset, fromModal)}
      >
        {pending ? <IonSpinner name="crescent" /> : preset.name}
      </button>
    );
  };

  return (
    <>
      <div className="mixer-presets-area" data-testid={TEST_ID_MIXER_PRESETS_AREA}>
        {inline.map((preset) => renderButton(preset, `${TEST_ID_MIXER_PRESET_BUTTON}-${preset.id}`, false))}
        {overflow && (
          <button type="button" className="mixer-preset-button" data-testid={TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON} onClick={() => setModalOpen(true)}>
            View all presets
          </button>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} size="small" header="All Presets">
        <div className="mixer-presets-area mixer-presets-area-modal" data-testid={TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL}>
          {presets.map((preset) => renderButton(preset, `${TEST_ID_MIXER_PRESET_BUTTON}-modal-${preset.id}`, true))}
        </div>
      </Modal>
    </>
  );
}
