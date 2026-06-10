import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalizeZoom,
  denormalizeZoom,
  normalizeFocus,
  denormalizeFocus,
  normalizePan,
  denormalizePan,
  buildViscaPositionFromResponse,
  ViscaCameraDriver,
} from "./ViscaCameraDriver.js";

// Mock the net.Socket
interface MockSocketInstance {
  handlers: Record<string, ((...args: unknown[]) => void)[]>;
  destroyed: boolean;
  timeout: number;
  on: (event: string, handler: (...args: unknown[]) => void) => MockSocketInstance;
  setTimeout: (ms: number) => void;
  connect: (port: number, host: string) => void;
  write: (data: Buffer, cb?: (err?: Error) => void) => boolean;
  destroy: () => void;
  emit: (event: string, ...args: unknown[]) => void;
}

let mockSocketInstance: MockSocketInstance;

vi.mock("net", () => {
  class MockSocket {
    handlers: Record<string, ((...args: unknown[]) => void)[]> = {};
    destroyed = false;
    timeout = 0;

    constructor() {
      mockSocketInstance = this as unknown as MockSocketInstance;
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers[event] = this.handlers[event] ?? [];
      this.handlers[event]!.push(handler);
      return this;
    }

    setTimeout(ms: number) {
      this.timeout = ms;
    }

    connect(_port: number, _host: string) {
      // Does NOT auto-emit connect — tests control this
    }

    write(_data: Buffer, cb?: (err?: Error) => void) {
      cb?.();
      return true;
    }

    destroy() {
      this.destroyed = true;
    }

    emit(event: string, ...args: unknown[]) {
      this.handlers[event]?.forEach((h) => h(...args));
    }
  }

  return { Socket: MockSocket };
});

describe("ViscaCameraDriver — normalization utilities", () => {
  it("normalizeZoom maps 0 to 0 and max to 1", () => {
    expect(normalizeZoom(0)).toBe(0);
    expect(normalizeZoom(0x4000)).toBe(1);
    expect(normalizeZoom(0x2000)).toBe(0.5);
  });

  it("denormalizeZoom is inverse of normalizeZoom", () => {
    expect(denormalizeZoom(0)).toBe(0);
    expect(denormalizeZoom(1)).toBe(0x4000);
    expect(denormalizeZoom(0.5)).toBe(0x2000);
  });

  it("normalizeFocus maps 0 to 0 and max to 1", () => {
    expect(normalizeFocus(0)).toBe(0);
    expect(normalizeFocus(0x4000)).toBe(1);
  });

  it("denormalizeFocus is inverse of normalizeFocus", () => {
    expect(denormalizeFocus(0)).toBe(0);
    expect(denormalizeFocus(1)).toBe(0x4000);
  });

  it("normalizePan handles positive values (right of center)", () => {
    expect(normalizePan(0)).toBe(0);
    expect(normalizePan(0x7fff)).toBeCloseTo(1, 2);
  });

  it("normalizePan handles negative values (left of center)", () => {
    expect(normalizePan(0xffff)).toBeCloseTo(-1 / (0xffff / 2), 2);
  });

  it("denormalizePan handles positive values", () => {
    expect(denormalizePan(0)).toBe(0);
    const result = denormalizePan(0.5);
    expect(result).toBeGreaterThan(0);
  });

  it("denormalizePan handles negative values (wraps to unsigned)", () => {
    const result = denormalizePan(-0.5);
    expect(result).toBeGreaterThan(0x7fff);
  });

  it("buildViscaPositionFromResponse extracts nibbles correctly", () => {
    const buf = Buffer.from([0x90, 0x50, 0x01, 0x02, 0x03, 0x04, 0xff]);
    expect(buildViscaPositionFromResponse(buf)).toBe(0x1234);
  });

  it("buildViscaPositionFromResponse returns 0 for short buffer", () => {
    expect(buildViscaPositionFromResponse(Buffer.from([0x90, 0x50, 0x01]))).toBe(0);
  });
});

describe("ViscaCameraDriver — connection", () => {
  let driver: ViscaCameraDriver;

  beforeEach(() => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
  });

  it("connects successfully", async () => {
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    const result = await connectPromise;
    expect(result).toBe(true);
    expect(driver.isConnected()).toBe(true);
  });

  it("returns false on error event", async () => {
    const connectPromise = driver.connect();
    mockSocketInstance.emit("error", new Error("ECONNREFUSED"));
    const result = await connectPromise;
    expect(result).toBe(false);
    expect(driver.isConnected()).toBe(false);
  });

  it("returns false on timeout event and destroys socket", async () => {
    const connectPromise = driver.connect();
    mockSocketInstance.emit("timeout");
    const result = await connectPromise;
    expect(result).toBe(false);
    expect(mockSocketInstance.destroyed).toBe(true);
  });

  it("sets connected to false on close event", async () => {
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
    expect(driver.isConnected()).toBe(true);
    mockSocketInstance.emit("close");
    expect(driver.isConnected()).toBe(false);
  });

  it("disconnects cleanly", async () => {
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
    driver.disconnect();
    expect(driver.isConnected()).toBe(false);
  });

  it("isConnected returns false before connect", () => {
    expect(driver.isConnected()).toBe(false);
  });
});

