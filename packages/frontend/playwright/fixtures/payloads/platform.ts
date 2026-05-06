export interface PlatformStatePayload {
  platformType: string;
  state: { status: string; statusMessage?: string };
}

export interface RelayStatePayload {
  running: boolean;
  obsConnected: boolean;
}

export interface PlatformReadinessPayload {
  platforms: Array<{ platformType: string; label: string; healthy: boolean; privacy?: string }>;
}

export function platformStateIdle(platformType = "youtube"): PlatformStatePayload {
  return { platformType, state: { status: "idle" } };
}

export function platformStateStreaming(platformType = "youtube"): PlatformStatePayload {
  return { platformType, state: { status: "streaming" } };
}

export function platformStateStarting(platformType = "youtube", statusMessage = "Creating broadcast…"): PlatformStatePayload {
  return { platformType, state: { status: "starting", statusMessage } };
}

export function platformStateError(platformType = "youtube", message = "API error"): PlatformStatePayload {
  return { platformType, state: { status: "error", statusMessage: message } };
}

export function relayStateDefault(): RelayStatePayload {
  return { running: false, obsConnected: false };
}

export function relayStateRunning(): RelayStatePayload {
  return { running: true, obsConnected: true };
}

export function platformReadinessDefault(): PlatformReadinessPayload {
  return { platforms: [{ platformType: "youtube", label: "YouTube", healthy: true, privacy: "unlisted" }] };
}
