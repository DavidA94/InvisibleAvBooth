import type { Server } from "socket.io";
import type { SocketModule, AuthenticatedSocket } from "../socketModule.js";
import type { MixerService } from "../../../mixer/MixerService.js";
import { eventBus } from "../../../eventBus/eventBus.js";
import { BUS_MIXER_STATE_CHANGED, BUS_MIXER_LEVELS, BUS_MIXER_CAPTURE_PATH_LOST, BUS_MIXER_CAPTURE_PATH_RESTORED } from "../../../eventBus/types.js";
import {
  STC_MIXER_STATE,
  STC_MIXER_STATE_UPDATE,
  STC_MIXER_LEVELS,
  STC_MIXER_ERROR,
  STC_MIXER_ERROR_RESOLVED,
  CTS_MIXER_SET,
  CTS_MIXER_PRESET_ACTIVATE,
  CTS_MIXER_MONITOR_START,
  CTS_MIXER_MONITOR_STOP,
  CTS_MIXER_WIDGET_PRESENT,
} from "@invisible-av-booth/shared";
import type { MixerCommand } from "@invisible-av-booth/shared";
import { logger } from "../../../logger.js";

/** The errorCode that ties the capture-path modal raise to its resolution. */
export const MIXER_CAPTURE_PATH_LOST_CODE = "MIXER_CAPTURE_PATH_LOST";

/**
 * MixerSocketModule — bridges the mixer domain to Socket.io (SocketModule pattern,
 * steering §7). Broadcasts bus state/levels; handles per-socket commands
 * (AvVolunteer+); raises/clears the catastrophic capture-path modal exactly like
 * obsModule's OBS_UNREACHABLE (id === errorCode auto-clears it).
 */
export class MixerSocketModule implements SocketModule {
  constructor(private readonly mixerService: MixerService) {}

  register(io: Server): void {
    eventBus.subscribe(BUS_MIXER_STATE_CHANGED, ({ state }) => {
      io.emit(STC_MIXER_STATE_UPDATE, state);
    });
    eventBus.subscribe(BUS_MIXER_LEVELS, (payload) => {
      io.emit(STC_MIXER_LEVELS, payload);
    });
    // Catastrophic capture-path fault → frontend modal (level: "modal").
    eventBus.subscribe(BUS_MIXER_CAPTURE_PATH_LOST, ({ mixerId, reason }) => {
      io.emit(STC_MIXER_ERROR, { errorCode: MIXER_CAPTURE_PATH_LOST_CODE, mixerId, message: reason, level: "modal" });
    });
    eventBus.subscribe(BUS_MIXER_CAPTURE_PATH_RESTORED, () => {
      io.emit(STC_MIXER_ERROR_RESOLVED, { errorCode: MIXER_CAPTURE_PATH_LOST_CODE });
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;
    // Live operation is AvVolunteer and above (Req 9.5). Below that, ignore commands.
    const canOperate = jwtPayload.role === "AvVolunteer" || jwtPayload.role === "AvPowerUser" || jwtPayload.role === "ADMIN";

    // Per-socket, per-mixer widget-presence counts, so a crashed tablet cannot
    // leak a metering subscription: the disconnect handler decrements everything
    // this socket held (a Socket.io event has no implicit teardown).
    const presence = new Map<string, number>();

    socket.on(CTS_MIXER_SET, async (command: MixerCommand) => {
      if (!canOperate || !command || typeof command.mixerId !== "string") return;
      logger.debug("Mixer set", { userId: jwtPayload.sub, context: { mixerId: command.mixerId, channel: command.channel } });
      await this.mixerService.setChannel(command.mixerId, command);
    });

    socket.on(CTS_MIXER_PRESET_ACTIVATE, async (payload: { mixerId: string; presetId: string }) => {
      if (!canOperate || !payload?.mixerId || !payload?.presetId) return;
      logger.info("Mixer preset activate", { userId: jwtPayload.sub, context: { mixerId: payload.mixerId, presetId: payload.presetId } });
      await this.mixerService.activatePreset(payload.mixerId, payload.presetId);
    });

    socket.on(CTS_MIXER_MONITOR_START, (payload: { mixerId: string; channel: number }) => {
      if (!canOperate || !payload?.mixerId) return;
      this.mixerService.startChannelMonitor(payload.mixerId, payload.channel);
    });

    socket.on(CTS_MIXER_MONITOR_STOP, (payload: { mixerId: string; channel: number }) => {
      if (!canOperate || !payload?.mixerId) return;
      this.mixerService.stopChannelMonitor(payload.mixerId, payload.channel);
    });

    socket.on(CTS_MIXER_WIDGET_PRESENT, (payload: { mixerId: string; present: boolean }) => {
      if (!canOperate || !payload?.mixerId) return;
      const current = presence.get(payload.mixerId) ?? 0;
      if (payload.present) {
        presence.set(payload.mixerId, current + 1);
        this.mixerService.setWidgetPresence(payload.mixerId, true);
      } else if (current > 0) {
        presence.set(payload.mixerId, current - 1);
        this.mixerService.setWidgetPresence(payload.mixerId, false);
      }
    });

    socket.on("disconnect", () => {
      // Decrement every presence count this socket still held.
      for (const [mixerId, count] of presence) {
        for (let i = 0; i < count; i++) this.mixerService.setWidgetPresence(mixerId, false);
      }
      presence.clear();
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    const states = this.mixerService.getAllMixerStates();
    auth.socket.emit(STC_MIXER_STATE, states);
  }
}
