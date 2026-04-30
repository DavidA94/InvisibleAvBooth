import type { Socket } from "socket.io-client";
import { STC_PLATFORM_STATE, STC_PLATFORM_HEALTH, STC_RELAY_STATE, STC_PLATFORM_READINESS } from "@invisible-av-booth/shared";
import type { PlatformConnectionState, RelayState } from "../../store/platformSlice";
import { useStore } from "../../store";

export function registerPlatformSocketHandlers(socket: Socket): void {
  socket.on(STC_PLATFORM_STATE, (payload: { platformType: string; state: PlatformConnectionState }) => {
    useStore.getState().setPlatformState(payload.platformType, payload.state);
  });

  socket.on(STC_PLATFORM_HEALTH, (payload: { platformType: string; health: Record<string, unknown> }) => {
    useStore.getState().setPlatformHealth(payload.platformType, payload.health);
  });

  socket.on(STC_RELAY_STATE, (payload: RelayState) => {
    useStore.getState().setRelayState(payload);
  });

  socket.on(STC_PLATFORM_READINESS, (payload: { ready: boolean }) => {
    useStore.getState().setPlatformReadiness(payload.ready);
  });
}
