import type { Socket } from "socket.io-client";
import { STC_MIXER_STATE, STC_MIXER_STATE_UPDATE, STC_MIXER_LEVELS, STC_MIXER_ERROR, STC_MIXER_ERROR_RESOLVED } from "@invisible-av-booth/shared";
import type { MixerState, MixerChannelLevel } from "@invisible-av-booth/shared";
import { useStore } from "../../store";

interface MixerErrorPayload {
  errorCode: string;
  mixerId?: string;
  message: string;
  level: "modal";
}

/**
 * Wires incoming mixer socket events to the Zustand store.
 *
 * - STC_MIXER_STATE carries the full array of MixerState (initial state).
 * - STC_MIXER_STATE_UPDATE carries a full MixerState for one mixer (the backend
 *   broadcasts full state on every change), so we replace that mixer's state.
 * - STC_MIXER_LEVELS carries per-channel meter levels.
 * - STC_MIXER_ERROR raises a catastrophic modal notification whose id === the
 *   errorCode; STC_MIXER_ERROR_RESOLVED removes it — the id linkage is what
 *   auto-clears the modal (identical to obsSocketModule's OBS_UNREACHABLE).
 */
export function registerMixerSocketHandlers(socket: Socket): void {
  socket.on(STC_MIXER_STATE, (states: MixerState[]) => {
    useStore.getState().setAllMixerStates(states);
  });

  socket.on(STC_MIXER_STATE_UPDATE, (state: MixerState) => {
    useStore.getState().setMixerState(state.mixerId, state);
  });

  socket.on(STC_MIXER_LEVELS, (payload: { mixerId: string; levels: MixerChannelLevel[] }) => {
    useStore.getState().setMixerLevels(payload.mixerId, payload.levels);
  });

  socket.on(STC_MIXER_ERROR, (payload: MixerErrorPayload) => {
    useStore.getState().addNotification({
      id: payload.errorCode,
      level: "modal",
      severity: "error",
      message: payload.message,
      errorCode: payload.errorCode,
    });
  });

  socket.on(STC_MIXER_ERROR_RESOLVED, (payload: { errorCode: string }) => {
    useStore.getState().removeNotification(payload.errorCode);
  });
}
