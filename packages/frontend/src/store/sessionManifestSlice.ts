import type { StateCreator } from "zustand";
import type { SessionManifest } from "../types";

export interface SessionManifestSlice {
  manifest: SessionManifest;
  interpolatedStreamTitle: string;
  setManifest: (manifest: SessionManifest, interpolatedStreamTitle: string) => void;
}

export const createSessionManifestSlice: StateCreator<SessionManifestSlice> = (set) => ({
  manifest: {},
  interpolatedStreamTitle: "",
  setManifest: (manifest, interpolatedStreamTitle) => set({ manifest, interpolatedStreamTitle }),
});
