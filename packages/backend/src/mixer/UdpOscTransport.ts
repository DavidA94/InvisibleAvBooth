// Real UDP OSC transport for the mixer driver (node dgram + shared OSC codec).
//
// WHY dgram directly (not @mxfriend/osc's UdpOSCPort): we already use the
// library's codec (OSCEncoder/OSCDecoder) via oscCodec, and owning the raw
// socket keeps full control of the /xremote and /meters subscription lifecycle
// and reconnection — the exact control a fire-and-forget device needs. If the
// alpha library's codec is ever swapped for osc.js, only oscCodec changes.

import { createSocket } from "dgram";
import type { Socket } from "dgram";
import type { OscTransport } from "./MixerControlInterface.js";
import { encodeOsc, decodeOsc } from "./osc/oscCodec.js";
import { logger } from "../logger.js";

export class UdpOscTransport implements OscTransport {
  private socket: Socket | null = null;
  private readonly listeners = new Set<(address: string, values: Array<number | string | Uint8Array>) => void>();

  constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly mixerId: string,
  ) {}

  open(): Promise<boolean> {
    if (this.socket) return Promise.resolve(true);
    return new Promise((resolve) => {
      const socket = createSocket("udp4");

      socket.on("message", (packet: Buffer) => {
        const message = decodeOsc(packet);
        if (!message || !message.address) return;
        for (const listener of this.listeners) {
          listener(message.address, message.values);
        }
      });

      socket.on("error", (error: Error) => {
        logger.warn("Mixer OSC socket error", { context: { mixerId: this.mixerId, host: this.host, port: this.port, error: error.message } });
      });

      // UDP has no connection handshake; binding a local port is enough to receive replies.
      socket.bind(0, () => {
        this.socket = socket;
        resolve(true);
      });
    });
  }

  send(address: string, types = "", values: Array<number | string | Uint8Array> = []): void {
    if (!this.socket) return;
    try {
      const packet = encodeOsc(address, types, values);
      this.socket.send(packet, this.port, this.host, (error) => {
        if (error) logger.warn("Mixer OSC send failed", { context: { mixerId: this.mixerId, address, error: error.message } });
      });
    } catch (error) {
      logger.warn("Mixer OSC encode failed", { context: { mixerId: this.mixerId, address, error: (error as Error).message } });
    }
  }

  onMessage(listener: (address: string, values: Array<number | string | Uint8Array>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    this.listeners.clear();
    if (this.socket) {
      try {
        this.socket.close();
      } catch {
        // already closing — ignore.
      }
      this.socket = null;
    }
  }
}
