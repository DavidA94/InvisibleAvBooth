/**
 * BehringerXAirDriver — OSC-over-UDP driver for the Behringer X Air family.
 *
 * WHY @mxfriend/osc (via oscCodec): TypeScript-native, maintained, and part of
 * an ecosystem built specifically for Behringer/Midas OSC. It separates the OSC
 * codec from transport, so we own the UDP socket + /xremote and /meters
 * subscription lifecycle — exactly the control a fire-and-forget device needs.
 * VERSION RISK: only 3.0.0-alpha.2 is published (pinned exactly). FALLBACK:
 * `osc` (osc.js) — mature but low-activity and not TS-native. The swap point is
 * confined to oscCodec.ts; this driver uses the OscTransport abstraction and the
 * small OscMessage shape, never the library's types.
 *
 * OSC address provenance is documented in requirements.md "Provenance of
 * Model-Specific Values". KEY GOTCHA: mute is INVERTED — interface muted=true
 * maps to /ch/NN/mix/on = 0 (0 = muted, 1 = unmuted/signal-on).
 *
 * Fire-and-forget over UDP: after each set we perform read-back reconciliation
 * with bounded retry (Req 2.7) and emit the MIXER-REPORTED value as authoritative
 * (Req 11). Each of fader/mute/gain is a SEPARATE OSC address, written and
 * reconciled independently.
 */

import type { MixerCapabilities, MixerChannelState, MixerChannelLevel, MixerFeature, MixerPresetPayload } from "@invisible-av-booth/shared";
import {
  faderFloatToDb,
  XREMOTE_RENEW_MS,
  METERS_RENEW_MS,
  METERS_BANK_CHANNEL_PREFADER,
  READBACK_TIMEOUT_MS,
  READBACK_MAX_RETRIES,
} from "@invisible-av-booth/shared";
import type { MixerControlInterface, MixerDriverConfig, ChannelMonitorSink, OscTransport } from "./MixerControlInterface.js";
import { UdpOscTransport } from "./UdpOscTransport.js";
import { decodeMeterBlob, clampLevelDb } from "./osc/meterDecode.js";
import { logger } from "../logger.js";

// ── Model constants (X Air) ──────────────────────────────────────────────────

const X_AIR_GAIN_RANGE = { minDb: -12, maxDb: 60 } as const;

// ── Address builders ─────────────────────────────────────────────────────────

const pad2 = (channel: number): string => String(channel).padStart(2, "0");
const pad3 = (index: number): string => String(index).padStart(3, "0");

const chFader = (channel: number): string => `/ch/${pad2(channel)}/mix/fader`;
const chOn = (channel: number): string => `/ch/${pad2(channel)}/mix/on`; // 1 = unmuted (INVERTED)
const chName = (channel: number): string => `/ch/${pad2(channel)}/config/name`;
const headampGain = (channel: number): string => `/headamp/${pad3(channel - 1)}/gain`; // headamp index is 0-based

const metersSubscribe = (bank: number): { address: string; args: [number] } => ({ address: "/meters", args: [bank] });

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// ── Driver ───────────────────────────────────────────────────────────────────

export class BehringerXAirDriver implements MixerControlInterface {
  private readonly transport: OscTransport;
  private readonly channelCount: number;
  private readonly features: MixerFeature[];
  private connected = false;
  private metering = false;

  private xremoteTimer: ReturnType<typeof setInterval> | null = null;
  private metersTimer: ReturnType<typeof setInterval> | null = null;

  private unsubscribeTransport: (() => void) | null = null;

  private readonly channels = new Map<number, MixerChannelState>();

  private readonly meterListeners = new Set<(levels: MixerChannelLevel[]) => void>();
  private readonly stateListeners = new Set<(state: MixerChannelState) => void>();
  private readonly livenessListeners = new Set<() => void>();

  // Pending read-back waiters keyed by OSC address → resolver(value).
  private readonly pendingReadbacks = new Map<string, (values: Array<number | string | Uint8Array>) => void>();

