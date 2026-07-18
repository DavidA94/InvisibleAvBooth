import type { Socket } from "socket.io-client";
import { STC_OBS_STATE, STC_OBS_ERROR_RESOLVED, STC_DEVICE_CAPABILITIES, STC_OBS_AUDIO_LEVELS } from "@invisible-av-booth/shared";
import type { ObsState } from "../../types";
import { useStore } from "../../store";
import { logger } from "../../logger";

interface DeviceCapabilities {
  deviceId: string;
  capabilities: { deviceId: string; deviceType: string; features: Record<string, boolean> };
}

export function registerObsSocketHandlers(socket: Socket): void {
  socket.on(STC_OBS_STATE, (state: ObsState) => {
    logger.debug("OBS state received", { context: { connected: state.connected, streaming: state.streaming, recording: state.recording } });
    useStore.getState().setObsState(state);
  });

  socket.on(STC_OBS_ERROR_RESOLVED, (payload: { errorCode: string }) => {
    useStore.getState().removeNotification(payload.errorCode);
  });

  socket.on(STC_DEVICE_CAPABILITIES, (payload: DeviceCapabilities) => {
    if (payload.deviceId === "obs-preview" && payload.capabilities.features["ndiConfigured"] !== undefined) {
      useStore.getState().setObsPreviewNdiConfigured(payload.capabilities.features["ndiConfigured"]!);
    }
    // Audio metering capability from PreviewStreamManager
    if (payload.deviceId === "preview" && payload.capabilities.features["audioMetering"] !== undefined) {
      useStore.getState().setObsLevelPipelineAvailable(payload.capabilities.features["audioMetering"]!);
    }
  });

  socket.on(STC_OBS_AUDIO_LEVELS, (levels: { left: number; right: number }) => {
    const store = useStore.getState();
    store.setObsAudioLevels(levels);
    if (!store.obsAudioEventsFlowing) {
      store.setObsAudioEventsFlowing(true);
    }
  });
}
