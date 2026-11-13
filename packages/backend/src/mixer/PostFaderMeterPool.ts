/**
 * PostFaderMeterPool — TRUE per-channel post-fader (outgoing) meters from the X Air.
 *
 * WHY a pool of connections (MEASURED on an XR18V2, fw 1.26, Nov 2026):
 * - The only per-channel post-fader meter is `/meters/0 <channel>` (channel-strip
 *   bank; index 4 = post-fader). There is NO 16-channel post-fader bank — the
 *   all-channel bank (`/meters/1`) is pre-fader input.
 * - `/meters/0` holds ONE channel selection PER REGISTERED CLIENT. A client is a
 *   UDP source port that has registered with `/xinfo` + `/xremote` (exactly what X
 *   AIR Edit does). UNREGISTERED sockets all share one slot (the last subscribe
 *   wins for everyone) — that is why a naive multi-socket attempt reports every
 *   channel as the last one requested.
 * - So each measured channel gets its own socket: register → (on /xinfo reply)
 *   subscribe `/meters/0 <ch-1>` → renew. Verified: 16 such sockets each report
 *   their own channel (0.00 dB vs the input bank).
 *
 * COST (measured): the board shares a fixed meter budget across subscribers. With
 * ≥4 extra subscriptions every meter stream — including our input bank and other
 * clients such as X AIR Edit — drops to ~200 ms per frame (5 fps); 1 subscription
 * is ~free. The driver therefore only asks for UNMUTED channels (a muted channel's
 * outgoing level is silent by definition), keeping the common case at 1–4.
 */

import { decodeMeterBlob, clampLevelDb } from "./osc/meterDecode.js";
import type { OscTransport } from "./MixerControlInterface.js";
import { logger } from "../logger.js";

/** Index of the post-fader value in a `/meters/0` channel-strip frame (verified). */
const CHANNEL_STRIP_POST_FADER_INDEX = 4;

interface Subscription {
  transport: OscTransport;
  /** false once released — guards the async open() racing a release. */
  active: boolean;
  unsubscribe: (() => void) | null;
}

export class PostFaderMeterPool {
  private readonly subscriptions = new Map<number, Subscription>();

  constructor(
    private readonly createTransport: () => OscTransport,
    private readonly rateFactor: number,
    private readonly onLevel: (channel: number, postFaderDb: number) => void,
    private readonly mixerId: string,
  ) {}

  /** Channels currently being measured (for tests/diagnostics). */
  channels(): number[] {
    return Array.from(this.subscriptions.keys()).sort((a, b) => a - b);
  }

  /** Make the measured set exactly `wanted`: open missing channels, release the rest. */
  reconcile(wanted: Set<number>): void {
    for (const channel of Array.from(this.subscriptions.keys())) {
      if (!wanted.has(channel)) this.release(channel);
    }
    for (const channel of wanted) {
      if (!this.subscriptions.has(channel)) this.acquire(channel);
    }
  }

  /** Re-send each channel's `/meters/0` subscription (the board lapses it after ~10 s). */
  renewMeters(): void {
    for (const [channel, subscription] of this.subscriptions) this.subscribe(channel, subscription);
  }

  /** Re-send each client's `/xremote` registration (also lapses after ~10 s). */
  renewRegistration(): void {
    for (const subscription of this.subscriptions.values()) subscription.transport.send("/xremote");
  }

  releaseAll(): void {
    for (const channel of Array.from(this.subscriptions.keys())) this.release(channel);
  }

  private acquire(channel: number): void {
    const subscription: Subscription = { transport: this.createTransport(), active: true, unsubscribe: null };
    this.subscriptions.set(channel, subscription);
    void subscription.transport.open().then((ok) => {
      if (!subscription.active) {
        subscription.transport.close(); // released while opening
        return;
      }
      if (!ok) {
        logger.warn("Post-fader meter socket failed to open", { context: { mixerId: this.mixerId, channel } });
        return;
      }
      subscription.unsubscribe = subscription.transport.onMessage((address, values) => {
        // Register first, subscribe once the board has answered (/xinfo always
        // replies) — subscribing before registration lands in the shared slot.
        if (address === "/xinfo") {
          this.subscribe(channel, subscription);
          return;
        }
        if (address !== "/meters/0") return; // /xremote pushes are ignored here
        const blob = values.find((value) => value instanceof Uint8Array) as Uint8Array | undefined;
        const db = blob ? decodeMeterBlob(blob)[CHANNEL_STRIP_POST_FADER_INDEX] : undefined;
        if (db !== undefined) this.onLevel(channel, clampLevelDb(db));
      });
      subscription.transport.send("/xinfo");
      subscription.transport.send("/xremote");
    });
  }

  private subscribe(channel: number, subscription: Subscription): void {
    // `/meters/0` takes the 0-based channel index, then the rate factor.
    subscription.transport.send("/meters", "sii", ["/meters/0", channel - 1, this.rateFactor]);
  }

  private release(channel: number): void {
    const subscription = this.subscriptions.get(channel);
    if (!subscription) return;
    subscription.active = false;
    subscription.unsubscribe?.();
    // Closing the socket stops us consuming frames; the board simply lets the
    // un-renewed subscription lapse (~10 s). No unsubscribe command is needed.
    subscription.transport.close();
    this.subscriptions.delete(channel);
  }
}
