import { Socket } from "net";
import type { PositionInquiry } from "@invisible-av-booth/shared";
import { logger } from "../logger.js";

const VISCA_HEADER = 0x81;
const VISCA_TERMINATOR = 0xff;

// Inquiry commands
const CAM_PANTILT_POS_INQ = Buffer.from([VISCA_HEADER, 0x09, 0x06, 0x12, VISCA_TERMINATOR]);
const CAM_ZOOM_POS_INQ = Buffer.from([VISCA_HEADER, 0x09, 0x04, 0x47, VISCA_TERMINATOR]);
const CAM_FOCUS_POS_INQ = Buffer.from([VISCA_HEADER, 0x09, 0x04, 0x48, VISCA_TERMINATOR]);
const CAM_FOCUS_AF_MODE_INQ = Buffer.from([VISCA_HEADER, 0x09, 0x04, 0x38, VISCA_TERMINATOR]);
const CAM_POWER_INQ = Buffer.from([VISCA_HEADER, 0x09, 0x04, 0x00, VISCA_TERMINATOR]);

// Normalization constants
const ZOOM_MAX_RAW = 0x4000;
const FOCUS_MAX_RAW = 0x4000;
const PAN_MAX_RAW = 0xffff;

export function normalizeZoom(raw: number): number {
  return raw / ZOOM_MAX_RAW;
}

export function denormalizeZoom(normalized: number): number {
  return Math.round(normalized * ZOOM_MAX_RAW);
}

export function normalizeFocus(raw: number): number {
  return raw / FOCUS_MAX_RAW;
}

export function denormalizeFocus(normalized: number): number {
  return Math.round(normalized * FOCUS_MAX_RAW);
}

export function normalizePan(raw: number): number {
  // Signed 16-bit: center = 0, range -1 to 1
  const signed = raw > 0x7fff ? raw - 0x10000 : raw;
  return signed / (PAN_MAX_RAW / 2);
}

export function denormalizePan(normalized: number): number {
  const raw = Math.round(normalized * (PAN_MAX_RAW / 2));
  return raw < 0 ? raw + 0x10000 : raw;
}

export function buildViscaPositionFromResponse(data: Buffer): number {
  // VISCA position response: y0 50 0p 0q 0r 0s FF → value = pqrs
  if (data.length < 7) return 0;
  return ((data[2]! & 0x0f) << 12) | ((data[3]! & 0x0f) << 8) | ((data[4]! & 0x0f) << 4) | (data[5]! & 0x0f);
}

export class ViscaCameraDriver {
  private host: string;
  private port: number;
  private socket: Socket | null = null;
  private connected = false;
  private responseBuffer = Buffer.alloc(0);
  private pendingResolve: ((data: Buffer) => void) | null = null;
  private commandQueue: Array<{ cmd: Buffer; resolve: (data: Buffer) => void; reject: (err: Error) => void; tag?: string }> = [];

  constructor(host: string, port: number) {
    this.host = host;
    this.port = port;
  }

  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = new Socket();
      socket.setTimeout(5000);

      socket.on("connect", () => {
        this.socket = socket;
        this.connected = true;
        resolve(true);
      });

      socket.on("data", (data) => {
        this.responseBuffer = Buffer.concat([this.responseBuffer, data]);
        this.processBuffer();
      });

      socket.on("error", () => {
        this.connected = false;
        resolve(false);
      });

      socket.on("close", () => {
        this.connected = false;
      });

      socket.on("timeout", () => {
        socket.destroy();
        resolve(false);
      });

