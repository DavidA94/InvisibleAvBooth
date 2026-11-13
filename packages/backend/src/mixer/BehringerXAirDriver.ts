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
  PRESET_WRITE_STAGGER_MS,
  PRESET_VERIFY_SETTLE_MS,
  PRESET_MAX_ROUNDS,
  PRESET_VERIFY_TOLERANCE,
  PRESET_QUERY_STAGGER_MS,
  PRESET_READ_TIMEOUT_MS,
  LEVEL_AXIS_MIN_DBFS,
} from "@invisible-av-booth/shared";
import type { MixerControlInterface, MixerDriverConfig, OscTransport } from "./MixerControlInterface.js";
import { UdpOscTransport } from "./UdpOscTransport.js";
import { PostFaderMeterPool } from "./PostFaderMeterPool.js";
import { decodeMeterBlob, clampLevelDb } from "./osc/meterDecode.js";
import { logger } from "../logger.js";

// ── Model constants (X Air) ──────────────────────────────────────────────────

const X_AIR_GAIN_RANGE = { minDb: -12, maxDb: 60 } as const;

// ── Address builders ─────────────────────────────────────────────────────────

const pad2 = (channel: number): string => String(channel).padStart(2, "0");

const chFader = (channel: number): string => `/ch/${pad2(channel)}/mix/fader`;
const chOn = (channel: number): string => `/ch/${pad2(channel)}/mix/on`; // 1 = unmuted (INVERTED)
// The channel MIX NODE. A no-arg query replies `,ifif <on> <fader> <lr> <pan>`;
// a multi-tag set (`,if <on> <fader>`) writes the leading fields in one message.
// Verified on XR18V2 fw 1.26. Used by preset apply only.
const chMix = (channel: number): string => `/ch/${pad2(channel)}/mix`;
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

/**
 * A preset payload re-grouped per channel for spike-safe write ordering and
 * scoped verification. Only the fields the preset actually stores (per the
 * audibility rule) are populated; absent fields are simply not written/verified.
 */
/** Board-reported values for a verified preset channel (only fields in the preset). */
interface PresetReported {
  on?: number;
  fader?: number;
  gain?: number;
}

interface PresetChannelEntry {
  channel: number;
  on?: number;
  onAddress?: string;
  fader?: number;
  faderAddress?: string;
  gain?: number;
  gainAddress?: string;
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

  // Per-address monotonic write sequence — the backend-authoritative stale-echo
  // guard (design: "backend tracks which write is newest"). Every coalesceSet
  // bumps writeSeq[address]; the reconcile that runs for a given set captures the
  // sequence it was issued under. When that set's read-back resolves, we only
  // BROADCAST (apply → emitState) if its captured sequence is STILL the latest
  // for the address. Concretely, if the UI sends 1 then 1.5 far enough apart that
  // both reach us, 1's read-back is discarded the moment 1.5's set bumps the
  // sequence — only 1.5's settled value is ever broadcast to clients. This is
  // what prevents the "slider slides, then re-slides seconds later" artifact
  // WITHOUT any frontend filtering (the frontend trusts whatever we send).
  private readonly writeSeq = new Map<string, number>();

  /** Tail of the paced-query chain (see pacedQuery). */
  private queryGate: Promise<void> = Promise.resolve();

  /** One registered client per unmuted channel for TRUE post-fader meters. */
  private readonly postFaderMeters: PostFaderMeterPool;
  /** Latest input (bank 1) level per channel, dBFS clamped. */
  private readonly lastInputDb = new Map<number, number>();
  /** Latest true post-fader level per measured (unmuted) channel, dBFS clamped. */
  private readonly lastPostFaderDb = new Map<number, number>();
  /**
   * Channels whose mute state the BOARD has reported (read-back, /xremote, preset
   * verify). Channel state defaults to "unmuted" before the first read, which would
   * otherwise open a post-fader client for all 16 channels at startup — and ≥4
   * clients slows every meter on the board (see PostFaderMeterPool).
   */
  private readonly muteKnown = new Set<number>();

