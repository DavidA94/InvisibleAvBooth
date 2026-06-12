import type { StateCreator } from "zustand";

export type ObsPreviewStatus = "inactive" | "connecting" | "streaming" | "error";

export interface ObsPreviewSlice {
  obsPreviewStatus: ObsPreviewStatus;
  obsPreviewNdiConfigured: boolean;
  setObsPreviewStatus: (status: ObsPreviewStatus) => void;
  setObsPreviewNdiConfigured: (configured: boolean) => void;
}

export const createObsPreviewSlice: StateCreator<ObsPreviewSlice> = (set) => ({
  obsPreviewStatus: "inactive",
  obsPreviewNdiConfigured: false,
  setObsPreviewStatus: (obsPreviewStatus) => set({ obsPreviewStatus }),
  setObsPreviewNdiConfigured: (obsPreviewNdiConfigured) => set({ obsPreviewNdiConfigured }),
});
