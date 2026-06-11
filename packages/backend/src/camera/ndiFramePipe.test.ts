import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "stream";
import { buildNdiInputArgs, NdiFramePipe } from "./ndiFramePipe.js";
import type { NdiFrameFormat } from "./ndiFramePipe.js";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

describe("buildNdiInputArgs", () => {
  it("generates correct args for UYVY format", () => {
    const format: NdiFrameFormat = { fourCC: "UYVY", width: 1920, height: 1080, frameRateN: 30000, frameRateD: 1001 };
    const args = buildNdiInputArgs(format);
    expect(args).toEqual(["-f", "rawvideo", "-pix_fmt", "uyvy422", "-s", "1920x1080", "-r", String(30000 / 1001), "-i", "pipe:0"]);
  });

  it("generates correct args for BGRA format", () => {
    const format: NdiFrameFormat = { fourCC: "BGRA", width: 1280, height: 720, frameRateN: 60, frameRateD: 1 };
    const args = buildNdiInputArgs(format);
    expect(args).toEqual(["-f", "rawvideo", "-pix_fmt", "bgra", "-s", "1280x720", "-r", "60", "-i", "pipe:0"]);
  });

  it("defaults non-UYVY fourCC to bgra", () => {
    const format: NdiFrameFormat = { fourCC: "RGBA", width: 640, height: 480, frameRateN: 25, frameRateD: 1 };
    const args = buildNdiInputArgs(format);
    expect(args).toContain("bgra");
  });
});

describe("NdiFramePipe", () => {
  let pipe: NdiFramePipe;

  beforeEach(() => {
    pipe = new NdiFramePipe();
  });

  it("detects format from first frame metadata", () => {
    const stdin = new PassThrough();
    pipe.attach(stdin);

    expect(pipe.getFormat()).toBeNull();

    pipe.pushFrame({ fourCC: "UYVY", xres: 1920, yres: 1080, frameRateN: 30, frameRateD: 1, data: Buffer.alloc(16) });

    expect(pipe.getFormat()).toEqual({ fourCC: "UYVY", width: 1920, height: 1080, frameRateN: 30, frameRateD: 1 });
  });

  it("writes frame data to stdin", () => {
    const stdin = new PassThrough();
    const chunks: Buffer[] = [];
    stdin.on("data", (chunk) => chunks.push(chunk));
    pipe.attach(stdin);

    const data = Buffer.from([1, 2, 3, 4]);
    pipe.pushFrame({ fourCC: "BGRA", xres: 2, yres: 1, frameRateN: 30, frameRateD: 1, data });

    expect(chunks.length).toBe(1);
    expect(chunks[0]).toEqual(data);
  });

  it("drops frames when stdin write returns false (backpressure)", () => {
    const stdin = new PassThrough({ highWaterMark: 1 });
    pipe.attach(stdin);

    // Fill the buffer beyond capacity to trigger backpressure
    // PassThrough with highWaterMark: 1 will return false after first write
    const bigData = Buffer.alloc(1024);
    pipe.pushFrame({ fourCC: "UYVY", xres: 32, yres: 16, frameRateN: 30, frameRateD: 1, data: bigData });
    // Second frame should trigger backpressure drop
    pipe.pushFrame({ fourCC: "UYVY", xres: 32, yres: 16, frameRateN: 30, frameRateD: 1, data: bigData });

    expect(pipe.getDroppedFrames()).toBeGreaterThanOrEqual(1);
  });

  it("does not write when no stdin is attached", () => {
    // No crash, no dropped frame
    pipe.pushFrame({ fourCC: "UYVY", xres: 1920, yres: 1080, frameRateN: 30, frameRateD: 1, data: Buffer.alloc(16) });
    expect(pipe.getDroppedFrames()).toBe(0);
  });

  it("does not write after stdin is destroyed", () => {
    const stdin = new PassThrough();
    stdin.destroy();
    pipe.attach(stdin);

    pipe.pushFrame({ fourCC: "UYVY", xres: 1920, yres: 1080, frameRateN: 30, frameRateD: 1, data: Buffer.alloc(16) });
    expect(pipe.getDroppedFrames()).toBe(0);
  });

  it("detach stops writing", () => {
    const stdin = new PassThrough();
    const chunks: Buffer[] = [];
    stdin.on("data", (chunk) => chunks.push(chunk));
    pipe.attach(stdin);

    pipe.pushFrame({ fourCC: "BGRA", xres: 2, yres: 1, frameRateN: 30, frameRateD: 1, data: Buffer.from([1]) });
    expect(chunks.length).toBe(1);

    pipe.detach();
    pipe.pushFrame({ fourCC: "BGRA", xres: 2, yres: 1, frameRateN: 30, frameRateD: 1, data: Buffer.from([2]) });
    expect(chunks.length).toBe(1); // no new data
  });

  it("destroy resets all state", () => {
    const stdin = new PassThrough();
    pipe.attach(stdin);
    pipe.pushFrame({ fourCC: "UYVY", xres: 1920, yres: 1080, frameRateN: 30, frameRateD: 1, data: Buffer.alloc(16) });
    expect(pipe.getFormat()).not.toBeNull();

    pipe.destroy();
    expect(pipe.getFormat()).toBeNull();
    expect(pipe.getDroppedFrames()).toBe(0);
  });
});
