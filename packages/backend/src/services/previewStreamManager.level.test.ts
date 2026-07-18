import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "events";
import { parseLevelMessage, attachLevelParser, buildLevelArgs, LEVEL_PEAK_REGEX } from "./previewStreamManager.js";
import type { ChildProcess } from "child_process";

vi.mock("../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../eventBus/eventBus.js", () => ({
  eventBus: { emit: vi.fn(), subscribe: vi.fn() },
}));

vi.mock("ws", () => ({
  WebSocketServer: class {
    close = vi.fn();
  },
  WebSocket: { OPEN: 1, CLOSED: 3 },
}));

vi.mock("child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

describe("parseLevelMessage", () => {
  it("parses independent L/R values", () => {
    const line = "/GstPipeline:pipeline0/GstLevel:level0: peak, GstValueList:(double)-20.5, (double)-6.3;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: -20.5, right: -6.3 });
  });

  it("parses identical L/R values", () => {
    const line = "/GstPipeline:pipeline0/GstLevel:level0: peak, GstValueList:(double)-15.0, (double)-15.0;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: -15, right: -15 });
  });

  it("clamps silence (-inf) to -60", () => {
    const line = "/GstPipeline:pipeline0/GstLevel:level0: peak, GstValueList:(double)-inf, (double)-inf;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: -60, right: -60 });
  });

  it("clamps values below -60 to -60", () => {
    const line = "peak, GstValueList:(double)-80.5, (double)-120.0;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: -60, right: -60 });
  });

  it("clamps values above 0 to 0", () => {
    const line = "peak, GstValueList:(double)3.5, (double)1.2;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: 0, right: 0 });
  });

  it("returns null for malformed lines", () => {
    expect(parseLevelMessage("some random gstreamer output")).toBeNull();
    expect(parseLevelMessage("")).toBeNull();
    expect(parseLevelMessage("rms, GstValueList:(double)-20, (double)-18;")).toBeNull();
  });

  it("returns null for lines without level data", () => {
    expect(parseLevelMessage("/GstPipeline:pipeline0/GstLevel:level0: timestamp, 1234567890;")).toBeNull();
  });

  it("parses values in scientific notation", () => {
    const line = "peak, GstValueList:(double)-1.5e+1, (double)-3.0e+0;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: -15, right: -3 });
  });

  it("handles zero dB (maximum signal)", () => {
    const line = "peak, GstValueList:(double)0, (double)0;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: 0, right: 0 });
  });

  it("handles exactly -60 dB (display floor)", () => {
    const line = "peak, GstValueList:(double)-60, (double)-60;";
    const result = parseLevelMessage(line);
    expect(result).toEqual({ left: -60, right: -60 });
  });
});

describe("LEVEL_PEAK_REGEX", () => {
  it("matches standard level output format", () => {
    const line = "peak, GstValueList:(double)-20.5, (double)-18.3;";
    expect(LEVEL_PEAK_REGEX.test(line)).toBe(true);
  });

  it("does not match rms lines", () => {
    const line = "rms, GstValueList:(double)-25.0, (double)-22.0;";
    expect(LEVEL_PEAK_REGEX.test(line)).toBe(false);
  });
});

describe("attachLevelParser", () => {
  let fakeStdout: EventEmitter & { resume?: () => void; setEncoding?: () => void };
  let fakeProcess: ChildProcess;
  let onLevel: ReturnType<typeof vi.fn> & ((levels: { left: number; right: number }) => void);

  beforeEach(() => {
    // readline's createInterface expects a Readable-like input with resume() and setEncoding()
    fakeStdout = new EventEmitter() as EventEmitter & { resume?: () => void; setEncoding?: () => void };
    fakeStdout.resume = vi.fn();
    fakeStdout.setEncoding = vi.fn();
    fakeProcess = { stdout: fakeStdout } as unknown as ChildProcess;
    onLevel = vi.fn() as typeof onLevel;
  });

  afterEach(() => {
    fakeStdout.removeAllListeners();
  });

  it("emits parsed level values on valid lines", async () => {
    attachLevelParser(fakeProcess, onLevel);
    fakeStdout.emit("data", Buffer.from("peak, GstValueList:(double)-20.0, (double)-10.0;\n"));
    // Wait for microtask (queueMicrotask)
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onLevel).toHaveBeenCalledWith({ left: -20, right: -10 });
  });

  it("ignores non-level lines", async () => {
    attachLevelParser(fakeProcess, onLevel);
    fakeStdout.emit("data", Buffer.from("some other gstreamer output\n"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onLevel).not.toHaveBeenCalled();
  });

  it("coalesces multiple lines per tick — only emits latest", async () => {
    attachLevelParser(fakeProcess, onLevel);
    // Emit multiple lines in a single synchronous block (simulates event loop stall)
    fakeStdout.emit(
      "data",
      Buffer.from(
        "peak, GstValueList:(double)-30.0, (double)-30.0;\n" +
          "peak, GstValueList:(double)-20.0, (double)-20.0;\n" +
          "peak, GstValueList:(double)-10.0, (double)-5.0;\n",
      ),
    );
    // Wait for microtask
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Only the latest reading should be emitted
    expect(onLevel).toHaveBeenCalledTimes(1);
    expect(onLevel).toHaveBeenCalledWith({ left: -10, right: -5 });
  });

  it("emits separately for lines arriving in different ticks", async () => {
    attachLevelParser(fakeProcess, onLevel);
    fakeStdout.emit("data", Buffer.from("peak, GstValueList:(double)-20.0, (double)-20.0;\n"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    fakeStdout.emit("data", Buffer.from("peak, GstValueList:(double)-10.0, (double)-10.0;\n"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onLevel).toHaveBeenCalledTimes(2);
    expect(onLevel).toHaveBeenNthCalledWith(1, { left: -20, right: -20 });
    expect(onLevel).toHaveBeenNthCalledWith(2, { left: -10, right: -10 });
  });

  it("does not emit when process has no stdout", async () => {
    const noStdout = { stdout: null } as unknown as ChildProcess;
    attachLevelParser(noStdout, onLevel);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onLevel).not.toHaveBeenCalled();
  });
});

describe("buildLevelArgs", () => {
  it("produces gstreamer level pipeline args", () => {
    const args = buildLevelArgs("OBS_OUTPUT");
    expect(args).toContain("-m");
    expect(args).toContain("-q");
    expect(args).toContain('ndi-name="OBS_OUTPUT"');
    expect(args).toContain("level");
    expect(args).toContain("interval=100000000");
    expect(args).toContain("post-messages=true");
    expect(args).toContain("fakesink");
    expect(args).toContain("audio/x-raw,channels=2");
  });

  it("does not include fdsink (output is via stdout messages, not audio data)", () => {
    const args = buildLevelArgs("OBS");
    expect(args).not.toContain("fdsink");
    expect(args).not.toContain("fd=1");
  });
});