      socket.connect(this.port, this.host);
    });
  }

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async probe(): Promise<boolean> {
    try {
      const resp = await this.sendCommand(CAM_POWER_INQ);
      return resp.length >= 4 && resp[1] === 0x50;
    } catch {
      return false;
    }
  }

  async inquirePosition(): Promise<PositionInquiry> {
    if (!this.connected) await this.connect();
    const result: PositionInquiry = { pan: null, tilt: null, zoom: null, focus: null, autoFocus: null };

    try {
      const ptResp = await this.sendCommand(CAM_PANTILT_POS_INQ);
      if (ptResp.length >= 11) {
        const panRaw = ((ptResp[2]! & 0x0f) << 12) | ((ptResp[3]! & 0x0f) << 8) | ((ptResp[4]! & 0x0f) << 4) | (ptResp[5]! & 0x0f);
        const tiltRaw = ((ptResp[6]! & 0x0f) << 12) | ((ptResp[7]! & 0x0f) << 8) | ((ptResp[8]! & 0x0f) << 4) | (ptResp[9]! & 0x0f);
        result.pan = normalizePan(panRaw);
        result.tilt = normalizePan(tiltRaw);
      }
    } catch {
      // axis unknown
    }

    try {
      const zResp = await this.sendCommand(CAM_ZOOM_POS_INQ);
      if (zResp.length >= 7) {
        result.zoom = normalizeZoom(buildViscaPositionFromResponse(zResp));
      }
    } catch {
      // axis unknown
    }

    try {
      const fResp = await this.sendCommand(CAM_FOCUS_POS_INQ);
      if (fResp.length >= 7) {
        result.focus = normalizeFocus(buildViscaPositionFromResponse(fResp));
      }
    } catch {
      // axis unknown
    }

    try {
      const afResp = await this.sendCommand(CAM_FOCUS_AF_MODE_INQ);
      if (afResp.length >= 4) {
        result.autoFocus = (afResp[2]! & 0x0f) === 0x02;
      }
    } catch {
      // unknown
    }

    return result;
  }

  // ── PTZ Commands ─────────────────────────────────────────────────────────

  async panTiltSpeed(panSpeed: number, tiltSpeed: number): Promise<void> {
    if (!this.connected) await this.connect();
    const ps = Math.max(1, Math.min(0x18, Math.round(Math.abs(panSpeed) * 0x18)));
    const ts = Math.max(1, Math.min(0x14, Math.round(Math.abs(tiltSpeed) * 0x14)));
    const panDir = panSpeed > 0 ? 0x02 : panSpeed < 0 ? 0x01 : 0x03;
    const tiltDir = tiltSpeed > 0 ? 0x01 : tiltSpeed < 0 ? 0x02 : 0x03;
    const cmd = Buffer.from([VISCA_HEADER, 0x01, 0x06, 0x01, ps, ts, panDir, tiltDir, VISCA_TERMINATOR]);
    try {
      await this.sendCommand(cmd, "panTiltSpeed");
    } catch {
      /* ignore NAK */
    }
  }

  async panTiltAbsolute(pan: number, tilt: number): Promise<void> {
    if (!this.connected) await this.connect();
    const panRaw = denormalizePan(pan);
    const tiltRaw = denormalizePan(tilt);
    // 81 01 06 02 VV WW 0p 0q 0r 0s 0t 0u 0v 0w FF
    const cmd = Buffer.from([
      VISCA_HEADER,
      0x01,
      0x06,
      0x02,
      0x0c,
      0x0c,
      (panRaw >> 12) & 0x0f,
      (panRaw >> 8) & 0x0f,
      (panRaw >> 4) & 0x0f,
      panRaw & 0x0f,
      (tiltRaw >> 12) & 0x0f,
      (tiltRaw >> 8) & 0x0f,
      (tiltRaw >> 4) & 0x0f,
      tiltRaw & 0x0f,
      VISCA_TERMINATOR,
    ]);
    try {
      await this.sendCommand(cmd);
    } catch {
      /* ignore */
    }
  }

  async zoomAbsolute(zoom: number): Promise<void> {
    if (!this.connected) await this.connect();
    const raw = denormalizeZoom(zoom);
    // 81 01 04 47 0p 0q 0r 0s FF
    const cmd = Buffer.from([VISCA_HEADER, 0x01, 0x04, 0x47, (raw >> 12) & 0x0f, (raw >> 8) & 0x0f, (raw >> 4) & 0x0f, raw & 0x0f, VISCA_TERMINATOR]);
    try {
      await this.sendCommand(cmd);
    } catch {
      /* ignore */
    }
  }

  async focusAuto(): Promise<void> {
    if (!this.connected) await this.connect();
    // 81 01 04 38 02 FF (auto focus on)
    const cmd = Buffer.from([VISCA_HEADER, 0x01, 0x04, 0x38, 0x02, VISCA_TERMINATOR]);
    try {
      await this.sendCommand(cmd);
    } catch {
      /* ignore */
    }
  }

  async focusManual(position: number): Promise<void> {
    if (!this.connected) await this.connect();
    // Switch to manual: 81 01 04 38 03 FF
    const manual = Buffer.from([VISCA_HEADER, 0x01, 0x04, 0x38, 0x03, VISCA_TERMINATOR]);
    try {
      await this.sendCommand(manual);
    } catch {
      /* ignore */
    }
    // Set position: 81 01 04 48 0p 0q 0r 0s FF
    const raw = denormalizeFocus(position);
    const cmd = Buffer.from([VISCA_HEADER, 0x01, 0x04, 0x48, (raw >> 12) & 0x0f, (raw >> 8) & 0x0f, (raw >> 4) & 0x0f, raw & 0x0f, VISCA_TERMINATOR]);
    try {
      await this.sendCommand(cmd);
    } catch {
      /* ignore */
    }
  }

  async stop(): Promise<void> {
    if (!this.connected) await this.connect();
    // PanTiltDrive Stop: 81 01 06 01 01 01 03 03 FF
    const cmd = Buffer.from([VISCA_HEADER, 0x01, 0x06, 0x01, 0x01, 0x01, 0x03, 0x03, VISCA_TERMINATOR]);
    try {
      await this.sendCommand(cmd);
    } catch {
      /* ignore */
    }
  }

  private sendCommand(cmd: Buffer, tag?: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }
      // Queue if another command is in-flight
      if (this.pendingResolve) {
        // Deduplicate: if a command with the same tag is already queued, replace it
        if (tag) {
          const idx = this.commandQueue.findIndex((e) => e.tag === tag);
          if (idx >= 0) {
            this.commandQueue[idx]!.reject(new Error("Superseded"));
            this.commandQueue[idx] = { cmd, resolve, reject, tag };
            return;
          }
        }
        this.commandQueue.push({ cmd, resolve, reject, tag });
        return;
      }
      this.pendingResolve = resolve;
      this.socket.write(cmd, (err) => {
        if (err) {
          this.pendingResolve = null;
          reject(err);
        }
      });
      setTimeout(() => {
        if (this.pendingResolve === resolve) {
          this.pendingResolve = null;
          reject(new Error("VISCA timeout"));
        }
      }, 2000);
    });
  }

  private processBuffer(): void {
    const termIdx = this.responseBuffer.indexOf(VISCA_TERMINATOR);
    if (termIdx < 0) return;
    const packet = this.responseBuffer.subarray(0, termIdx + 1);
    this.responseBuffer = this.responseBuffer.subarray(termIdx + 1);

    // Skip ACK packets (y0 4x FF)
    if (packet.length === 3 && (packet[1]! & 0xf0) === 0x40) {
      this.processBuffer();
      return;
    }

    // Check for error response (y0 6x FF)
    if (packet.length >= 3 && (packet[1]! & 0xf0) === 0x60) {
      logger.warn("VISCA error response", { context: { hex: packet.toString("hex") } });
    }

    if (this.pendingResolve) {
      const resolve = this.pendingResolve;
      this.pendingResolve = null;
      resolve(packet);
    }

    // Drain queue
    this.drainQueue();
  }

  private drainQueue(): void {
    if (this.pendingResolve || this.commandQueue.length === 0) return;
    const next = this.commandQueue.shift()!;
    this.pendingResolve = next.resolve;
    this.socket?.write(next.cmd, (err) => {
      if (err) {
        this.pendingResolve = null;
        next.reject(err);
        this.drainQueue();
      }
    });
    setTimeout(() => {
      if (this.pendingResolve === next.resolve) {
        this.pendingResolve = null;
        next.reject(new Error("VISCA timeout"));
        this.drainQueue();
      }
    }, 2000);
  }
}
