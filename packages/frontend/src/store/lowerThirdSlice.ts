import type { StateCreator } from "zustand";
import type { LowerThirdState } from "@invisible-av-booth/shared";

export const INITIAL_LOWER_THIRD_STATE: LowerThirdState = {
  active: null,
  library: [],
  phase: "hidden",
  autoDismissAt: null,
  overlayConnected: false,
  overlayResolutionCorrect: false,
  transitionLocked: false,
};

export interface LowerThirdSlice {
  lowerThirdState: LowerThirdState;
  setLowerThirdState: (state: LowerThirdState) => void;
}

export const createLowerThirdSlice: StateCreator<LowerThirdSlice> = (set) => ({
  lowerThirdState: INITIAL_LOWER_THIRD_STATE,
  setLowerThirdState: (lowerThirdState) => set({ lowerThirdState }),
});
