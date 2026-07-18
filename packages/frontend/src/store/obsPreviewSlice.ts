import type { StateCreator } from "zustand";

export type ObsPreviewStatus = "inactive" | "connecting" | "streaming" | "error";

export interface ObsPreviewSlice {
  obsPreviewStatus: ObsPreviewStatus;
  obsPreviewNdiConfigured: boolean;
  obsAudioLevels: { left: number; right: number } | null;
  obsAudioEventsFlowing: boolean;
  obsLevelPipelineAvailable: boolean;
  setObsPreviewStatus: (status: ObsPreviewStatus) => void;
  setObsPreviewNdiConfigured: (configured: boolean) => void;
  setObsAudioLevels: (levels: { left: number; right: number } | null) => void;
  setObsAudioEventsFlowing: (flowing: boolean) => void;
  setObsLevelPipelineAvailable: (available: boolean) => void;
}

export const createObsPreviewSlice: StateCreator<ObsPreviewSlice> = (set) => ({
  obsPreviewStatus: "inactive",
  obsPreviewNdiConfigured: false,
  obsAudioLevels: null,
  obsAudioEventsFlowing: false,
  obsLevelPipelineAvailable: false,
  setObsPreviewStatus: (obsPreviewStatus) => set({ obsPreviewStatus }),
  setObsPreviewNdiConfigured: (obsPreviewNdiConfigured) => set({ obsPreviewNdiConfigured }),
  setObsAudioLevels: (obsAudioLevels) => set({ obsAudioLevels }),
  setObsAudioEventsFlowing: (obsAudioEventsFlowing) => set({ obsAudioEventsFlowing }),
  setObsLevelPipelineAvailable: (obsLevelPipelineAvailable) => set({ obsLevelPipelineAvailable }),
});
