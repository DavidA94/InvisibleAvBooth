import type { StateCreator } from "zustand";
import type { SessionManifest } from "../types";

export interface SessionManifestSlice {
  manifest: SessionManifest;
  interpolatedStreamTitle: string;
  interpolatedDescription: string;
  manifestReady: boolean;
  setManifest: (manifest: SessionManifest, interpolatedStreamTitle: string, interpolatedDescription?: string, manifestReady?: boolean) => void;
}

export const createSessionManifestSlice: StateCreator<SessionManifestSlice> = (set) => ({
  manifest: {},
  interpolatedStreamTitle: "",
  interpolatedDescription: "",
  manifestReady: false,
  setManifest: (manifest, interpolatedStreamTitle, interpolatedDescription = "", manifestReady = false) =>
    set({ manifest, interpolatedStreamTitle, interpolatedDescription, manifestReady }),
});
