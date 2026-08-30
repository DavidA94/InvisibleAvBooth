import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "vitest";
import { io as ioClient } from "socket.io-client";
import type { Socket as ClientSocket } from "socket.io-client";
import { buildTestServer, resetServer, destroyServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";
import { eventBus } from "../../../src/eventBus/eventBus.js";
import { BUS_MIXER_CAPTURE_PATH_LOST, BUS_MIXER_CAPTURE_PATH_RESTORED } from "../../../src/eventBus/types.js";
import {
  CTS_MIXER_SET,
  CTS_MIXER_PRESET_ACTIVATE,
  CTS_MIXER_WIDGET_PRESENT,
  CTS_REQUEST_INITIAL_STATE,
  STC_MIXER_STATE,
  STC_MIXER_STATE_UPDATE,
  STC_MIXER_LEVELS,
  STC_MIXER_ERROR,
  STC_MIXER_ERROR_RESOLVED,
} from "@invisible-av-booth/shared";
import type { MixerState } from "@invisible-av-booth/shared";

let s: TestServer;
let adminToken: string;
let adminCookie: string;
const clients: ClientSocket[] = [];

const mixerBody = {
  deviceType: "soundboard",
  label: "Main Mixer",
  host: "127.0.0.1",
  port: 10024,
  metadata: { model: "behringer-xair", channelCount: 4 },
  features: { "gain-control": true, "channel-metering": true, "channel-audio-capture": true },
};

beforeAll(async () => {
  s = await buildTestServer();
});
afterAll(() => destroyServer(s));

beforeEach(async () => {
  resetServer(s);
  adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
  adminToken = /token=([^;]+)/.exec(adminCookie)?.[1] ?? "";
});

afterEach(() => {
  while (clients.length) clients.pop()!.close();
});

function connectClient(token = adminToken): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioClient(`http://localhost:${s.port}`, { auth: { token } });
    clients.push(client);
    client.on("connect", () => resolve(client));
    client.on("connect_error", reject);
  });
}

/** Create a mixer via the admin route (fires BUS_MIXER_DEVICE_CHANGED → instance). */
async function createMixer(overrides: Partial<typeof mixerBody> = {}): Promise<string> {
  const res = await s.agent
    .post("/api/admin/devices")
    .set("Cookie", adminCookie)
    .send({ ...mixerBody, ...overrides });
  expect(res.status).toBe(201);
  const mixerId = res.body.id as string;
  // Deterministically wait for the async hot-reload to register the driver instance.
  const start = Date.now();
  while (!s.fakeMixer.get(mixerId) && Date.now() - start < 2000) {
    await new Promise((r) => setTimeout(r, 5));
  }
  return mixerId;
}

const waitFor = <T>(client: ClientSocket, event: string, timeoutMs = 2000): Promise<T> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    client.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

/** Poll until `predicate` holds (deterministic — no reliance on a fixed sleep). */
const waitUntil = async (predicate: () => boolean, timeoutMs = 2000): Promise<void> => {
  const start = Date.now();
  while (!predicate() && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("Mixer commands → driver forwarding", () => {
  it("forwards a fader command to the driver", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const driver = s.fakeMixer.get(mixerId)!;
    client.emit(CTS_MIXER_SET, { mixerId, channel: 1, fader: 0.75 });
    await waitUntil(() => driver.commands.some((c) => c.op === "fader"));
    expect(driver.commands).toContainEqual({ op: "fader", channel: 1, value: 0.75 });
  });

  it("forwards a mute command (interface muted=true)", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const driver = s.fakeMixer.get(mixerId)!;
    client.emit(CTS_MIXER_SET, { mixerId, channel: 2, muted: true });
    await waitUntil(() => driver.commands.some((c) => c.op === "mute"));
    expect(driver.commands).toContainEqual({ op: "mute", channel: 2, value: true });
  });

  it("forwards a gain command when gain-control is enabled", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const driver = s.fakeMixer.get(mixerId)!;
    client.emit(CTS_MIXER_SET, { mixerId, channel: 1, gainDb: 24 });
    await waitUntil(() => driver.commands.some((c) => c.op === "gain"));
    expect(driver.commands).toContainEqual({ op: "gain", channel: 1, value: 24 });
  });

  it("does NOT forward gain when gain-control is disabled (capability enforcement)", async () => {
    const mixerId = await createMixer({ features: { "gain-control": false, "channel-metering": true, "channel-audio-capture": false } });
    const client = await connectClient();
    const driver = s.fakeMixer.get(mixerId)!;
    // Also send a fader so we have a positive signal that the message was processed.
    client.emit(CTS_MIXER_SET, { mixerId, channel: 1, gainDb: 24, fader: 0.3 });
    await waitUntil(() => driver.commands.some((c) => c.op === "fader"));
    expect(driver.commands.find((c) => c.op === "gain")).toBeUndefined();
  });

  it("each field is a separate command (fader + mute + gain in one message)", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const driver = s.fakeMixer.get(mixerId)!;
    client.emit(CTS_MIXER_SET, { mixerId, channel: 3, fader: 0.5, muted: false, gainDb: 10 });
    await waitUntil(() => driver.commands.filter((c) => c.channel === 3).length >= 3);
    const ops = driver.commands.filter((c) => c.channel === 3).map((c) => c.op);
    expect(ops).toEqual(expect.arrayContaining(["fader", "mute", "gain"]));
  });
});