  constructor(
    private readonly config: MixerDriverConfig,
    private readonly capture: ChannelMonitorSink,
  ) {
    this.channelCount = config.channelCount;
    this.features = [...config.features];
    this.transport = config.transport ?? new UdpOscTransport(config.host, config.port, config.mixerId);

    for (let channel = 1; channel <= this.channelCount; channel++) {
      this.channels.set(channel, {
        channel,
        name: `Ch ${channel}`,
        fader: 0,
        faderDb: -Infinity,
        muted: false,
        gainDb: X_AIR_GAIN_RANGE.minDb,
        unreconciled: false,
      });
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  async connect(): Promise<boolean> {
    if (this.connected) return true;
    const ok = await this.transport.open();
    if (!ok) return false;

    this.unsubscribeTransport = this.transport.onMessage((address, values) => this.handleInbound(address, values));

    this.connected = true;
    // /xremote renewal is decoupled from widget presence (Req 12.4) — renew
    // whenever connected so external changes are never missed.
    this.sendXremote();
    this.xremoteTimer = setInterval(() => this.sendXremote(), XREMOTE_RENEW_MS);

    // Prime state with an initial read-back of every channel so getAllChannelStates
    // reflects the console shortly after connect.
    void this.refreshAllChannels();
    logger.info("Mixer driver connected", { context: { mixerId: this.config.mixerId, host: this.config.host, port: this.config.port } });
    return true;
  }

  disconnect(): void {
    if (this.xremoteTimer) clearInterval(this.xremoteTimer);
    if (this.metersTimer) clearInterval(this.metersTimer);
    this.xremoteTimer = null;
    this.metersTimer = null;
    this.metering = false;
    this.unsubscribeTransport?.();
    this.unsubscribeTransport = null;
    this.transport.close();
    this.connected = false;
    this.pendingReadbacks.clear();
  }

  isConnected(): boolean {
    return this.connected;
  }

  getCapabilities(): MixerCapabilities {
    return { features: [...this.features], gainRange: { ...X_AIR_GAIN_RANGE } };
  }

  // ── Subscriptions ────────────────────────────────────────────────────────────

  private sendXremote(): void {
    this.transport.send("/xremote");
    // The renewal round-trip itself is a liveness signal on a quiet board — the
    // console echoes subscribed parameters, but even the act of renewing keeps
    // us alive. We also treat any inbound message as liveness (handleInbound).
  }

  setMeteringEnabled(enabled: boolean): void {
    if (enabled === this.metering) return;
    this.metering = enabled;
    if (enabled) {
      this.subscribeMeters();
      this.metersTimer = setInterval(() => this.subscribeMeters(), METERS_RENEW_MS);
    } else {
      if (this.metersTimer) clearInterval(this.metersTimer);
      this.metersTimer = null;
    }
  }

  private subscribeMeters(): void {
    // Bank 1, indices 0–15 = per-channel PRE-FADER input (always-visible meter).
    const { address, args } = metersSubscribe(METERS_BANK_CHANNEL_PREFADER);
    this.transport.send(address, "i", args);
  }

  // ── Commands (with capability enforcement + read-back reconciliation) ────────

  async setFader(channel: number, level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, level));
    this.transport.send(chFader(channel), "f", [clamped]);
    await this.reconcile(chFader(channel), channel, (values) => {
      const value = typeof values[0] === "number" ? values[0] : clamped;
      this.applyFader(channel, value);
    });
  }

  async setMute(channel: number, muted: boolean): Promise<void> {
    // INVERTED: muted=true → mix/on 0.
    const on = muted ? 0 : 1;
    this.transport.send(chOn(channel), "i", [on]);
    await this.reconcile(chOn(channel), channel, (values) => {
      const value = typeof values[0] === "number" ? values[0] : on;
      this.applyMute(channel, value === 0);
    });
  }

  async setGain(channel: number, gainDb: number): Promise<void> {
    // Server-side capability enforcement (Req 1.7): ignore gain when the device
    // does not declare gain-control, as defense-in-depth independent of the UI.
    if (!this.features.includes("gain-control")) {
      logger.warn("Ignoring setGain — device lacks gain-control capability", { context: { mixerId: this.config.mixerId, channel } });
      return;
    }
    const clamped = Math.max(X_AIR_GAIN_RANGE.minDb, Math.min(X_AIR_GAIN_RANGE.maxDb, gainDb));
    this.transport.send(headampGain(channel), "f", [clamped]);
    await this.reconcile(headampGain(channel), channel, (values) => {
      const value = typeof values[0] === "number" ? values[0] : clamped;
      this.applyGain(channel, value);
    });
  }

  /**
   * Read-back reconciliation with bounded retry (Req 2.7). After a set, query
   * the address; if no reply arrives within READBACK_TIMEOUT_MS, re-query up to
   * READBACK_MAX_RETRIES. The apply callback runs with the MIXER-reported value
   * (authoritative). On exhaustion we WARN-log and leave the channel marked
   * unreconciled (the service/UI surfaces this — Req 15.8).
   */
  private async reconcile(address: string, channel: number, apply: (values: Array<number | string | Uint8Array>) => void): Promise<void> {
    for (let attempt = 0; attempt <= READBACK_MAX_RETRIES; attempt++) {
      const reply = await this.query(address);
      if (reply) {
        apply(reply);
        this.emitLiveness();
        return;
      }
    }
    logger.warn("Mixer read-back exhausted", { context: { mixerId: this.config.mixerId, address } });
    this.markUnreconciled(channel);
  }

