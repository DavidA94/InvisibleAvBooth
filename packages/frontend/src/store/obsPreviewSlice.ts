import type { StateCreator } from "zustand";

export type ObsPreviewStatus = "inactive" | "connecting" | "streaming" | "error";

export interface ObsPreviewSlice {
  obsPreviewStatus: ObsPreviewStatus;
  setObsPreviewStatus: (status: ObsPreviewStatus) => void;
}

export const createObsPreviewSlice: StateCreator<ObsPreviewSlice> = (set) => ({
  obsPreviewStatus: "inactive",
  setObsPreviewStatus: (obsPreviewStatus) => set({ obsPreviewStatus }),
});
