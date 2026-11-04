import { useState } from "react";
import type { ReactNode } from "react";
import { IonInput, IonButton, IonSpinner, IonText } from "@ionic/react";
import { Modal } from "../Modal";
import { SoundBoardWidget } from "./SoundBoardWidget";
import type { MixerPresetPayload } from "@invisible-av-booth/shared";
import { TEST_ID_PRESET_NAME_INPUT, TEST_ID_PRESET_SAVE_BUTTON, TEST_ID_PRESET_CANCEL_BUTTON, TEST_ID_PRESET_POSITION_SUMMARY } from "../../constants/testIds";

interface PresetConfigModalProps {
  open: boolean;
  mixerId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Preset authoring modal for the Sound Board (Req 10.8). Mirrors the Camera
 * preset flow: it embeds the SAME live Sound Board widget the volunteer dashboard
 * uses (pinned to this mixer via `forceSelectedId`), so the admin dials in the
 * board live — faders, mute, gain — then "Capture current board" snapshots the
 * current state via the capture-preset endpoint (read-back with bounded retry,
 * fails on unconfirmed channels) and saves it as a named preset.
 */
export function PresetConfigModal({ open, mixerId, onClose, onSaved }: PresetConfigModalProps): ReactNode {
  const [name, setName] = useState("");
  const [payload, setPayload] = useState<MixerPresetPayload | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = (): void => {
    setName("");
    setPayload(null);
    setError("");
  };

  const handleCapture = async (): Promise<void> => {
    setCapturing(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/mixers/${mixerId}/capture-preset`, { method: "POST", credentials: "include" });
      const data = (await response.json()) as { ok: boolean; payload?: MixerPresetPayload; error?: string };
      if (data.ok && data.payload) {
        setPayload(data.payload);
      } else {
        setError(data.error ?? "Capture failed");
      }
    } catch {
      setError("Network error while capturing");
    } finally {
      setCapturing(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!name.trim() || !payload) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/mixers/${mixerId}/presets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name, payload }),
      });
      if (response.ok) {
        reset();
        onSaved();
        return;
      }
      const data = (await response.json()) as { error?: string };
      setError(data.error ?? "Save failed");
    } catch {
      setError("Network error while saving");
    } finally {
      setSaving(false);
    }
  };

  const capturedChannels = payload
    ? new Set(
        Object.keys(payload)
          .map((address) => /\/ch\/(\d+)\//.exec(address)?.[1])
          .filter(Boolean),
      ).size
    : 0;

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        reset();
        onClose();
      }}
      size="large"
      header="Author Preset"
    >
      <div className="form-layout">
        <IonInput
          data-testid={TEST_ID_PRESET_NAME_INPUT}
          label="Preset name"
          labelPlacement="stacked"
          fill="outline"
          value={name}
          onIonInput={(e) => setName(e.detail.value ?? "")}
          clearInput
        />

        {/* The same live Sound Board widget the volunteer dashboard uses, pinned to
            this mixer. The admin adjusts the real board here, then captures it. */}
        <div className="soundboard-preset-live">
          <SoundBoardWidget enabled={open} forceSelectedId={mixerId} />
        </div>

        <IonButton size="small" fill="outline" disabled={capturing} onClick={() => void handleCapture()}>
          {capturing ? <IonSpinner name="crescent" /> : "Capture current board"}
        </IonButton>

        {payload && (
          <p className="text-muted text-secondary" data-testid={TEST_ID_PRESET_POSITION_SUMMARY}>
            {capturedChannels} channel{capturedChannels === 1 ? "" : "s"} captured: faders, mutes, gain.
          </p>
        )}

        {error && (
          <IonText color="danger">
            <p className="margin-none text-secondary">{error}</p>
          </IonText>
        )}

        <div className="layout-row gap-standard margin-top-standard">
          <IonButton data-testid={TEST_ID_PRESET_SAVE_BUTTON} disabled={saving || !name.trim() || !payload} onClick={() => void handleSave()}>
            {saving ? <IonSpinner name="crescent" /> : "Save Preset"}
          </IonButton>
          <IonButton
            data-testid={TEST_ID_PRESET_CANCEL_BUTTON}
            fill="outline"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Cancel
          </IonButton>
        </div>
      </div>
    </Modal>
  );
}