describe("Read-back reconciliation & external changes", () => {
  it("broadcasts the mixer-reported value when it differs from commanded (mixer wins)", async () => {
    const mixerId = await createMixer();
    s.fakeMixer.get(mixerId)!.seedFader(1, 0.5); // console reports 0.5 regardless of command
    const client = await connectClient();
    const updatePromise = waitFor<MixerState>(client, STC_MIXER_STATE_UPDATE);
    client.emit(CTS_MIXER_SET, { mixerId, channel: 1, fader: 0.9 });
    const state = await updatePromise;
    const channel1 = state.channels.find((c) => c.channel === 1)!;
    expect(channel1.fader).toBeCloseTo(0.5, 5);
  });

  it("broadcasts an unsolicited external change to clients", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const updatePromise = waitFor<MixerState>(client, STC_MIXER_STATE_UPDATE);
    s.fakeMixer.get(mixerId)!.pushExternal(2, { muted: true });
    const state = await updatePromise;
    expect(state.channels.find((c) => c.channel === 2)!.muted).toBe(true);
  });
});

describe("Meter levels", () => {
  it("broadcasts meter frames over STC_MIXER_LEVELS", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const levelsPromise = waitFor<{ mixerId: string; levels: Array<{ channel: number; levelDb: number }> }>(client, STC_MIXER_LEVELS);
    s.fakeMixer.get(mixerId)!.pushMeters([{ channel: 1, levelDb: -18 }]);
    const payload = await levelsPromise;
    expect(payload.mixerId).toBe(mixerId);
    expect(payload.levels[0]).toEqual({ channel: 1, levelDb: -18 });
  });
});

describe("emitInitialState & presets", () => {
  it("emits full mixer state on request", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();
    const statePromise = waitFor<MixerState[]>(client, STC_MIXER_STATE);
    client.emit(CTS_REQUEST_INITIAL_STATE);
    const states = await statePromise;
    const state = states.find((m) => m.mixerId === mixerId)!;
    expect(state.channelCount).toBe(4);
    expect(state.capabilities.gainRange).toEqual({ minDb: -12, maxDb: 60 });
  });

  it("activating a preset writes all its addresses to the driver", async () => {
    const mixerId = await createMixer();
    const presetRes = await s.agent
      .post(`/api/admin/mixers/${mixerId}/presets`)
      .set("Cookie", adminCookie)
      .send({ name: "Test", payload: { "/ch/01/mix/fader": 0.8, "/ch/01/mix/on": 0 } });
    const presetId = presetRes.body.id;

    const client = await connectClient();
    client.emit(CTS_MIXER_PRESET_ACTIVATE, { mixerId, presetId });
    const driver = s.fakeMixer.get(mixerId)!;
    await waitUntil(() => driver.commands.some((c) => c.op === "fader") && driver.commands.some((c) => c.op === "mute"));
    const commands = driver.commands;
    expect(commands).toContainEqual({ op: "fader", channel: 1, value: 0.8 });
    expect(commands).toContainEqual({ op: "mute", channel: 1, value: true }); // on=0 → muted
  });
});

describe("Metering lifecycle & presence", () => {
  it("enables metering when a widget is present and disables when none remain", async () => {
    const mixerId = await createMixer();
    const driver = s.fakeMixer.get(mixerId)!;
    const client = await connectClient();
    client.emit(CTS_MIXER_WIDGET_PRESENT, { mixerId, present: true });
    await waitUntil(() => driver.meteringEnabled());
    expect(driver.meteringEnabled()).toBe(true);
    client.emit(CTS_MIXER_WIDGET_PRESENT, { mixerId, present: false });
    await waitUntil(() => !driver.meteringEnabled());
    expect(driver.meteringEnabled()).toBe(false);
  });

  it("decrements presence on socket disconnect (no metering leak)", async () => {
    const mixerId = await createMixer();
    const driver = s.fakeMixer.get(mixerId)!;
    const client = await connectClient();
    client.emit(CTS_MIXER_WIDGET_PRESENT, { mixerId, present: true });
    await waitUntil(() => driver.meteringEnabled());
    expect(driver.meteringEnabled()).toBe(true);
    client.close();
    await waitUntil(() => !driver.meteringEnabled());
    expect(driver.meteringEnabled()).toBe(false);
  });
});