  constructor(private readonly config: MixerDriverConfig) {
    this.channelCount = config.channelCount;
    this.features = [...config.features];
    this.transport = config.transport ?? new UdpOscTransport(config.host, config.port, config.mixerId);
    // Each post-fader channel needs its OWN registered client (see PostFaderMeterPool).
    const createTransport = config.transportFactory ?? ((): OscTransport => new UdpOscTransport(config.host, config.port, config.mixerId));
    this.postFaderMeters = new PostFaderMeterPool(
      createTransport,
      METERS_RATE_FACTOR,
      (channel, postFaderDb) => {
        // Ignore a straggler frame for a channel that was muted/released meanwhile.
        if (this.channels.get(channel)?.muted) return;
        this.lastPostFaderDb.set(channel, postFaderDb);
        this.emitLevels();
      },
      config.mixerId,
    );

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
    this.postFaderMeters.releaseAll();
    this.lastPostFaderDb.clear();
    this.lastInputDb.clear();
    this.muteKnown.clear();
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
    this.writeSeq.clear();
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
    // Per-channel post-fader clients must stay registered too (~10 s lapse).
    this.postFaderMeters.renewRegistration();
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
    this.reconcilePostFaderMeters();
  }

  private subscribeMeters(): void {
    // Bank 1, indices 0–15 = per-channel PRE-FADER input (always-visible meter).
    const { address, types, args } = metersSubscribe(METERS_BANK_CHANNEL_PREFADER, METERS_RATE_FACTOR);
    this.transport.send(address, types, args);
    // Per-channel post-fader subscriptions lapse on the same ~10 s window.
    this.postFaderMeters.renewMeters();
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
    // Bump the per-address write sequence: this set is now the newest intent for
    // the address. The reconcile scheduled below captures this value and only
    // broadcasts if it is still the latest when the read-back resolves (so a
    // superseded set's read-back is dropped — the stale-echo guard).
    this.writeSeq.set(address, (this.writeSeq.get(address) ?? 0) + 1);
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
    // Capture the sequence this reconcile answers to. If a newer set bumps
    // writeSeq[address] before our read-back resolves, we drop the broadcast.
    const seq = this.writeSeq.get(address) ?? 0;
    try {
      // The value was already written in coalesceSet; here we only read it back
      // and reconcile (the mixer is authoritative, including its own rounding).
      const confirmed = pending ? await this.reconcile(address, pending.channel, pending.apply, seq) : false;
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
   * (authoritative) — but ONLY if `seq` is still the latest write for this
   * address (the stale-echo guard: a superseded set's read-back is never
   * broadcast). On exhaustion we WARN-log and leave the channel unreconciled.
   *
   * `seq` is the per-address write sequence captured when this reconcile was
   * scheduled; `reconcileEpoch` additionally supersedes an older in-flight
   * reconcile's QUERY so a late reply cannot be consumed by the wrong attempt.
   */
  private async reconcile(address: string, channel: number, apply: (values: Array<number | string | Uint8Array>) => void, seq: number): Promise<boolean> {
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
        // Stale-echo guard: only broadcast if this set is still the newest write
        // for the address. If 1.5 superseded our 1 after the query was sent, we
        // drop 1's reply here — 1.5's own reconcile will broadcast the truth.
        if ((this.writeSeq.get(address) ?? 0) !== seq) return false;
        apply(reply);
        this.emitLiveness();
        return true; // confirmed by the mixer
      }
    }
    // Only the current epoch may mark the channel unreconciled — a superseded
    // reconcile must not stamp Unknown over a value the newer one is confirming.
    if (this.reconcileEpoch.get(address) !== epoch) return false;
    // Likewise, a superseded write must not raise Unknown — the newer write owns it.
    if ((this.writeSeq.get(address) ?? 0) !== seq) return false;
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
  private query(address: string, timeoutMs: number = READBACK_TIMEOUT_MS): Promise<Array<number | string | Uint8Array> | null> {
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
      }, timeoutMs);

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