describe("ViscaCameraDriver — sendCommand", () => {
  let driver: ViscaCameraDriver;

  beforeEach(async () => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
  });

  it("rejects when not connected", async () => {
    driver.disconnect();
    await expect(driver.probe()).resolves.toBe(false);
  });

  it("rejects on write error", async () => {
    // Override write to pass an error
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.(new Error("write failure"));
      return true;
    };
    await expect(driver.probe()).resolves.toBe(false);
  });

  it("rejects on timeout", async () => {
    vi.useFakeTimers();
    // write succeeds but no response comes
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      return true;
    };
    const probePromise = driver.probe();
    vi.advanceTimersByTime(2000);
    const result = await probePromise;
    expect(result).toBe(false);
    vi.useRealTimers();
  });
});

describe("ViscaCameraDriver — processBuffer", () => {
  let driver: ViscaCameraDriver;

  beforeEach(async () => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
  });

  it("skips ACK packets and resolves with the completion packet", async () => {
    // Override write so we can control response timing
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      // Simulate an ACK (y0 4x FF) followed by a completion (y0 50 02 FF)
      setTimeout(() => {
        const ack = Buffer.from([0x90, 0x41, 0xff]);
        const completion = Buffer.from([0x90, 0x50, 0x02, 0xff]);
        mockSocketInstance.emit("data", Buffer.concat([ack, completion]));
      }, 0);
      return true;
    };
    const result = await driver.probe();
    expect(result).toBe(true);
  });

  it("handles split packets across multiple data events", async () => {
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      // Send response in two parts
      setTimeout(() => {
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x50]));
        mockSocketInstance.emit("data", Buffer.from([0x02, 0xff]));
      }, 0);
      return true;
    };
    const result = await driver.probe();
    expect(result).toBe(true);
  });

  it("handles no terminator until second chunk arrives", async () => {
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      setTimeout(() => {
        // First chunk has no terminator
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x50, 0x02]));
        // Second chunk completes it
        mockSocketInstance.emit("data", Buffer.from([0xff]));
      }, 0);
      return true;
    };
    const result = await driver.probe();
    expect(result).toBe(true);
  });
});

describe("ViscaCameraDriver — probe", () => {
  let driver: ViscaCameraDriver;

  beforeEach(async () => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
  });

  it("returns true on valid power inquiry response", async () => {
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      setTimeout(() => {
        // Response: 90 50 02 FF (power on)
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x50, 0x02, 0xff]));
      }, 0);
      return true;
    };
    const result = await driver.probe();
    expect(result).toBe(true);
  });

  it("returns false for invalid response (wrong byte at [1])", async () => {
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      setTimeout(() => {
        // Response with byte[1] != 0x50
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x60, 0x02, 0xff]));
      }, 0);
      return true;
    };
    const result = await driver.probe();
    expect(result).toBe(false);
  });

  it("returns false for too-short response", async () => {
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      setTimeout(() => {
        // Only 3 bytes including terminator: [90 50 FF] — length 3 but resp[1] is 0x50, length >= 4 is false
        mockSocketInstance.emit("data", Buffer.from([0x90, 0xff]));
      }, 0);
      return true;
    };
    const result = await driver.probe();
    expect(result).toBe(false);
  });

  it("returns false when not connected", async () => {
    driver.disconnect();
    const result = await driver.probe();
    expect(result).toBe(false);
  });
});