  /** Mark a channel unreconciled (read-back exhausted, Req 15.8) and emit state. */
  private markUnreconciled(channel: number): void {
    const state = this.channels.get(channel);
    if (!state || state.unreconciled) return;
    state.unreconciled = true;
    this.emitState(state);
  }

  /** Send a query for an address and await one reply within the timeout. */
  private query(address: string): Promise<Array<number | string | Uint8Array> | null> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        if (this.pendingReadbacks.get(address) === resolver) this.pendingReadbacks.delete(address);
        resolve(null);
      }, READBACK_TIMEOUT_MS);

      const resolver = (values: Array<number | string | Uint8Array>): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(values);
      };
      this.pendingReadbacks.set(address, resolver);
      // Querying an address (sending it with no args) asks the console to reply
      // with its current value.
      this.transport.send(address);
    });
  }

  // ── Inbound handling ─────────────────────────────────────────────────────────

  private handleInbound(address: string, values: Array<number | string | Uint8Array>): void {
    // Any inbound message is evidence of a live round-trip (Req 12.2).
    this.emitLiveness();

    // Resolve a pending read-back for this address, if any.
    const pending = this.pendingReadbacks.get(address);
    if (pending) {
      this.pendingReadbacks.delete(address);
      pending(values);
      return;
    }

    // Meter blob (address "/meters/1" or "/meters" depending on firmware echo).
    if (address.startsWith("/meters")) {
      this.handleMeterBlob(values);
      return;
    }

    // Unsolicited external change (physical console / Behringer app) via /xremote.
    this.handleExternalChange(address, values);
  }

  private handleMeterBlob(values: Array<number | string | Uint8Array>): void {
    const blob = values.find((value) => value instanceof Uint8Array) as Uint8Array | undefined;
    if (!blob) return;
    const decoded = decodeMeterBlob(blob);
    if (decoded.length === 0) return;

    const levels: MixerChannelLevel[] = [];
    for (let channel = 1; channel <= this.channelCount; channel++) {
      const index = channel - 1; // indices 0–15 are per-channel pre-fader
      const db = decoded[index];
      if (db === undefined) continue;
      levels.push({ channel, levelDb: clampLevelDb(db) });
    }
    if (levels.length > 0) {
      for (const listener of this.meterListeners) listener(levels);
    }
  }

  private handleExternalChange(address: string, values: Array<number | string | Uint8Array>): void {
    const faderMatch = /^\/ch\/(\d+)\/mix\/fader$/.exec(address);
    if (faderMatch && typeof values[0] === "number") {
      this.applyFader(Number(faderMatch[1]), values[0]);
      return;
    }
    const onMatch = /^\/ch\/(\d+)\/mix\/on$/.exec(address);
    if (onMatch && typeof values[0] === "number") {
      this.applyMute(Number(onMatch[1]), values[0] === 0);
      return;
    }
    const nameMatch = /^\/ch\/(\d+)\/config\/name$/.exec(address);
    if (nameMatch && typeof values[0] === "string") {
      this.applyName(Number(nameMatch[1]), values[0]);
      return;
    }
    const gainMatch = /^\/headamp\/(\d+)\/gain$/.exec(address);
    if (gainMatch && typeof values[0] === "number") {
      this.applyGain(Number(gainMatch[1]) + 1, values[0]); // headamp index is 0-based
      return;
    }
  }

  // ── State mutation + emission ─────────────────────────────────────────────────

  private applyFader(channel: number, float: number): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.fader = float;
    state.faderDb = faderFloatToDb(float);
    state.unreconciled = false; // a confirmed value clears the unreconciled flag (Req 15.8)
    this.emitState(state);
  }

  private applyMute(channel: number, muted: boolean): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.muted = muted;
    state.unreconciled = false;
    this.emitState(state);
  }

  private applyGain(channel: number, gainDb: number): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.gainDb = gainDb;
    state.unreconciled = false;
    this.emitState(state);
  }

  private applyName(channel: number, name: string): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.name = name;
    this.emitState(state);
  }

  private emitState(state: MixerChannelState): void {
    const snapshot: MixerChannelState = { ...state };
    for (const listener of this.stateListeners) listener(snapshot);
  }

  private emitLiveness(): void {
    for (const listener of this.livenessListeners) listener();
  }

  // ── Reads ──────────────────────────────────────────────────────────────────

  getChannelState(channel: number): MixerChannelState | null {
    const state = this.channels.get(channel);
    return state ? { ...state } : null;
  }

  getAllChannelStates(): MixerChannelState[] {
    return Array.from(this.channels.values()).map((state) => ({ ...state }));
  }

  private async refreshAllChannels(): Promise<void> {
    for (let channel = 1; channel <= this.channelCount; channel++) {
      // Fire queries for each field; replies resolve via handleInbound and
      // update state. We do not await each — this is a best-effort prime.
      this.transport.send(chFader(channel));
      this.transport.send(chOn(channel));
      this.transport.send(chName(channel));
      if (this.features.includes("gain-control")) this.transport.send(headampGain(channel));
      // Small stagger to avoid flooding the console's UDP buffer.
      await sleep(2);
    }
  }

  // ── Presets ──────────────────────────────────────────────────────────────────

  /**
   * Capture the current board into an address→value map (Req 10.8). Uses the
   * same bounded-retry read-back as commands. If any channel's value cannot be
   * confirmed, FAIL with a descriptive error naming the channel(s) rather than
   * saving a partial/stale snapshot — a wrong stored value would later be applied
   * as a live audio fault.
   */
  async capturePreset(): Promise<MixerPresetPayload> {
    const payload: MixerPresetPayload = {};
    const unconfirmed: number[] = [];

    for (let channel = 1; channel <= this.channelCount; channel++) {
      const faderValues = await this.queryWithRetry(chFader(channel));
      const onValues = await this.queryWithRetry(chOn(channel));
      const gainValues = this.features.includes("gain-control") ? await this.queryWithRetry(headampGain(channel)) : [];

      const faderOk = faderValues && typeof faderValues[0] === "number";
      const onOk = onValues && typeof onValues[0] === "number";
      const gainOk = !this.features.includes("gain-control") || (gainValues && typeof gainValues[0] === "number");

      if (!faderOk || !onOk || !gainOk) {
        unconfirmed.push(channel);
        continue;
      }

      payload[chFader(channel)] = faderValues[0] as number;
      payload[chOn(channel)] = onValues[0] as number;
      if (this.features.includes("gain-control") && gainValues && typeof gainValues[0] === "number") {
        payload[headampGain(channel)] = gainValues[0];
      }
    }

    if (unconfirmed.length > 0) {
      throw new Error(`Preset capture failed — mixer did not confirm channel(s): ${unconfirmed.join(", ")}. Ensure the mixer is reachable and retry.`);
    }
    return payload;
  }

  /** Apply a preset payload — write each address. Entries beyond channelCount are harmless (Req 3.2). */
  async activatePreset(payload: MixerPresetPayload): Promise<void> {
    for (const [address, value] of Object.entries(payload)) {
      if (typeof value === "number") {
        // Faders/gain are floats; mix/on is an int. Infer from the address.
        const type = /\/mix\/on$/.test(address) ? "i" : "f";
        this.transport.send(address, type, [value]);
      } else {
        this.transport.send(address, "s", [value]);
      }
    }
    // Reconcile all written channels so clients reflect the mixer-reported result.
    await this.refreshAllChannels();
  }

  private async queryWithRetry(address: string): Promise<Array<number | string | Uint8Array> | null> {
    for (let attempt = 0; attempt <= READBACK_MAX_RETRIES; attempt++) {
      const reply = await this.query(address);
      if (reply) {
        this.emitLiveness();
        return reply;
      }
    }
    return null;
  }

  // ── Observation intents ───────────────────────────────────────────────────────

  onMeterUpdate(listener: (levels: MixerChannelLevel[]) => void): () => void {
    this.meterListeners.add(listener);
    return () => this.meterListeners.delete(listener);
  }

  onStateChange(listener: (state: MixerChannelState) => void): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onLiveness(listener: () => void): () => void {
    this.livenessListeners.add(listener);
    return () => this.livenessListeners.delete(listener);
  }

  // ── Isolated audio monitoring (delegated to the capture layer) ─────────────────

  startChannelMonitor(channel: number): void {
    if (!this.features.includes("channel-audio-capture")) {
      logger.warn("Ignoring startChannelMonitor — device lacks channel-audio-capture", { context: { mixerId: this.config.mixerId, channel } });
      return;
    }
    this.capture.startChannelMonitor(this.config.mixerId, channel);
  }

  stopChannelMonitor(channel: number): void {
    this.capture.stopChannelMonitor(this.config.mixerId, channel);
  }
}
