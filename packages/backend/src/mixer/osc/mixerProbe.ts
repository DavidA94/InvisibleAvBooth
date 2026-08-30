// Mixer connection probe (Req 9.4).
//
// OSC/UDP is fire-and-forget with no ACK, so "connection success" cannot mean
// "the send succeeded". The only meaningful definition for the X Air is: send
// /xinfo and wait for a reply within a short timeout. The console replies with
// [ip, name, model, firmware]. A reply within the window = reachable; a timeout
// = unreachable. This mirrors the X-Air Edit connect handshake.

import { createSocket } from "dgram";
import { MIXER_PROBE_TIMEOUT_MS } from "@invisible-av-booth/shared";
import { encodeOsc, decodeOsc } from "./oscCodec.js";
import { logger } from "../../logger.js";

export interface MixerProbeResult {
  ok: boolean;
  model?: string;
  firmware?: string;
  reason?: string;
}

/**
 * Probe a mixer at host:port by sending /xinfo and awaiting a reply.
 *
 * @param timeoutMs override for tests; defaults to MIXER_PROBE_TIMEOUT_MS.
 */
export function probeMixer(host: string, port: number, timeoutMs: number = MIXER_PROBE_TIMEOUT_MS): Promise<MixerProbeResult> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    let settled = false;

    const finish = (result: MixerProbeResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // socket may already be closing — ignore.
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({ ok: false, reason: `no response from mixer at ${host}:${port}` });
    }, timeoutMs);

    socket.on("message", (packet: Buffer) => {
      const message = decodeOsc(packet);
      if (!message || message.address !== "/xinfo") return;
      // /xinfo reply: [ip, name, model, firmware]
      const [, , model, firmware] = message.values;
      const result: MixerProbeResult = { ok: true };
      if (typeof model === "string") result.model = model;
      if (typeof firmware === "string") result.firmware = firmware;
      finish(result);
    });

    socket.on("error", (error: Error) => {
      logger.warn("Mixer probe socket error", { context: { host, port, error: error.message } });
      finish({ ok: false, reason: `socket error probing ${host}:${port}: ${error.message}` });
    });

    try {
      const packet = encodeOsc("/xinfo");
      socket.send(packet, port, host, (error) => {
        if (error) finish({ ok: false, reason: `failed to send probe to ${host}:${port}: ${error.message}` });
      });
    } catch (error) {
      finish({ ok: false, reason: `failed to encode probe: ${(error as Error).message}` });
    }
  });
}
