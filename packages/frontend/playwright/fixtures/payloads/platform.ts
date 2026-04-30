export interface PlatformStatePayload {
  platformId: string;
  state: { status: string; statusMessage?: string };
}

export interface RelayStatePayload {
  running: boolean;
  obsConnected: boolean;
}

export interface PlatformReadinessPayload {
  platforms: Array<{ platformType: string; label: string; healthy: boolean }>;
}

export function platformStateIdle(platformId = "youtube"): PlatformStatePayload {
  return { platformId, state: { status: "idle" } };
}

export function platformStateStreaming(platformId = "youtube"): PlatformStatePayload {
  return { platformId, state: { status: "streaming" } };
}

export function platformStateStarting(platformId = "youtube"): PlatformStatePayload {
  return { platformId, state: { status: "starting" } };
}

export function platformStateError(platformId = "youtube", message = "API error"): PlatformStatePayload {
  return { platformId, state: { status: "error", statusMessage: message } };
}

export function relayStateDefault(): RelayStatePayload {
  return { running: false, obsConnected: false };
}

export function relayStateRunning(): RelayStatePayload {
  return { running: true, obsConnected: true };
}

export function platformReadinessDefault(): PlatformReadinessPayload {
  return { platforms: [{ platformType: "youtube", label: "YouTube", healthy: true }] };
}