    for (let channel = 1; channel <= this.channelCount; channel++) {
      const index = channel - 1; // indices 0–15 are per-channel pre-fader input
      const db = decoded[index];
      if (db === undefined) continue;
      this.lastInputDb.set(channel, clampLevelDb(db));
    }
    this.emitLevels();
  }

  /**
   * Emit one level frame: the latest INPUT (bank 1) per channel plus the latest
   * OUTGOING value. Outgoing is the board's TRUE post-fader meter for unmuted
   * channels (PostFaderMeterPool), the axis floor (silent) for muted channels,
   * and ABSENT for an unmuted channel whose first post-fader frame hasn't arrived
   * (~80 ms after unmute) — we show nothing rather than a guessed value.
   * Called on every input-bank frame and every post-fader frame, so neither
   * signal waits on the other; the socket module coalesces the broadcast.
   */
  private emitLevels(): void {
    const levels: MixerChannelLevel[] = [];
    for (const [channel, levelDb] of this.lastInputDb) {
      const state = this.channels.get(channel);
      const post = state?.muted ? LEVEL_AXIS_MIN_DBFS : this.lastPostFaderDb.get(channel);
      levels.push(post === undefined ? { channel, levelDb } : { channel, levelDb, postFaderDb: post });
    }
    if (levels.length > 0) {
      for (const listener of this.meterListeners) listener(levels);
    }
  }

  /**
   * Keep post-fader subscriptions on exactly the channels that need one: metering
   * on (a widget is showing this mixer) AND unmuted. Cheap to call on every state
   * change — the pool only opens/closes on actual set differences.
   */
  private reconcilePostFaderMeters(): void {
    const wanted = new Set<number>();
    if (this.metering && this.connected) {
      for (const state of this.channels.values()) if (this.muteKnown.has(state.channel) && !state.muted) wanted.add(state.channel);
    }
    for (const channel of Array.from(this.lastPostFaderDb.keys())) {
      if (!wanted.has(channel)) this.lastPostFaderDb.delete(channel); // never show a stale outgoing value
    }
    this.postFaderMeters.reconcile(wanted);
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
    this.muteKnown.add(channel);
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
    // Mute changes (ours, presets, or external /xremote) decide which channels
    // need a post-fader meter — every state change funnels through here.
    this.reconcilePostFaderMeters();
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
  //
  // AUDIBILITY-GATED PRESETS (design decision — audio-correctness first).
  //
  // A preset is a board snapshot, but we deliberately store/write/verify ONLY the
  // fields that affect what the congregation hears, decided per channel by its
  // snapshot state:
  //
  //   muted                     → only /mix/on            (mute)
  //   unmuted, fader at −∞ (0)  → /mix/on + /mix/fader     (mute + fader)
  //   unmuted, audible fader    → /mix/on + /mix/fader + /headamp/NN/gain (all three)
  //
  // WHY: a muted channel's fader/gain are inaudible, so restoring them is at best
  // pointless and at worst a latent surprise — someone unmutes later and gets a
  // level nobody considered when the preset was made. By NOT touching them, the
  // channel keeps whatever the operator currently has, and the preset only
  // governs audible reality. The SAME rule drives capture, write, and verify, so
  // the stored payload is self-describing: whatever keys it contains are exactly
  // what we write and what we verify. (gain is only ever included when the device
  // declares gain-control.)

  /** mix/on wire value: 1 = unmuted (on), 0 = muted. */
  private static readonly ON = 1;
  private static readonly OFF = 0;

  /**
   * Decide which addresses are AUDIBLE for a channel given its (on, faderFloat)
   * state — the single source of truth for capture, apply, and verify. Returns
   * the ordered address list that should be stored/written/verified.
   */
  private audibleAddresses(channel: number, on: number, faderFloat: number): string[] {
    const muted = on === BehringerXAirDriver.OFF;
    if (muted) return [chOn(channel)]; // inaudible → mute only
    const addresses = [chOn(channel), chFader(channel)];
    // fader at −∞ (float 0) → the channel is unmuted but silent, so gain is
    // inaudible; include it only when the fader is actually passing signal.
    if (faderFloat > 0 && this.features.includes("gain-control")) addresses.push(headampGain(channel));
    return addresses;
  }

  /**
   * Capture the current board into an address→value map (Req 10.8), storing ONLY
   * the audible fields per channel (see section header). Uses bounded-retry
   * read-back; if any channel's REQUIRED field cannot be confirmed, FAIL naming
   * the channel(s) rather than saving a partial/stale snapshot — a wrong stored
   * value would later be applied as a live audio fault.
   */
  async capturePreset(): Promise<MixerPresetPayload> {
    const payload: MixerPresetPayload = {};
    const unconfirmed: number[] = [];

    for (let channel = 1; channel <= this.channelCount; channel++) {
      // mix/on and fader are always needed to even DECIDE audibility.
      const onValues = await this.queryWithRetry(chOn(channel));
      const faderValues = await this.queryWithRetry(chFader(channel));
      const on = onValues && typeof onValues[0] === "number" ? onValues[0] : null;
      const faderFloat = faderValues && typeof faderValues[0] === "number" ? faderValues[0] : null;
      if (on === null || faderFloat === null) {
        unconfirmed.push(channel);
        continue;
      }

      const addresses = this.audibleAddresses(channel, on, faderFloat);
      // Store the already-confirmed on/fader; fetch gain only if audible.
      let gainOk = true;
      let gainValue: number | null = null;
      if (addresses.includes(headampGain(channel))) {
        const gainValues = await this.queryWithRetry(headampGain(channel));
        if (gainValues && typeof gainValues[0] === "number") gainValue = gainValues[0];
        else gainOk = false;
      }
      if (!gainOk) {
        unconfirmed.push(channel);
        continue;
      }

      for (const address of addresses) {
        if (address === chOn(channel)) payload[address] = on;
        else if (address === chFader(channel)) payload[address] = faderFloat;
        else if (gainValue !== null) payload[address] = gainValue;
      }
    }

    if (unconfirmed.length > 0) {
      throw new Error(`Preset capture failed — mixer did not confirm channel(s): ${unconfirmed.join(", ")}. Ensure the mixer is reachable and retry.`);
    }
    return payload;
  }

  /**
   * Apply a preset payload with SPIKE-SAFE write ordering, then verify the
   * written fields via scoped PARALLEL read-back (Req 3.2, RTT budget).
   *
   * SPIKE-SAFE ORDERING: over UDP the writes are unordered on the wire, but we
   * still sequence the risky transitions so a channel never passes audio at the
   * wrong level even momentarily:
   *   • going AUDIBLE (on=1): write gain + fader FIRST, then unmute LAST, so the
   *     level is correct before any sound is let through.
   *   • going MUTED (on=0):   write mute FIRST, so sound is cut before any
   *     (irrelevant) level writes — though for a muted channel we only write mute.
   *
   * VERIFY: stored values came from reading the board, so the console should
   * report them back; floats compare within PRESET_VERIFY_TOLERANCE (float32 wire
   * vs float64 JSON, console quantization), mute exactly. Writes are PACED and
   * channels that don't verify are RE-WRITTEN for up to PRESET_MAX_ROUNDS — UDP
   * to the X Air drops packets under burst, so one miss must not fail a preset.
   * Read-backs run in PARALLEL across channels/fields (every address is distinct).
   */
  async activatePreset(payload: MixerPresetPayload): Promise<{ unconfirmedChannels: number[] }> {
    // Group payload entries by channel so we can order each channel's writes and
    // verify per channel. Keep only addresses we understand (fader/on/gain).
    const byChannel = this.groupPresetByChannel(payload);
    const startedAt = Date.now();

    // Drop /xremote echoes of our own writes for every address we touch, for the
    // whole apply (+ guard). Otherwise each echo is broadcast as an "external
    // change" — dozens of full-state broadcasts that make channels jump one by one.
    const holdEchoes = (): void => {
      const until =
        Date.now() + PRESET_MAX_ROUNDS * (READBACK_TIMEOUT_MS + PRESET_VERIFY_SETTLE_MS + byChannel.size * PRESET_WRITE_STAGGER_MS) + SELF_ECHO_GUARD_MS;
      for (const entry of byChannel.values()) {
        for (const address of [entry.onAddress, entry.faderAddress, entry.gainAddress, chMix(entry.channel)]) {
          if (address) this.selfWriteUntil.set(address, until);
        }
      }
    };
    holdEchoes();

    // Write → settle → read back → re-write ONLY the channels that did not match.
    // A dropped UDP packet (the likely cause of a single unconfirmed channel) gets
    // another chance instead of failing the whole preset on the first miss.
    let pending = Array.from(byChannel.values());
    const confirmed = new Map<number, PresetReported>();
    for (let round = 1; round <= PRESET_MAX_ROUNDS && pending.length > 0; round++) {
      await this.writePresetEntries(pending);
      await sleep(PRESET_VERIFY_SETTLE_MS);
      const outcomes = await Promise.all(pending.map(async (entry) => ({ entry, reported: await this.readPresetEntry(entry) })));
      const stillPending: PresetChannelEntry[] = [];
      for (const { entry, reported } of outcomes) {
        if (reported) confirmed.set(entry.channel, reported);
        else stillPending.push(entry);
      }
      if (stillPending.length > 0) {
        logger.warn("Preset apply round left channel(s) unconfirmed", {
          context: { mixerId: this.config.mixerId, round, maxRounds: PRESET_MAX_ROUNDS, channels: stillPending.map((e) => e.channel) },
        });
      }
      pending = stillPending;
    }

    // Publish the board-REPORTED values (mixer is authoritative) once, together.
    for (const [channel, reported] of confirmed) this.applyReportedChannel(channel, reported);
    holdEchoes(); // absorb trailing echoes for a beat after the final read

    const unconfirmedChannels = pending.map((entry) => entry.channel).sort((a, b) => a - b);
    logger.info("Preset apply finished", {
      context: { mixerId: this.config.mixerId, channels: byChannel.size, confirmed: confirmed.size, unconfirmedChannels, elapsedMs: Date.now() - startedAt },
    });
    return { unconfirmedChannels };
  }

  /**
   * Spike-safe, PACED writes for the given channels (see activatePreset). The
   * per-channel stagger keeps bursts inside the console's UDP buffer.
   *
   * GROUPED WRITES (verified on an XR18V2, fw 1.26): the X Air accepts a
   * multi-type-tag set on the mix NODE — `/ch/NN/mix ,if <on> <fader>` sets mute
   * and fader in ONE message (the node's field order is on, fader, lr, pan; a
   * shorter tag list sets the leading fields). This halves the mute+fader traffic
   * and means the two can never land out of order. OSC BUNDLES were tested and
   * are SILENTLY IGNORED by the board — do not use them.
   *
   * Ordering: gain is its own node (/headamp/NN/gain). Going audible we write
   * gain FIRST so the preamp is right before the grouped unmute+fader lands;
   * going muted we write the grouped mute+fader first, then any gain.
   */
  private async writePresetEntries(entries: PresetChannelEntry[]): Promise<void> {
    for (const entry of entries) {
      const writeMixGroup = (): void => {
        if (entry.on !== undefined && entry.fader !== undefined) {
          this.transport.send(chMix(entry.channel), "if", [entry.on, entry.fader]);
        } else {
          // Only one of the two present (e.g. muted channel → mute only).
          if (entry.on !== undefined) this.transport.send(entry.onAddress!, "i", [entry.on]);
          if (entry.fader !== undefined) this.transport.send(entry.faderAddress!, "f", [entry.fader]);
        }
      };
      if (entry.on === BehringerXAirDriver.ON) {
        if (entry.gain !== undefined) this.transport.send(entry.gainAddress!, "f", [entry.gain]);
        writeMixGroup();
      } else {
        writeMixGroup();
        if (entry.gain !== undefined) this.transport.send(entry.gainAddress!, "f", [entry.gain]);
      }
      await sleep(PRESET_WRITE_STAGGER_MS);
    }
  }

  /** Parsed, per-channel view of a preset payload for ordered write + verify. */
  private groupPresetByChannel(payload: MixerPresetPayload): Map<number, PresetChannelEntry> {
    const byChannel = new Map<number, PresetChannelEntry>();
    const ensure = (channel: number): PresetChannelEntry => {
      let entry = byChannel.get(channel);
      if (!entry) {
        entry = { channel };
        byChannel.set(channel, entry);
      }
      return entry;
    };
    for (const [address, value] of Object.entries(payload)) {
      if (typeof value !== "number") continue; // fader/on/gain are all numeric
      const onMatch = /^\/ch\/(\d+)\/mix\/on$/.exec(address);
      if (onMatch) {
        const entry = ensure(Number(onMatch[1]));
        entry.on = value;
        entry.onAddress = address;
        continue;
      }
      const faderMatch = /^\/ch\/(\d+)\/mix\/fader$/.exec(address);
      if (faderMatch) {
        const entry = ensure(Number(faderMatch[1]));
        entry.fader = value;
        entry.faderAddress = address;
        continue;
      }
      const gainMatch = /^\/headamp\/(\d+)\/gain$/.exec(address);
      if (gainMatch) {
        const entry = ensure(Number(gainMatch[1]));
        entry.gain = value;
        entry.gainAddress = address;
      }
    }
    // Apply the audibility rule at APPLY time too, so presets captured before the
    // rule existed (all 3 fields for every channel) behave exactly like new ones:
    // muted → mute only; unmuted at −∞ → mute + fader; otherwise all three. This
    // also cuts a legacy 16-channel preset from 32 writes/32 reads to ~17.
    for (const entry of byChannel.values()) {
      if (entry.on === BehringerXAirDriver.OFF) {
        delete entry.fader;
        delete entry.faderAddress;
        delete entry.gain;
        delete entry.gainAddress;
      } else if (entry.fader === 0) {
        delete entry.gain;
        delete entry.gainAddress;
      }
    }
    return byChannel;
  }

  /**
   * Read back one channel's written fields (single attempt per address — retries
   * happen at the round level, which also RE-WRITES). Returns the board-reported
   * values when every field matches its stored value (mute exact, floats within
   * PRESET_VERIFY_TOLERANCE), or null if any field is missing or mismatched.
   */
  private async readPresetEntry(entry: PresetChannelEntry): Promise<PresetReported | null> {
    // When both mute and fader are in the preset, ONE grouped node query returns
    // both (`,ifif on fader lr pan`); otherwise query the single leaf address.
    const grouped = entry.on !== undefined && entry.fader !== undefined;
    const ask = (address: string): Promise<Array<number | string | Uint8Array> | null> => this.pacedQuery(address, PRESET_READ_TIMEOUT_MS);
    const [mix, onLeaf, faderLeaf, gain] = await Promise.all([
      grouped ? ask(chMix(entry.channel)) : Promise.resolve(null),
      !grouped && entry.on !== undefined ? ask(entry.onAddress!) : Promise.resolve(null),
      !grouped && entry.fader !== undefined ? ask(entry.faderAddress!) : Promise.resolve(null),
      entry.gain !== undefined ? ask(entry.gainAddress!) : Promise.resolve(null),
    ]);
    const on = grouped ? (mix ? [mix[0]] : null) : onLeaf;
    const fader = grouped ? (mix && mix.length >= 2 ? [mix[1]] : null) : faderLeaf;
    const reported: PresetReported = {};
    if (entry.on !== undefined) {
      if (!on || on[0] !== entry.on) return null;
      reported.on = entry.on;
    }
    if (entry.fader !== undefined) {
      if (!fader || typeof fader[0] !== "number" || Math.abs(fader[0] - entry.fader) > PRESET_VERIFY_TOLERANCE) return null;
      reported.fader = fader[0];
    }
    if (entry.gain !== undefined) {
      if (!gain || typeof gain[0] !== "number" || Math.abs(gain[0] - entry.gain) > PRESET_VERIFY_TOLERANCE) return null;
      reported.gain = gain[0];
    }
    this.emitLiveness();
    return reported;
  }

  /**
   * Send a query no sooner than PRESET_QUERY_STAGGER_MS after the previous paced
   * query, then await its reply. MEASURED on the XR18 (fw 1.26): a burst of 32
   * simultaneous queries intermittently loses replies (one run: 16/32 answered,
   * channels 1–8 missing; another: 31/32) — the board drops part of the burst.
   * Pacing at 1 ms answered 32/32 every time in ~37 ms total. Each lost reply
   * otherwise costs a full read timeout PLUS a re-write round. Only the SEND is
   * serialized; replies are still awaited in parallel.
   */
  private pacedQuery(address: string, timeoutMs: number): Promise<Array<number | string | Uint8Array> | null> {
    const slot = this.queryGate.then(() => sleep(PRESET_QUERY_STAGGER_MS));
    this.queryGate = slot;
    return slot.then(() => this.query(address, timeoutMs));
  }

  /** Apply board-reported values to channel state, emitting ONE state change. */
  private applyReportedChannel(channel: number, reported: PresetReported): void {
    const state = this.channels.get(channel);
    if (!state) return;
    if (reported.on !== undefined) {
      state.muted = reported.on === BehringerXAirDriver.OFF;
      this.muteKnown.add(channel);
    }
    if (reported.fader !== undefined) {
      state.fader = reported.fader;
      state.faderDb = faderFloatToDb(reported.fader);
    }
    if (reported.gain !== undefined) state.gainDb = gainFloatToDb(reported.gain, X_AIR_GAIN_RANGE.minDb, X_AIR_GAIN_RANGE.maxDb);
    state.unreconciled = false;
    this.emitState(state);
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
