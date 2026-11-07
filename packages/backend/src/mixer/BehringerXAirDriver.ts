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
  gainDbToFloat,
  gainFloatToDb,
  XREMOTE_RENEW_MS,
  METERS_RENEW_MS,
  METERS_BANK_CHANNEL_PREFADER,
  METERS_RATE_FACTOR,
  READBACK_TIMEOUT_MS,
  READBACK_MAX_RETRIES,
  COMMAND_DEBOUNCE_MS,
  SELF_ECHO_GUARD_MS,
} from "@invisible-av-booth/shared";
import type { MixerControlInterface, MixerDriverConfig, OscTransport } from "./MixerControlInterface.js";
import { UdpOscTransport } from "./UdpOscTransport.js";
import { decodeMeterBlob, clampLevelDb } from "./osc/meterDecode.js";
import { logger } from "../logger.js";

// ── Model constants (X Air) ──────────────────────────────────────────────────

const X_AIR_GAIN_RANGE = { minDb: -12, maxDb: 60 } as const;

// ── Address builders ─────────────────────────────────────────────────────────

const pad2 = (channel: number): string => String(channel).padStart(2, "0");

const chFader = (channel: number): string => `/ch/${pad2(channel)}/mix/fader`;
const chOn = (channel: number): string => `/ch/${pad2(channel)}/mix/on`; // 1 = unmuted (INVERTED)
const chName = (channel: number): string => `/ch/${pad2(channel)}/config/name`;
const chColor = (channel: number): string => `/ch/${pad2(channel)}/config/color`; // int 0–15 scribble color
// X Air headamp (preamp) gain address. IMPORTANT: X Air is NOT X32 here — X32
// uses a 0-based 3-digit index (/headamp/000), but X Air uses a 1-based 2-digit
// index (/headamp/01 = channel 1), verified against the XR18 (which silently
// ignores /headamp/000 — no query/set reply) and the xair-api reference
// (`/headamp/{index+1 zfill 2}`). The value on the wire is a normalized 0..1
// float (linear over -12..+60 dB), not raw dB.
const headampGain = (channel: number): string => `/headamp/${pad2(channel)}/gain`;