describe("ViscaCameraDriver — inquirePosition", () => {
  let driver: ViscaCameraDriver;
  let commandIndex: number;

  beforeEach(async () => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
    commandIndex = 0;
  });

  it("returns null fields when not connected", async () => {
    driver.disconnect();
    const pos = await driver.inquirePosition();
    expect(pos.pan).toBeNull();
    expect(pos.tilt).toBeNull();
    expect(pos.zoom).toBeNull();
    expect(pos.focus).toBeNull();
    expect(pos.autoFocus).toBeNull();
  });

  it("parses all position inquiries successfully", async () => {
    // Responses sent per command:
    // 1. Pan/tilt: y0 50 0p 0q 0r 0s 0p 0q 0r 0s FF (11 bytes)
    // 2. Zoom: y0 50 0p 0q 0r 0s FF (7 bytes)
    // 3. Focus: y0 50 0p 0q 0r 0s FF (7 bytes)
    // 4. AutoFocus mode: y0 50 02 FF (4 bytes, 0x02 = auto)
    const responses = [
      // Pan=0x1234, Tilt=0x5678
      Buffer.from([0x90, 0x50, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0xff]),
      // Zoom=0x2000
      Buffer.from([0x90, 0x50, 0x02, 0x00, 0x00, 0x00, 0xff]),
      // Focus=0x1000
      Buffer.from([0x90, 0x50, 0x01, 0x00, 0x00, 0x00, 0xff]),
      // AutoFocus=on (0x02)
      Buffer.from([0x90, 0x50, 0x02, 0xff]),
    ];

    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      const responseIdx = commandIndex++;
      setTimeout(() => {
        mockSocketInstance.emit("data", responses[responseIdx]!);
      }, 0);
      return true;
    };

    const pos = await driver.inquirePosition();
    expect(pos.pan).not.toBeNull();
    expect(pos.tilt).not.toBeNull();
    expect(pos.zoom).not.toBeNull();
    expect(pos.focus).not.toBeNull();
    expect(pos.autoFocus).toBe(true);
  });

  it("parses autoFocus as false when mode byte is not 0x02", async () => {
    const responses = [
      // Pan/tilt (valid, 11 bytes)
      Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]),
      // Zoom
      Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0xff]),
      // Focus
      Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0xff]),
      // AutoFocus manual (0x03)
      Buffer.from([0x90, 0x50, 0x03, 0xff]),
    ];

    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      const responseIdx = commandIndex++;
      setTimeout(() => {
        mockSocketInstance.emit("data", responses[responseIdx]!);
      }, 0);
      return true;
    };

    const pos = await driver.inquirePosition();
    expect(pos.autoFocus).toBe(false);
  });

  it("returns null for pan/tilt when response is too short", async () => {
    const responses = [
      // Pan/tilt too short (only 7 bytes, need 11)
      Buffer.from([0x90, 0x50, 0x01, 0x02, 0x03, 0x04, 0xff]),
      Buffer.from([0x90, 0x50, 0x02, 0x00, 0x00, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x01, 0x00, 0x00, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x02, 0xff]),
    ];

    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      const responseIdx = commandIndex++;
      setTimeout(() => {
        mockSocketInstance.emit("data", responses[responseIdx]!);
      }, 0);
      return true;
    };

    const pos = await driver.inquirePosition();
    // Pan/tilt response is 7 bytes which is < 11, so pan/tilt stay null
    expect(pos.pan).toBeNull();
    expect(pos.tilt).toBeNull();
    // But zoom, focus, autoFocus should parse
    expect(pos.zoom).not.toBeNull();
    expect(pos.focus).not.toBeNull();
    expect(pos.autoFocus).toBe(true);
  });

  it("returns null for zoom when response is too short", async () => {
    const responses = [
      Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]),
      // Zoom too short (< 7)
      Buffer.from([0x90, 0x50, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x01, 0x00, 0x00, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x02, 0xff]),
    ];

    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      const responseIdx = commandIndex++;
      setTimeout(() => {
        mockSocketInstance.emit("data", responses[responseIdx]!);
      }, 0);
      return true;
    };

    const pos = await driver.inquirePosition();
    expect(pos.zoom).toBeNull();
    expect(pos.focus).not.toBeNull();
  });

  it("returns null for focus when response is too short", async () => {
    const responses = [
      Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x02, 0x00, 0x00, 0x00, 0xff]),
      // Focus too short
      Buffer.from([0x90, 0x50, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x02, 0xff]),
    ];

    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      const responseIdx = commandIndex++;
      setTimeout(() => {
        mockSocketInstance.emit("data", responses[responseIdx]!);
      }, 0);
      return true;
    };

    const pos = await driver.inquirePosition();
    expect(pos.focus).toBeNull();
  });

  it("returns null for autoFocus when response is too short", async () => {
    const responses = [
      Buffer.from([0x90, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x02, 0x00, 0x00, 0x00, 0xff]),
      Buffer.from([0x90, 0x50, 0x01, 0x00, 0x00, 0x00, 0xff]),
      // AutoFocus too short (< 4 bytes excluding terminator — we need at least [90 50 xx FF])
      Buffer.from([0x90, 0x50, 0xff]),
    ];

    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.();
      const responseIdx = commandIndex++;
      setTimeout(() => {
        mockSocketInstance.emit("data", responses[responseIdx]!);
      }, 0);
      return true;
    };

    const pos = await driver.inquirePosition();
    expect(pos.autoFocus).toBeNull();
  });
});
