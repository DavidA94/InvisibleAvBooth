import { describe, it, expect, vi, beforeEach } from "vitest";
import { buildViscaPositionFromResponse, ViscaCameraDriver } from "./ViscaCameraDriver.js";

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
    // After disconnect, inquirePosition calls ensureConnected which attempts reconnect.
    // Simulate the reconnection failing (socket timeout) so the driver remains disconnected.
    const positionPromise = driver.inquirePosition();
    // The new Socket() from the reconnect attempt assigns to mockSocketInstance
    // Emit timeout to simulate unreachable camera — connect() resolves with false
    mockSocketInstance.emit("timeout");
    const pos = await positionPromise;
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

describe("ViscaCameraDriver — PTZ commands", () => {
  let driver: ViscaCameraDriver;
  let writtenBuffers: Buffer[];

  beforeEach(async () => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
    writtenBuffers = [];

    // Default mock: ACK then completion for every command
    mockSocketInstance.write = (data: Buffer, cb?: (err?: Error) => void) => {
      writtenBuffers.push(Buffer.from(data));
      cb?.();
      setTimeout(() => {
        // ACK
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x41, 0xff]));
        // Completion
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x51, 0xff]));
      }, 0);
      return true;
    };
  });

  describe("panTiltSpeed", () => {
    it("sends correct VISCA command for positive pan and tilt", async () => {
      await driver.panTiltSpeed(0.5, 0.5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[0]).toBe(0x81);
      expect(cmd[1]).toBe(0x01);
      expect(cmd[2]).toBe(0x06);
      expect(cmd[3]).toBe(0x01);
      // panDir = 0x02 (right), tiltDir = 0x01 (up? positive = down per VISCA)
      expect(cmd[6]).toBe(0x02); // pan right
      expect(cmd[7]).toBe(0x01); // tilt positive
    });

    it("sends correct direction for negative pan and tilt", async () => {
      await driver.panTiltSpeed(-0.5, -0.5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[6]).toBe(0x01); // pan left
      expect(cmd[7]).toBe(0x02); // tilt negative
    });

    it("sends stop direction (0x03) for zero speed", async () => {
      await driver.panTiltSpeed(0, 0);
      const cmd = writtenBuffers[0]!;
      expect(cmd[6]).toBe(0x03); // pan stop
      expect(cmd[7]).toBe(0x03); // tilt stop
    });

    it("clamps pan speed to max 0x18", async () => {
      await driver.panTiltSpeed(5.0, 0);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]).toBe(0x18); // max pan speed
    });

    it("clamps tilt speed to max 0x14", async () => {
      await driver.panTiltSpeed(0, 5.0);
      const cmd = writtenBuffers[0]!;
      expect(cmd[5]).toBe(0x14); // max tilt speed
    });

    it("ensures minimum speed of 1", async () => {
      await driver.panTiltSpeed(0.001, 0.001);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]).toBeGreaterThanOrEqual(1);
      expect(cmd[5]).toBeGreaterThanOrEqual(1);
    });
  });

  describe("panTiltAbsolute", () => {
    it("sends correct VISCA pan/tilt absolute command", async () => {
      await driver.panTiltAbsolute(0x1234, 0x5678);
      const cmd = writtenBuffers[0]!;
      expect(cmd[0]).toBe(0x81);
      expect(cmd[1]).toBe(0x01);
      expect(cmd[2]).toBe(0x06);
      expect(cmd[3]).toBe(0x02);
      // Pan nibbles: 1, 2, 3, 4
      expect(cmd[6]).toBe(0x01);
      expect(cmd[7]).toBe(0x02);
      expect(cmd[8]).toBe(0x03);
      expect(cmd[9]).toBe(0x04);
      // Tilt nibbles: 5, 6, 7, 8
      expect(cmd[10]).toBe(0x05);
      expect(cmd[11]).toBe(0x06);
      expect(cmd[12]).toBe(0x07);
      expect(cmd[13]).toBe(0x08);
    });

    it("masks values to 16-bit", async () => {
      await driver.panTiltAbsolute(0x1ffff, 0x1ffff);
      const cmd = writtenBuffers[0]!;
      // 0x1ffff & 0xffff = 0xffff → nibbles: f, f, f, f
      expect(cmd[6]).toBe(0x0f);
      expect(cmd[7]).toBe(0x0f);
      expect(cmd[8]).toBe(0x0f);
      expect(cmd[9]).toBe(0x0f);
    });
  });

  describe("zoomAbsolute", () => {
    it("sends correct VISCA zoom absolute command", async () => {
      await driver.zoomAbsolute(0x2000);
      const cmd = writtenBuffers[0]!;
      expect(cmd[0]).toBe(0x81);
      expect(cmd[1]).toBe(0x01);
      expect(cmd[2]).toBe(0x04);
      expect(cmd[3]).toBe(0x47);
      // 0x2000 nibbles: 2, 0, 0, 0
      expect(cmd[4]).toBe(0x02);
      expect(cmd[5]).toBe(0x00);
      expect(cmd[6]).toBe(0x00);
      expect(cmd[7]).toBe(0x00);
    });
  });

  describe("zoomSpeed", () => {
    it("sends tele command for positive speed", async () => {
      await driver.zoomSpeed(0.5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[2]).toBe(0x04);
      expect(cmd[3]).toBe(0x07);
      // 0x20 | (0.5*7 ≈ 4) = 0x24
      expect(cmd[4]! & 0xf0).toBe(0x20);
    });

    it("sends wide command for negative speed", async () => {
      await driver.zoomSpeed(-0.5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]! & 0xf0).toBe(0x30);
    });

    it("sends stop command for zero speed", async () => {
      await driver.zoomSpeed(0);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]).toBe(0x00);
    });

    it("clamps speed to 0-7 range", async () => {
      await driver.zoomSpeed(5.0);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]! & 0x0f).toBe(7);
    });
  });

  describe("focusAuto", () => {
    it("sends auto focus command", async () => {
      await driver.focusAuto();
      const cmd = writtenBuffers[0]!;
      expect(cmd[0]).toBe(0x81);
      expect(cmd[1]).toBe(0x01);
      expect(cmd[2]).toBe(0x04);
      expect(cmd[3]).toBe(0x38);
      expect(cmd[4]).toBe(0x02);
    });
  });

  describe("focusManual", () => {
    it("sends manual focus mode then position command", async () => {
      await driver.focusManual(0x1000);
      // Should have sent 2 commands
      expect(writtenBuffers.length).toBe(2);
      // First: switch to manual (81 01 04 38 03 FF)
      expect(writtenBuffers[0]![3]).toBe(0x38);
      expect(writtenBuffers[0]![4]).toBe(0x03);
      // Second: set position (81 01 04 48 ...)
      expect(writtenBuffers[1]![3]).toBe(0x48);
      // 0x1000 nibbles: 1, 0, 0, 0
      expect(writtenBuffers[1]![4]).toBe(0x01);
      expect(writtenBuffers[1]![5]).toBe(0x00);
    });

    it("masks position to 14-bit (0x3fff)", async () => {
      await driver.focusManual(0x7fff);
      const cmd = writtenBuffers[1]!;
      // 0x7fff & 0x3fff = 0x3fff → nibbles: 3, f, f, f
      expect(cmd[4]).toBe(0x03);
      expect(cmd[5]).toBe(0x0f);
      expect(cmd[6]).toBe(0x0f);
      expect(cmd[7]).toBe(0x0f);
    });
  });

  describe("focusSpeed", () => {
    it("sends far command for positive speed", async () => {
      await driver.focusSpeed(0.5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[3]).toBe(0x08);
      expect(cmd[4]! & 0xf0).toBe(0x20);
    });

    it("sends near command for negative speed", async () => {
      await driver.focusSpeed(-0.5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]! & 0xf0).toBe(0x30);
    });

    it("sends stop for zero", async () => {
      await driver.focusSpeed(0);
      const cmd = writtenBuffers[0]!;
      expect(cmd[4]).toBe(0x00);
    });
  });

  describe("stop", () => {
    it("sends pan/tilt stop command", async () => {
      await driver.stop();
      const cmd = writtenBuffers[0]!;
      expect(cmd[0]).toBe(0x81);
      expect(cmd[1]).toBe(0x01);
      expect(cmd[2]).toBe(0x06);
      expect(cmd[3]).toBe(0x01);
      expect(cmd[6]).toBe(0x03); // pan stop
      expect(cmd[7]).toBe(0x03); // tilt stop
    });
  });

  describe("presetRecall", () => {
    it("sends preset recall command", async () => {
      await driver.presetRecall(5);
      const cmd = writtenBuffers[0]!;
      expect(cmd[0]).toBe(0x81);
      expect(cmd[3]).toBe(0x3f);
      expect(cmd[4]).toBe(0x02); // recall
      expect(cmd[5]).toBe(5);
    });

    it("clamps slot to 0-255", async () => {
      await driver.presetRecall(300);
      const cmd = writtenBuffers[0]!;
      expect(cmd[5]).toBe(255);
    });
  });

  describe("presetStore", () => {
    it("sends preset store command", async () => {
      await driver.presetStore(3);
      const cmd = writtenBuffers[0]!;
      expect(cmd[3]).toBe(0x3f);
      expect(cmd[4]).toBe(0x01); // store
      expect(cmd[5]).toBe(3);
    });
  });
});

