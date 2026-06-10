import { useCallback } from "react";
import type { ReactNode } from "react";
import type { CameraPreset } from "@invisible-av-booth/shared";
import { useSocket } from "../../providers/SocketProvider";
import { CTS_CAMERA_PRESET_ACTIVATE } from "@invisible-av-booth/shared";

interface PresetListProps {
  presets: CameraPreset[];
  activePresetId: string | null;
  cameraId: string;
  onToast?: (message: string) => void;
}

export function PresetList({ presets, activePresetId, cameraId, onToast }: PresetListProps): ReactNode {
  const socket = useSocket();

  const activate = useCallback(
    (presetId: string) => {
      socket?.emit(CTS_CAMERA_PRESET_ACTIVATE, { cameraId, presetId }, (result: { success: boolean; error?: string }) => {
        if (result.success) {
          onToast?.("Preset activated");
        } else {
          onToast?.(result.error ?? "Activation failed");
        }
      });
    },
    [socket, cameraId, onToast],
  );

  return (
    <div data-testid="preset-list" className="preset-list">
      {presets.map((p) => (
        <div
          key={p.id}
          className={`preset-row ${p.id === activePresetId ? "preset-active" : ""}`}
          data-testid="preset-row"
          data-active={p.id === activePresetId}
        >
          <span className="preset-name">{p.name}</span>
          <button type="button" data-testid="preset-activate-btn" onClick={() => activate(p.id)}>
            Activate
          </button>
        </div>
      ))}
    </div>
  );
}