// X Air /meters subscription: the command takes a STRING (the meter bank
// ADDRESS, e.g. "/meters/1") and an INT rate factor — NOT an int bank number.
// Sending the wrong shape means the console never establishes a streaming
// subscription (meter frames then only appear coincidentally, tied to other
// traffic). See METERS_RATE_FACTOR for the rate meaning.
const metersSubscribe = (bank: number, rateFactor: number): { address: string; types: string; args: [string, number] } => ({
  address: "/meters",
  types: "si",
  args: [`/meters/${bank}`, rateFactor],
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A coalesced pending write for one OSC address. `send` pushes the raw value to
 * the wire (fire-and-forget, so the console tracks live slider motion); `apply`
 * reconciles the mixer-reported read-back into channel state. Only the LATEST
 * pending write per address is kept — a burst of slider updates collapses to one
 * settled confirmation (see pendingWrites).
 */
interface PendingWrite {
  channel: number;
  /** Write the latest desired value to the wire (fire-and-forget). */
  send: () => void;
  /** Reconcile the mixer-reported read-back values into channel state. */
  apply: (values: Array<number | string | Uint8Array>) => void;
}

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

  // Per-address reconcile epoch. A fader drag issues many sets to the SAME
  // address in quick succession; each starts its own reconcile. Because the X
  // Air's reply carries no correlation id and UDP replies can arrive late or out
  // of order, an older query's reply could otherwise be applied as if it answered
  // the newest command — the UI then visibly jumps to a stale value and snaps
  // back when the correct reply lands. We stamp each reconcile with the current
  // epoch for its address and bump it on every new set; a reply only applies if
  // its epoch is still current, so superseded (stale) replies are dropped.
  private readonly reconcileEpoch = new Map<string, number>();

  // Per-address coalescing writer. When the UI drags a slider it sends many sets
  // for the SAME address in a burst. We want the mixer to track the live motion
  // (so we still WRITE each value, fire-and-forget), but we only want ONE
  // read-back confirmation to travel back to the clients once the value SETTLES
  // — not a replay of every intermediate value (the live "backed-up messages"
  // symptom). So per address we keep only the LATEST desired write + its apply
  // callback and run a single reconcile worker: it writes the newest value,
  // reconciles once, and if newer sets arrived meanwhile it repeats with only
  // the newest — collapsing a burst of N sets into a single settled confirmation.
  private readonly pendingWrites = new Map<string, PendingWrite>();
  /** Per-address debounce timer — only the quiet (final) value of a burst reconciles. */
  private readonly writeDebounce = new Map<string, ReturnType<typeof setTimeout>>();
  /** Per-address callers awaiting the next debounced reconcile (burst → one settle). */
  private readonly writeWaiters = new Map<string, Array<() => void>>();
  // Per-address "we are driving this" expiry (epoch ms). While we are writing a
  // control, the X Air echoes OUR OWN writes back over /xremote — those are not
  // external changes and must NOT be broadcast as intermediate values (that is
  // the live "slider replays its own drag" bug). The authoritative confirmation
  // is the single debounced read-back; /xremote echoes for a self-driven address
  // are dropped until this expiry, after which genuine external moves flow again.
  private readonly selfWriteUntil = new Map<string, number>();

  constructor(private readonly config: MixerDriverConfig) {
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
    // Cancel any pending debounced reconciles and release awaiting callers so a
    // disconnect mid-drag cannot leak a timer or leave a setX() promise hanging.
    for (const timer of this.writeDebounce.values()) clearTimeout(timer);
    this.writeDebounce.clear();
    this.pendingWrites.clear();
    this.selfWriteUntil.clear();
    for (const waiters of this.writeWaiters.values()) {
      for (const resolve of waiters) resolve();
    }
    this.writeWaiters.clear();
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
    // Guaranteed periodic liveness (Req 12.2): the X Air does NOT reliably reply
    // to /xremote on a dead-quiet board (nothing to echo), so on each renewal we
    // also send /xinfo, which the console ALWAYS answers. Its reply flows through
    // handleInbound → emitLiveness, keeping an idle-but-healthy board green and
    // only turning "Controls" red when round-trips genuinely stop. This is the
    // periodic confirmed round-trip the freshness window is sized around
    // (CONTROLS_FRESHNESS_MS ≥ 2× XREMOTE_RENEW_MS + margin).
    this.transport.send("/xinfo");
  }

  setMeteringEnabled(enabled: boolean): void {
    if (enabled === this.metering) return;
    this.metering = enabled;
    logger.debug("Mixer metering toggled", { context: { mixerId: this.config.mixerId, enabled } });
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
    const { address, types, args } = metersSubscribe(METERS_BANK_CHANNEL_PREFADER, METERS_RATE_FACTOR);
    this.transport.send(address, types, args);
  }

  // ── Commands (with capability enforcement + read-back reconciliation) ────────

  async setFader(channel: number, level: number): Promise<void> {
    const clamped = Math.max(0, Math.min(1, level));
    const address = chFader(channel);
    await this.coalesceSet(address, {
      channel,
      send: () => this.transport.send(address, "f", [clamped]),
      apply: (values) => {
        const value = typeof values[0] === "number" ? values[0] : clamped;
        this.applyFader(channel, value);
      },
    });
  }

  async setMute(channel: number, muted: boolean): Promise<void> {
    // INVERTED: muted=true → mix/on 0.
    const on = muted ? 0 : 1;
    const address = chOn(channel);
    await this.coalesceSet(address, {
      channel,
      send: () => this.transport.send(address, "i", [on]),
      apply: (values) => {
        const value = typeof values[0] === "number" ? values[0] : on;
        this.applyMute(channel, value === 0);
      },
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
    // The X Air expects a NORMALIZED 0.0–1.0 float on the wire (not raw dB).
    const wire = gainDbToFloat(clamped, X_AIR_GAIN_RANGE.minDb, X_AIR_GAIN_RANGE.maxDb);
    const address = headampGain(channel);
    await this.coalesceSet(address, {
      channel,
      send: () => this.transport.send(address, "f", [wire]),
      apply: (values) => {
        // The reply is the mixer's normalized value → convert back to dB (authoritative).
        const replyFloat = typeof values[0] === "number" ? values[0] : wire;
        this.applyGain(channel, gainFloatToDb(replyFloat, X_AIR_GAIN_RANGE.minDb, X_AIR_GAIN_RANGE.maxDb));
      },
    });
  }

  /**
   * Coalesce rapid writes to one OSC address into a SINGLE settled read-back,
   * using a debounce so the collapse is deterministic regardless of timing.
   *
   * The problem the previous (race-based) version had: it only coalesced writes
   * that happened to be queued when a reconcile finished. When each read-back
   * took longer than the gap between sets, a drag's intermediate values leaked
   * through one at a time and were REPLAYED to the clients seconds later — the
   * slider visibly re-ran its own drag history (observed live).
   *
   * Debounced model: every set WRITES its value to the wire immediately (cheap,
   * fire-and-forget, so the physical console still tracks the live motion) and
   * records itself as the latest pending write. The READ-BACK (the thing that
   * produces a downstream confirmation) is deferred until the burst goes quiet
   * for COMMAND_DEBOUNCE_MS. Each new set resets that timer. So a drag of N sets
   * results in N cheap writes but exactly ONE reconcile — of the value the slider
   * SETTLED on — and therefore one confirmation to the clients. The public `setX`
   * promise resolves when that single reconcile completes.
   *
   * Self-echo guard: the X Air echoes OUR OWN writes back over /xremote, which
   * would otherwise be broadcast as "external changes" (the intermediate replay
   * the user still saw after debouncing the read-back). coalesceSet marks the
   * address as self-driven so those echoes are dropped in handleExternalChange
   * until shortly after the settled reconcile.
   */
  private coalesceSet(address: string, write: PendingWrite): Promise<void> {
    // Mark self-driven so /xremote echoes of our own writes are not re-broadcast.
    this.markSelfWrite(address);
    // Write the latest value now so the console tracks the live slider motion.
    write.send();
    this.pendingWrites.set(address, write);

    // Caller resolves when the debounced reconcile for this address next settles.
    const waiter = new Promise<void>((resolve) => {
      const list = this.writeWaiters.get(address) ?? [];
      list.push(resolve);
      this.writeWaiters.set(address, list);
    });

    // (Re)arm the debounce: only the final, quiet value triggers a reconcile.
    const existing = this.writeDebounce.get(address);
    if (existing) clearTimeout(existing);
    this.writeDebounce.set(
      address,
      setTimeout(() => {
        this.writeDebounce.delete(address);
        void this.runReconcile(address);
      }, COMMAND_DEBOUNCE_MS),
    );

    return waiter;
  }

  /** Extend the self-driven window for an address (drops its /xremote echoes). */
  private markSelfWrite(address: string): void {
    this.selfWriteUntil.set(address, Date.now() + COMMAND_DEBOUNCE_MS + SELF_ECHO_GUARD_MS);
  }

  /** True while we are driving this address — its /xremote echoes are our own. */
  private isSelfWriting(address: string): boolean {
    const until = this.selfWriteUntil.get(address);
    if (until === undefined) return false;
    if (Date.now() >= until) {
      this.selfWriteUntil.delete(address);
      return false;
    }
    return true;
  }

  /** Reconcile the latest pending write for an address once, then wake waiters. */
  private async runReconcile(address: string): Promise<void> {
    const pending = this.pendingWrites.get(address);
    this.pendingWrites.delete(address);
    try {
      // The value was already written in coalesceSet; here we only read it back
      // and reconcile (the mixer is authoritative, including its own rounding).
      const confirmed = pending ? await this.reconcile(address, pending.channel, pending.apply) : false;
      if (confirmed) {
        // Keep absorbing trailing /xremote echoes for a beat after the confirmed
        // read-back, then let genuine external changes through again.
        this.markSelfWrite(address);
      } else {
        // No confirmation (exhausted/superseded) — stop suppressing so a genuine
        // late external push can inform us instead of being silently dropped.
        this.selfWriteUntil.delete(address);
      }
    } finally {
      const waiters = this.writeWaiters.get(address);
      if (waiters) {
        this.writeWaiters.delete(address);
        for (const resolve of waiters) resolve();
      }
    }
  }

  /**
   * Read-back reconciliation with bounded retry (Req 2.7). After a set, query
   * the address; if no reply arrives within READBACK_TIMEOUT_MS, re-query up to
   * READBACK_MAX_RETRIES. The apply callback runs with the MIXER-reported value
   * (authoritative). On exhaustion we WARN-log and leave the channel marked
   * unreconciled (the service/UI surfaces this — Req 15.8).
   */
  private async reconcile(address: string, channel: number, apply: (values: Array<number | string | Uint8Array>) => void): Promise<boolean> {
    // Supersede any in-flight reconcile for this address: bump the epoch so a
    // late reply to the previous query is recognized as stale and dropped
    // (prevents the "jump to old value then snap back" artifact during a drag).
    const epoch = (this.reconcileEpoch.get(address) ?? 0) + 1;
    this.reconcileEpoch.set(address, epoch);

    for (let attempt = 0; attempt <= READBACK_MAX_RETRIES; attempt++) {
      const reply = await this.query(address);
      // A newer set for this address started while we were waiting — abandon
      // this reconcile entirely. The newest reconcile owns the channel's value;
      // applying our (older) reply would regress it.
      if (this.reconcileEpoch.get(address) !== epoch) return false;
      if (reply) {
        apply(reply);
        this.emitLiveness();
        return true; // confirmed by the mixer
      }
    }
    // Only the current epoch may mark the channel unreconciled — a superseded
    // reconcile must not stamp Unknown over a value the newer one is confirming.
    if (this.reconcileEpoch.get(address) !== epoch) return false;
    logger.warn("Mixer read-back exhausted — channel marked unreconciled (surfaces as Unknown)", {
      context: { mixerId: this.config.mixerId, address, channel, retries: READBACK_MAX_RETRIES, timeoutMs: READBACK_TIMEOUT_MS },
    });
    this.markUnreconciled(channel);
    return false; // no confirmation — do NOT keep suppressing external pushes
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
    // If a previous query for this address is still waiting, cancel it: resolve
    // it as null so its reconcile loop settles immediately instead of lingering
    // and potentially consuming THIS query's reply. The map holds one waiter per
    // address, so without this the old resolver would simply be dropped on the
    // floor and only time out later — delaying the stale path we are closing.
    const previous = this.pendingReadbacks.get(address);
    if (previous) {
      this.pendingReadbacks.delete(address);
      previous([]); // empty values → treated as "no usable reply" by callers
    }

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
        // An empty array is the cancellation signal from a superseding query —
        // surface it as a non-reply so the (now stale) reconcile does not apply it.
        resolve(values.length === 0 ? null : values);
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
    // Drop our OWN write-echoes: while we are driving an address the X Air echoes
    // every value we send back over /xremote. Broadcasting those as external
    // changes is exactly the "slider replays its own drag" artifact — the single
    // debounced read-back is the authoritative confirmation. Name/color are never
    // self-written here, so they are unaffected.
    if (this.isSelfWriting(address)) return;

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
    const colorMatch = /^\/ch\/(\d+)\/config\/color$/.exec(address);
    if (colorMatch && typeof values[0] === "number") {
      this.applyColor(Number(colorMatch[1]), values[0]);
      return;
    }
    const gainMatch = /^\/headamp\/(\d+)\/gain$/.exec(address);
    if (gainMatch && typeof values[0] === "number") {
      // Address index is 1-based on X Air (/headamp/01 = channel 1). Wire value
      // is normalized 0.0–1.0 → convert to dB.
      this.applyGain(Number(gainMatch[1]), gainFloatToDb(values[0], X_AIR_GAIN_RANGE.minDb, X_AIR_GAIN_RANGE.maxDb));
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

  private applyColor(channel: number, color: number): void {
    const state = this.channels.get(channel);
    if (!state) return;
    state.color = color;
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
      this.transport.send(chColor(channel));
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
}
