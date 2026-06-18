/**
 * NDI Frame → FFmpeg stdin pipe.
 *
 * Receives raw NDI video frames and writes them to FFmpeg's stdin.
 * When FFmpeg can't keep up (backpressure), frames are dropped rather
 * than buffered — this keeps the NDI receiver consuming at full speed
 * so the NDI sender doesn't throttle all receivers.
 */
import type { Writable } from "stream";
import { logger } from "../logger.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NdiFrameFormat {
  fourCC: string; // "UYVY" or "BGRA" (resolved from numeric code if needed)
  width: number;
  height: number;
  frameRateN: number;
  frameRateD: number;
}

// Known NDI fourCC numeric codes
const FOURCC_UYVY = 0x59565955; // 'UYVY' as uint32 LE
const FOURCC_BGRA = 0x41524742; // 'BGRA' as uint32 LE

function resolveFourCC(fourCC: string | number): string {
  if (typeof fourCC === "string") return fourCC;
  if (fourCC === FOURCC_UYVY) return "UYVY";
  if (fourCC === FOURCC_BGRA) return "BGRA";
  return "BGRA"; // default fallback
}

// ── buildNdiInputArgs ────────────────────────────────────────────────────────

export function buildNdiInputArgs(format: NdiFrameFormat): string[] {
  const pixFmt = format.fourCC === "UYVY" ? "uyvy422" : "bgra";
  const frameRate = String(format.frameRateN / format.frameRateD);
  return ["-f", "rawvideo", "-pix_fmt", pixFmt, "-s", `${format.width}x${format.height}`, "-r", frameRate, "-i", "pipe:0"];
}

// ── NdiFramePipe ─────────────────────────────────────────────────────────────

export class NdiFramePipe {
  private stdin: Writable | null = null;
  private format: NdiFrameFormat | null = null;
  private droppedFrames = 0;
  private drainable = true;
  private totalFrames = 0;
  private lastReportTime = Date.now();
  private lastReportDropped = 0;
  private lastReportTotal = 0;
  private label: string;

  constructor(label = "unknown") {
    this.label = label;
  }

  /** Attach an FFmpeg stdin writable stream. */
  attach(stdin: Writable): void {
    this.stdin = stdin;
    this.drainable = true;
    stdin.on("drain", () => {
      this.drainable = true;
    });
  }

  /** Detach the pipe (e.g., on FFmpeg restart). */
  detach(): void {
    this.stdin = null;
    this.drainable = true;
  }

  /** Check if stdin is currently attached. */
  isAttached(): boolean {
    return this.stdin !== null && !this.stdin.destroyed;
  }

  /** Get the detected format (from first frame). Returns null until first frame arrives. */
  getFormat(): NdiFrameFormat | null {
    return this.format;
  }

  /** Get number of frames dropped due to backpressure since last reset. */
  getDroppedFrames(): number {
    return this.droppedFrames;
  }

  /**
   * Push a raw NDI video frame to FFmpeg stdin.
   * Detects format from first frame metadata.
   * Drops frame immediately if pipe is backed up — never blocks the caller.
   */
  pushFrame(frame: { fourCC: string | number; xres: number; yres: number; frameRateN: number; frameRateD: number; data: Buffer }): void {
    // Detect format from first frame
    if (!this.format) {
      this.format = {
        fourCC: resolveFourCC(frame.fourCC),
        width: frame.xres,
        height: frame.yres,
        frameRateN: frame.frameRateN,
        frameRateD: frame.frameRateD,
      };
      logger.info(
        `NDI frame format detected: ${this.format.fourCC} ${this.format.width}x${this.format.height} @ ${this.format.frameRateN}/${this.format.frameRateD}`,
      );
    }

    if (!this.stdin || this.stdin.destroyed) return;

    this.totalFrames++;

    // Report stats every 5 seconds
    const now = Date.now();
    if (now - this.lastReportTime >= 5000) {
      const recentDrops = this.droppedFrames - this.lastReportDropped;
      const elapsed = (now - this.lastReportTime) / 1000;
      const recentFrames = this.totalFrames - (this.lastReportTotal ?? 0);
      const fps = Math.round(recentFrames / elapsed);
      if (recentDrops > 0 || recentFrames > 0) {
        const sent = recentFrames - recentDrops;
        logger.info(`NDI pipe [${this.label}]: sent=${sent} dropped=${recentDrops} in ${elapsed.toFixed(0)}s (~${fps}fps in)`);
      }
      this.lastReportDropped = this.droppedFrames;
      this.lastReportTotal = this.totalFrames;
      this.lastReportTime = now;
    }

    // If pipe is backed up, drop this frame immediately
    if (!this.drainable) {
      this.droppedFrames++;
      return;
    }

    // Write frame; if write returns false, mark as not drainable until 'drain' fires
    const ok = this.stdin.write(frame.data);
    if (!ok) {
      this.drainable = false;
    }
  }

  destroy(): void {
    this.stdin = null;
    this.format = null;
    this.droppedFrames = 0;
    this.drainable = true;
  }
}
