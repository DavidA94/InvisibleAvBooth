import type { Socket } from "socket.io-client";
import {
  STC_MIXER_STATE,
  STC_MIXER_STATE_UPDATE,
  STC_MIXER_LEVELS,
  STC_MIXER_ERROR,
  STC_MIXER_ERROR_RESOLVED,
  STC_MIXER_PRESET_RESULT,
} from "@invisible-av-booth/shared";
import type { MixerState, MixerChannelLevel, MixerPresetResult } from "@invisible-av-booth/shared";
import { useStore } from "../../store";
import { logger } from "../../logger";

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

  // Preset apply/verify ack (sent only to the requesting socket). End the
  // button's loading state and toast the real outcome — success only after the
  // backend confirmed the audible fields on the board, failure (with the
  // unconfirmed channels) otherwise. We resolve the preset NAME from the mixer
  // state so the toast reads naturally; if it has since gone, fall back to a
  // generic label.
  socket.on(STC_MIXER_PRESET_RESULT, (result: MixerPresetResult) => {
    const store = useStore.getState();
    const startedAt = store.presetPendingSince[result.presetId];
    store.clearPresetPending(result.presetId);
    // Tap→ack round-trip as seen by THIS browser (includes any main-thread delay),
    // so a slow apply can be told apart from a slow backend in app.log.
    logger.info("Preset ack received", {
      context: {
        mixerId: result.mixerId,
        presetId: result.presetId,
        ok: result.ok,
        rttMs: startedAt === undefined ? null : Math.round(performance.now() - startedAt),
      },
    });
    const preset = store.mixerStates[result.mixerId]?.presets.find((p) => p.id === result.presetId);
    const name = preset?.name ?? "Preset";
    if (result.ok) {
      store.addNotification({
        id: `preset-${result.presetId}-${Date.now()}`,
        level: "toast",
        severity: "info",
        message: `Applied: ${name}`,
      });
    } else {
      const detail = result.unconfirmedChannels?.length
        ? ` (unconfirmed ch ${result.unconfirmedChannels.join(", ")})`
        : result.error
          ? ` — ${result.error}`
          : "";
      store.addNotification({
        id: `preset-${result.presetId}-${Date.now()}`,
        level: "toast",
        severity: "error",
        message: `Failed to apply ${name}${detail}`,
      });
    }
  });
}