describe("ViscaCameraDriver — command queue", () => {
  let driver: ViscaCameraDriver;
  let writtenBuffers: Buffer[];
  let pendingCallbacks: Array<() => void>;

  beforeEach(async () => {
    driver = new ViscaCameraDriver("192.168.1.100", 5678);
    const connectPromise = driver.connect();
    mockSocketInstance.emit("connect");
    await connectPromise;
    writtenBuffers = [];
    pendingCallbacks = [];

    // Mock that captures writes but doesn't auto-respond
    mockSocketInstance.write = (data: Buffer, cb?: (err?: Error) => void) => {
      writtenBuffers.push(Buffer.from(data));
      cb?.();
      pendingCallbacks.push(() => {
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x41, 0xff]));
        mockSocketInstance.emit("data", Buffer.from([0x90, 0x51, 0xff]));
      });
      return true;
    };
  });

  it("queues commands when one is in-flight", async () => {
    // Start first command (will pend)
    const p1 = driver.stop();
    await Promise.resolve(); // let ensureConnected resolve
    // Start second command (will be queued)
    const p2 = driver.focusAuto();
    await Promise.resolve(); // let ensureConnected resolve

    // Only first written so far
    expect(writtenBuffers.length).toBe(1);

    // Complete first command
    pendingCallbacks[0]!();
    await p1;

    // Now second should be sent
    expect(writtenBuffers.length).toBe(2);
    pendingCallbacks[1]!();
    await p2;
  });

  it("timeout rejects pending sendCommand", async () => {
    vi.useFakeTimers();
    // Don't auto-respond — let it timeout
    mockSocketInstance.write = (data: Buffer, cb?: (err?: Error) => void) => {
      writtenBuffers.push(Buffer.from(data));
      cb?.();
      return true;
    };

    // Use stop() which catches errors internally — it won't reject but will complete
    const p = driver.stop();
    await vi.advanceTimersByTimeAsync(2000);
    // stop() catches the timeout error, so it resolves
    await p;
    vi.useRealTimers();
  });

  it("handles write error gracefully in stop()", async () => {
    mockSocketInstance.write = (_data: Buffer, cb?: (err?: Error) => void) => {
      cb?.(new Error("write failed"));
      return true;
    };

    // stop() catches errors internally
    await driver.stop();
  });

  it("handles write error in drainQueue", async () => {
    let callCount = 0;
    mockSocketInstance.write = (data: Buffer, cb?: (err?: Error) => void) => {
      writtenBuffers.push(Buffer.from(data));
      callCount++;
      if (callCount === 1) {
        // First write succeeds
        cb?.();
        pendingCallbacks.push(() => {
          mockSocketInstance.emit("data", Buffer.from([0x90, 0x41, 0xff]));
          mockSocketInstance.emit("data", Buffer.from([0x90, 0x51, 0xff]));
        });
      } else {
        // Subsequent writes fail
        cb?.(new Error("write failed in drain"));
      }
      return true;
    };

    const p1 = driver.stop();
    await Promise.resolve();
    const p2 = driver.focusAuto(); // will be queued, then fail when draining
    await Promise.resolve();

    pendingCallbacks[0]!();
    await p1;
    // p2 swallows the error (focusAuto catches internally)
    await p2;
  });

  it("handles timeout in drainQueue", async () => {
    vi.useFakeTimers();
    let callCount = 0;
    mockSocketInstance.write = (data: Buffer, cb?: (err?: Error) => void) => {
      writtenBuffers.push(Buffer.from(data));
      cb?.();
      callCount++;
      if (callCount === 1) {
        pendingCallbacks.push(() => {
          mockSocketInstance.emit("data", Buffer.from([0x90, 0x41, 0xff]));
          mockSocketInstance.emit("data", Buffer.from([0x90, 0x51, 0xff]));
        });
      }
      // Second write: no response — will timeout
      return true;
    };

    const p1 = driver.stop();
    await Promise.resolve();
    const p2 = driver.focusAuto(); // queued, will timeout when drained

    pendingCallbacks[0]!();
    await p1;

    // Advance past the timeout for the second command
    vi.advanceTimersByTime(2000);
    await p2; // focusAuto catches the error
    vi.useRealTimers();
  });
});
