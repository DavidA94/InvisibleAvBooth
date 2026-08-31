/**
 * AudioPreviewManager — audio-level previews over the binary WebSocket transport.
 *
 * The mixer gain-window envelope is its first consumer; the name is generic so
 * future audio previews reuse it. It owns its own WebSocketServer({ noServer:
 * true }) and receives already-authenticated upgrades from PreviewUpgradeRouter.
 *
 * DUMB FORWARDER (Req 15.7 single-owner invariant): on connection it subscribes
 * to AudioCaptureService for the requested channel and forwards envelope frames
 * (shared binary codec) to the socket. It NEVER respawns capture — respawn is
 * owned solely by AudioCaptureService. On capture crash it simply stops
 * receiving frames (and the frontend flips to the slider tier, Req 15.6).
 *
 * Opening the socket = startChannelMonitor (subscribe); close/disconnect =
 * stopChannelMonitor (unsubscribe → capture teardown when no consumers remain),
 * so a crashed tablet never leaks capture (Req 4.6).
 *
 * CLOSE CODES: a malformed path → 4404 (like a 404). A well-formed but unknown
 * mixer/channel → 4004, distinct from "capture unavailable" (4503), so the modal
 * can tell "no such channel" from "capture down".
 */

import type { IncomingMessage } from "http";
import type { Duplex } from "stream";
import { WebSocketServer, WebSocket } from "ws";
import type { AuthUser, EnvelopePair } from "@invisible-av-booth/shared";
import { encodeEnvelopeFrame } from "@invisible-av-booth/shared";
import { logger } from "../logger.js";
import type { AudioCaptureService, AudioConsumer } from "../mixer/AudioCaptureService.js";

export const AUDIO_PREVIEW_PING_INTERVAL_MS = 30000;

/** Validates that a mixer/channel exists so we can distinguish unknown from malformed. */
export type ChannelValidator = (mixerId: string, channel: number) => boolean;

export const CLOSE_MALFORMED_PATH = 4404;
export const CLOSE_UNKNOWN_CHANNEL = 4004;
export const CLOSE_CAPTURE_UNAVAILABLE = 4503;

export class AudioPreviewManager {
  private readonly wss: WebSocketServer;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private readonly liveSockets = new Set<WebSocket>();
  private nextConsumerId = 0;

  constructor(
    private readonly capture: AudioCaptureService,
    private readonly isValidChannel: ChannelValidator,
  ) {
    this.wss = new WebSocketServer({ noServer: true });
    this.pingInterval = setInterval(() => this.pingAll(), AUDIO_PREVIEW_PING_INTERVAL_MS);
  }

  /** Handle an already-authenticated `/preview/mixer/*` upgrade. */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, _user: AuthUser): void {
    const parsed = parseMixerChannelPath(request.url ?? "");
    if (!parsed) {
      logger.warn("Audio preview upgrade rejected — malformed path", { context: { url: request.url } });
      // Malformed path → 404-equivalent close after upgrade so the client sees a code.
      this.wss.handleUpgrade(request, socket, head, (ws) => ws.close(CLOSE_MALFORMED_PATH, "Malformed mixer preview path"));
      return;
    }

    const { mixerId, channel } = parsed;
    if (!this.isValidChannel(mixerId, channel)) {
      logger.warn("Audio preview upgrade rejected — unknown mixer/channel", { context: { mixerId, channel } });
      this.wss.handleUpgrade(request, socket, head, (ws) => ws.close(CLOSE_UNKNOWN_CHANNEL, "Unknown mixer or channel"));
      return;
    }

    logger.debug("Audio preview upgrade accepted", { context: { mixerId, channel } });
    this.wss.handleUpgrade(request, socket, head, (ws) => this.handleConnection(ws, mixerId, channel));
  }

  private handleConnection(ws: WebSocket, mixerId: string, channel: number): void {
    this.liveSockets.add(ws);
    (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    ws.on("pong", () => {
      (ws as WebSocket & { isAlive?: boolean }).isAlive = true;
    });

    const consumer: AudioConsumer = {
      id: `audio-preview-${this.nextConsumerId++}`,
      channels: [channel],
      onEnvelope: (envelopeChannel, pairs) => {
        if (envelopeChannel !== channel) return;
        this.forward(ws, pairs);
      },
    };
    const unsubscribe = this.capture.subscribe(consumer, mixerId);
    logger.info("Audio preview subscriber connected", { context: { mixerId, channel } });

    const cleanup = (): void => {
      unsubscribe();
      this.liveSockets.delete(ws);
    };
    ws.on("close", cleanup);
    ws.on("error", () => {
      logger.debug("Audio preview socket error", { context: { mixerId, channel } });
      cleanup();
    });
  }

  private forward(ws: WebSocket, pairs: EnvelopePair[]): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    if (pairs.length === 0) return;
    ws.send(encodeEnvelopeFrame(pairs));
  }

  private pingAll(): void {
    for (const ws of this.liveSockets) {
      if ((ws as WebSocket & { isAlive?: boolean }).isAlive === false) {
        this.liveSockets.delete(ws);
        ws.terminate();
        continue;
      }
      (ws as WebSocket & { isAlive?: boolean }).isAlive = false;
      ws.ping();
    }
  }

  destroy(): void {
    if (this.pingInterval) clearInterval(this.pingInterval);
    this.pingInterval = null;
    for (const ws of this.liveSockets) {
      ws.close(1001, "Server shutting down");
    }
    this.liveSockets.clear();
    this.wss.close();
  }
}

/** Parse `/preview/mixer/:mixerId/channel/:channel`. Returns null if malformed. */
export function parseMixerChannelPath(url: string): { mixerId: string; channel: number } | null {
  const match = /^\/preview\/mixer\/([^/?]+)\/channel\/(\d+)(?:[?].*)?$/.exec(url);
  if (!match) return null;
  const channel = Number(match[2]);
  if (!Number.isInteger(channel) || channel <= 0) return null;
  return { mixerId: decodeURIComponent(match[1]!), channel };
}
