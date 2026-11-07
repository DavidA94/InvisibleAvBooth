import type { Server } from "socket.io";
import type { SocketModule, AuthenticatedSocket } from "../socketModule.js";
import type { MixerService } from "../../../mixer/MixerService.js";
import { eventBus } from "../../../eventBus/eventBus.js";
import { BUS_MIXER_STATE_CHANGED, BUS_MIXER_LEVELS } from "../../../eventBus/types.js";
import {
  STC_MIXER_STATE,
  STC_MIXER_STATE_UPDATE,
  STC_MIXER_LEVELS,
  CTS_MIXER_SET,
  CTS_MIXER_PRESET_ACTIVATE,
  CTS_MIXER_WIDGET_PRESENT,
  METERS_BROADCAST_INTERVAL_MS,
} from "@invisible-av-booth/shared";
import type { MixerCommand, MixerChannelLevel } from "@invisible-av-booth/shared";
import { logger } from "../../../logger.js";

/**
 * MixerSocketModule — bridges the mixer domain to Socket.io (SocketModule pattern,
 * steering §7). Broadcasts bus state/levels and handles per-socket commands
 * (AvVolunteer+; gain is AvPowerUser+).
 */
export class MixerSocketModule implements SocketModule {
  constructor(private readonly mixerService: MixerService) {}

  // ── Meter broadcast throttle (steering §5 "as soon as possible", bounded) ────
  //
  // The X Air pushes meter frames at ~25 fps and the driver emits one
  // BUS_MIXER_LEVELS per frame. Forwarding each straight to `io.emit` floods
  // every connected tablet with frames it cannot visually distinguish. Meters
  // are "latest value wins", so we COALESCE per mixer (keep only the newest
  // frame) and flush at most every METERS_BROADCAST_INTERVAL_MS.
  //
  // Leading-edge + trailing-flush: the first frame after an idle gap goes out
  // immediately (meters feel instant when metering starts), then any frames
  // arriving within the window are collapsed and the latest is flushed when the
  // window closes. The timer is self-stopping when nothing is pending, so an
  // idle board leaves no running interval.
  private io: Server | null = null;
  /** Latest un-flushed level frame per mixerId (older frames are discarded). */
  private readonly pendingLevels = new Map<string, MixerChannelLevel[]>();
  /** mixerId → timestamp (ms) of the last emit, for leading-edge decisions. */
  private readonly lastEmitAt = new Map<string, number>();
  private flushTimer: ReturnType<typeof setInterval> | null = null;

  register(io: Server): void {
    this.io = io;
    eventBus.subscribe(BUS_MIXER_STATE_CHANGED, ({ state }) => {
      io.emit(STC_MIXER_STATE_UPDATE, state);
    });
    eventBus.subscribe(BUS_MIXER_LEVELS, ({ mixerId, levels }) => {
      this.enqueueLevels(mixerId, levels);
    });
  }

  /**
   * Accept a level frame. If the mixer's broadcast window is open (idle long
   * enough), emit immediately (leading edge); otherwise stash the latest frame
   * and ensure the trailing flush timer is running.
   */
  private enqueueLevels(mixerId: string, levels: MixerChannelLevel[]): void {
    if (!this.io) return;
    const now = Date.now();
    const last = this.lastEmitAt.get(mixerId) ?? 0;
    if (now - last >= METERS_BROADCAST_INTERVAL_MS) {
      this.emitLevels(mixerId, levels, now);
      return;
    }
    // Within the window: keep only the newest frame and arm the trailing flush.
    this.pendingLevels.set(mixerId, levels);
    this.ensureFlushTimer();
  }

  private emitLevels(mixerId: string, levels: MixerChannelLevel[], now: number): void {
    this.lastEmitAt.set(mixerId, now);
    this.io?.emit(STC_MIXER_LEVELS, { mixerId, levels });
  }

  private ensureFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flushPending(), METERS_BROADCAST_INTERVAL_MS);
  }

  /** Emit any pending frames whose window has closed; stop the timer when idle. */
  private flushPending(): void {
    const now = Date.now();
    for (const [mixerId, levels] of this.pendingLevels) {
      const last = this.lastEmitAt.get(mixerId) ?? 0;
      if (now - last >= METERS_BROADCAST_INTERVAL_MS) {
        this.emitLevels(mixerId, levels, now);
        this.pendingLevels.delete(mixerId);
      }
    }
    // Self-stop: no outstanding frames → no reason to keep ticking.
    if (this.pendingLevels.size === 0 && this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /** Stop the flush timer and drop buffered frames (teardown / test cleanup). */
  dispose(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.pendingLevels.clear();
    this.lastEmitAt.clear();
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;
    // Live operation is AvVolunteer and above (Req 9.5). Below that, ignore commands.
    const canOperate = jwtPayload.role === "AvVolunteer" || jwtPayload.role === "AvPowerUser" || jwtPayload.role === "ADMIN";
    // Gain is an AvPowerUser+ feature (spec Appendix A): the frontend hides the
    // Adjust Gain control for AvVolunteer; this is the server-side enforcement.
    const canAdjustGain = jwtPayload.role === "AvPowerUser" || jwtPayload.role === "ADMIN";

    // Per-socket, per-mixer widget-presence counts, so a crashed tablet cannot
    // leak a metering subscription: the disconnect handler decrements everything
    // this socket held (a Socket.io event has no implicit teardown).
    const presence = new Map<string, number>();

    socket.on(CTS_MIXER_SET, async (command: MixerCommand) => {
      if (!canOperate || !command || typeof command.mixerId !== "string") return;
      // Reject gain from non-power-users (defense-in-depth for the AvPowerUser+
      // gain feature); still honor any fader/mute in the same command.
      let effective = command;
      if (command.gainDb !== undefined && !canAdjustGain) {
        logger.warn("Rejecting gain from non-power-user", { userId: jwtPayload.sub, context: { mixerId: command.mixerId, channel: command.channel } });
        const { gainDb: _gainDb, ...rest } = command;
        effective = rest;
        if (effective.fader === undefined && effective.muted === undefined) return; // nothing left to apply
      }
      logger.debug("Mixer set", { userId: jwtPayload.sub, context: { mixerId: effective.mixerId, channel: effective.channel } });
      await this.mixerService.setChannel(effective.mixerId, effective);
    });

    socket.on(CTS_MIXER_PRESET_ACTIVATE, async (payload: { mixerId: string; presetId: string }) => {
      if (!canOperate || !payload?.mixerId || !payload?.presetId) return;
      logger.info("Mixer preset activate", { userId: jwtPayload.sub, context: { mixerId: payload.mixerId, presetId: payload.presetId } });
      await this.mixerService.activatePreset(payload.mixerId, payload.presetId);
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
