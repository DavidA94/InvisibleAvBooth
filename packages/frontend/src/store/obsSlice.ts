import type { StateCreator } from "zustand";
import type { ObsState } from "../types";

export const INITIAL_OBS_STATE: ObsState = {
  connected: false,
  streaming: false,
  recording: false,
  commandedState: { streaming: false, recording: false },
};

export interface ObsSlice {
  obsState: ObsState;
  obsPending: boolean;
  setObsState: (state: ObsState) => void;
  setObsPending: (pending: boolean) => void;
}

export const createObsSlice: StateCreator<ObsSlice> = (set) => ({
  obsState: INITIAL_OBS_STATE,
  obsPending: false,
  setObsState: (obsState) => set({ obsState, obsPending: false }),
  setObsPending: (obsPending) => set({ obsPending }),
});
