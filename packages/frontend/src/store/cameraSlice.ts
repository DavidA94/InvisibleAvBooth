import type { StateCreator } from "zustand";
import type { CameraState } from "@invisible-av-booth/shared";

export interface CameraSlice {
  cameraStates: Record<string, CameraState>;
  setCameraState: (state: CameraState) => void;
  setAllCameraStates: (states: CameraState[]) => void;
  clearActivePreset: (cameraId: string) => void;
}

export const createCameraSlice: StateCreator<CameraSlice> = (set) => ({
  cameraStates: {},
  setCameraState: (state) =>
    set((prev) => ({
      cameraStates: { ...prev.cameraStates, [state.cameraId]: state },
    })),
  setAllCameraStates: (states) =>
    set({
      cameraStates: Object.fromEntries(states.map((s) => [s.cameraId, s])),
    }),
  clearActivePreset: (cameraId) =>
    set((prev) => {
      const existing = prev.cameraStates[cameraId];
      if (!existing) return prev;
      return {
        cameraStates: { ...prev.cameraStates, [cameraId]: { ...existing, activePresetId: null } },
      };
    }),
});
