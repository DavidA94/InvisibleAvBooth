/**
 * NDI Frame → FFmpeg stdin pipe.
 *
 * Receives raw NDI video frames from grandiose and writes them to FFmpeg's
 * stdin. Backpressure is handled by dropping frames when the pipe is full.
 */
import type { Writable } from "stream";
import { logger } from "../logger.js";

// ── Types ────────────────────────────────────────────────────────────────────

export interface NdiFrameFormat {
  fourCC: string; // "UYVY" or "BGRA"
  width: number;
  height: number;
  frameRateN: number;
  frameRateD: number;
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

  /** Attach an FFmpeg stdin writable stream. */
  attach(stdin: Writable): void {
    this.stdin = stdin;
  }

  /** Detach the pipe (e.g., on FFmpeg restart). */
  detach(): void {
    this.stdin = null;
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
   * Detects format from first frame metadata. Drops frame if pipe is full (backpressure).
   */
  pushFrame(frame: { fourCC: string; xres: number; yres: number; frameRateN: number; frameRateD: number; data: Buffer }): void {
    // Detect format from first frame
    if (!this.format) {
      this.format = {
        fourCC: frame.fourCC,
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

    // Backpressure: drop frame if write returns false (pipe full)
    const ok = this.stdin.write(frame.data);
    if (!ok) {
      this.droppedFrames++;
    }
  }

  destroy(): void {
    this.stdin = null;
    this.format = null;
    this.droppedFrames = 0;
  }
}
