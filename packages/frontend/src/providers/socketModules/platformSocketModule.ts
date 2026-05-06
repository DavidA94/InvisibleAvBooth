import type { Socket } from "socket.io-client";
import { STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";
import type { PlatformConnectionState, RelayState } from "../../store/platformSlice";
import { useStore } from "../../store";

export function registerPlatformSocketHandlers(socket: Socket): void {
  socket.on(STC_PLATFORM_STATE, (payload: { platformType: string; state: { status: string; statusMessage?: string } }) => {
    useStore.getState().setPlatformState(payload.platformType, {
      state: payload.state.status as PlatformConnectionState["state"],
      ...(payload.state.statusMessage ? { error: payload.state.statusMessage } : {}),
    });
  });

  socket.on(STC_PLATFORM_HEALTH, (payload: { platformType: string; health: Record<string, unknown> }) => {
    useStore.getState().setPlatformHealth(payload.platformType, payload.health);
  });

  socket.on(STC_RELAY_STATE, (payload: RelayState) => {
    useStore.getState().setRelayState(payload);
  });

  socket.on(STC_PLATFORM_READINESS, (payload: { platforms: Array<{ platformType: string; label: string; healthy: boolean; privacy?: string }> }) => {
    useStore.getState().setPlatformReadiness(payload.platforms);
  });
}
