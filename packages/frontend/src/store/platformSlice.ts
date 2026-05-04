import type { StateCreator } from "zustand";

// Platform stream lifecycle states — covers the full range from idle through
// active streaming to error/recovery. The hook (usePlatformState) derives
// boolean flags (isAnyStarting, isAnyStopping, isAnyStreaming) from these.
export type PlatformStreamState = "idle" | "starting" | "streaming" | "stopping" | "error" | "no_source" | "recovering";

export interface PlatformConnectionState {
  state: PlatformStreamState;
  error?: string;
}

export interface RelayState {
  running: boolean;
  obsConnected: boolean;
}

export const INITIAL_RELAY_STATE: RelayState = {
  running: false,
  obsConnected: false,
};

export interface PlatformSlice {
  platformStates: Map<string, PlatformConnectionState>;
  platformHealth: Map<string, Record<string, unknown>>;
  relayState: RelayState;
  platformReadiness: boolean;
  setPlatformState: (platformType: string, connectionState: PlatformConnectionState) => void;
  setPlatformHealth: (platformType: string, health: Record<string, unknown>) => void;
  setRelayState: (relayState: RelayState) => void;
  setPlatformReadiness: (ready: boolean) => void;
}

export const createPlatformSlice: StateCreator<PlatformSlice> = (set) => ({
  platformStates: new Map(),
  platformHealth: new Map(),
  relayState: INITIAL_RELAY_STATE,
  platformReadiness: false,
  setPlatformState: (platformType, connectionState) =>
    set((prev) => {
      const next = new Map(prev.platformStates);
      next.set(platformType, connectionState);
      return { platformStates: next };
    }),
  setPlatformHealth: (platformType, health) =>
    set((prev) => {
      const next = new Map(prev.platformHealth);
      next.set(platformType, health);
      return { platformHealth: next };
    }),
  setRelayState: (relayState) => set({ relayState }),
  setPlatformReadiness: (platformReadiness) => set({ platformReadiness }),
});