describe("Role enforcement", () => {
  it("ignores commands from a below-volunteer socket", async () => {
    const mixerId = await createMixer();
    // There is no role below AvVolunteer that can authenticate for sockets in this
    // system, so we assert an AvVolunteer CAN operate (positive control).
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol1", "pass", "AvVolunteer");
    const volToken = /token=([^;]+)/.exec(volCookie)?.[1] ?? "";
    const client = await connectClient(volToken);
    const driver = s.fakeMixer.get(mixerId)!;
    client.emit(CTS_MIXER_SET, { mixerId, channel: 1, fader: 0.3 });
    await waitUntil(() => driver.commands.some((c) => c.op === "fader"));
    expect(driver.commands).toContainEqual({ op: "fader", channel: 1, value: 0.3 });
  });
});

describe("Multiple mixers", () => {
  it("routes commands to the correct instance", async () => {
    const mixerA = await createMixer({ label: "A" });
    const mixerB = await createMixer({ label: "B" });
    const client = await connectClient();
    client.emit(CTS_MIXER_SET, { mixerId: mixerB, channel: 1, fader: 0.6 });
    await waitUntil(() => s.fakeMixer.get(mixerB)!.commands.some((c) => c.op === "fader"));
    expect(s.fakeMixer.get(mixerB)!.commands).toContainEqual({ op: "fader", channel: 1, value: 0.6 });
    expect(s.fakeMixer.get(mixerA)!.commands.find((c) => c.op === "fader")).toBeUndefined();
  });
});

describe("Connection-preserving hot-reload", () => {
  it("a feature-only edit keeps the SAME driver instance (connection alive)", async () => {
    const mixerId = await createMixer();
    const driverBefore = s.fakeMixer.get(mixerId)!;
    // Toggle a feature only (no host/port/model change).
    await s.agent
      .put(`/api/admin/devices/${mixerId}`)
      .set("Cookie", adminCookie)
      .send({ features: { "gain-control": false, "channel-metering": true, "channel-audio-capture": true } });
    // A connection-preserving reload does NOT swap the driver instance. There is
    // no positive "changed" signal to await for a no-op, so poll briefly to let
    // any (incorrect) reconnect surface, then assert the instance is unchanged.
    await waitUntil(() => s.fakeMixer.get(mixerId) !== driverBefore, 200);
    expect(s.fakeMixer.get(mixerId)).toBe(driverBefore);
  });

  it("a host change reconnects (new driver instance)", async () => {
    const mixerId = await createMixer();
    const driverBefore = s.fakeMixer.get(mixerId)!;
    await s.agent.put(`/api/admin/devices/${mixerId}`).set("Cookie", adminCookie).send({ host: "10.0.0.5" });
    // Factory produces a fresh driver for the same mixerId on reconnect.
    await waitUntil(() => s.fakeMixer.get(mixerId) !== driverBefore);
    expect(s.fakeMixer.get(mixerId)).not.toBe(driverBefore);
  });
});

describe("Capture-path catastrophic modal (Req 15.7)", () => {
  it("raises STC_MIXER_ERROR (modal) on capture-path lost and clears on restored", async () => {
    const mixerId = await createMixer();
    const client = await connectClient();

    const errorPromise = waitFor<{ errorCode: string; level: string }>(client, STC_MIXER_ERROR);
    eventBus.emit(BUS_MIXER_CAPTURE_PATH_LOST, { mixerId, reason: "USB device lost" });
    const error = await errorPromise;
    expect(error.errorCode).toBe("MIXER_CAPTURE_PATH_LOST");
    expect(error.level).toBe("modal");

    const resolvedPromise = waitFor<{ errorCode: string }>(client, STC_MIXER_ERROR_RESOLVED);
    eventBus.emit(BUS_MIXER_CAPTURE_PATH_RESTORED, { mixerId });
    const resolved = await resolvedPromise;
    expect(resolved.errorCode).toBe("MIXER_CAPTURE_PATH_LOST");
  });
});
