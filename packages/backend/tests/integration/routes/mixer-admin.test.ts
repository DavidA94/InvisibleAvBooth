import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createSocket } from "dgram";
import type { Socket } from "dgram";
import { buildTestServer, destroyServer, resetServer, loginAsAdmin, loginAs } from "../harness.js";
import type { TestServer } from "../harness.js";
import { encodeOsc, decodeOsc } from "../../../src/mixer/osc/oscCodec.js";

/**
 * A tiny real UDP OSC responder used to test the connection probe end-to-end
 * without hardware. It answers /xinfo with [ip, name, model, firmware]. When
 * `silent` is true it receives but never replies, exercising the timeout path.
 */
function startFakeXAir(silent = false): Promise<{ port: number; close: () => void; socket: Socket }> {
  return new Promise((resolve) => {
    const socket = createSocket("udp4");
    socket.on("message", (packet, rinfo) => {
      if (silent) return;
      const message = decodeOsc(packet);
      if (message?.address === "/xinfo") {
        const reply = encodeOsc("/xinfo", "ssss", ["127.0.0.1", "XR18-FAKE", "XR18", "1.19"]);
        socket.send(reply, rinfo.port, rinfo.address);
      }
    });
    socket.bind(0, "127.0.0.1", () => {
      resolve({ port: (socket.address() as { port: number }).port, close: () => socket.close(), socket });
    });
  });
}

const baseMixer = {
  deviceType: "soundboard",
  label: "Main Mixer",
  host: "127.0.0.1",
  port: 10024,
  metadata: { model: "behringer-xair", channelCount: 8 },
  features: { "gain-control": true, "channel-metering": true, "channel-audio-capture": false },
};

describe("Mixer admin — device CRUD & validation", () => {
  let s: TestServer;

  beforeAll(async () => {
    s = await buildTestServer();
  });
  afterAll(() => destroyServer(s));
  beforeEach(() => resetServer(s));

  it("creates a soundboard device", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send(baseMixer);
    expect(res.status).toBe(201);
    expect(res.body.deviceType).toBe("soundboard");
    expect(res.body.metadata.model).toBe("behringer-xair");
    expect(res.body.features["gain-control"]).toBe(true);
  });

  it("rejects an invalid model", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .post("/api/admin/devices")
      .set("Cookie", cookie)
      .send({ ...baseMixer, metadata: { model: "not-a-mixer", channelCount: 8 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("behringer-xair");
  });

  it("rejects channelCount <= 0", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .post("/api/admin/devices")
      .set("Cookie", cookie)
      .send({ ...baseMixer, metadata: { model: "behringer-xair", channelCount: 0 } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("channelCount");
  });

  it("rejects an unknown feature flag", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .post("/api/admin/devices")
      .set("Cookie", cookie)
      .send({ ...baseMixer, features: { "totally-bogus": true } });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("bogus");
  });

  it("rejects an invalid usbSlotMap when capture is enabled", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .post("/api/admin/devices")
      .set("Cookie", cookie)
      .send({
        ...baseMixer,
        features: { "channel-audio-capture": true },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: { "1": 0 } },
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("usbSlotMap");
  });

  it("accepts a valid usbSlotMap when capture is enabled", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent
      .post("/api/admin/devices")
      .set("Cookie", cookie)
      .send({
        ...baseMixer,
        features: { "channel-audio-capture": true },
        metadata: { model: "behringer-xair", channelCount: 8, usbSlotMap: { "1": 1, "2": 3 } },
      });
    expect(res.status).toBe(201);
  });

  it("update re-validates merged values", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const created = await s.agent.post("/api/admin/devices").set("Cookie", cookie).send(baseMixer);
    const res = await s.agent
      .put(`/api/admin/devices/${created.body.id as string}`)
      .set("Cookie", cookie)
      .send({ metadata: { model: "behringer-xair", channelCount: -3 } });
    expect(res.status).toBe(400);
  });

  it("non-admin cannot create a mixer device", async () => {
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol1", "pass", "AvVolunteer");
    const res = await s.agent.post("/api/admin/devices").set("Cookie", volCookie).send(baseMixer);
    expect(res.status).toBe(403);
  });
});

describe("Mixer admin — presets", () => {
  let s: TestServer;
  let adminCookie: string;

  beforeAll(async () => {
    s = await buildTestServer();
  });
  afterAll(() => destroyServer(s));
  beforeEach(async () => {
    resetServer(s);
    adminCookie = await loginAsAdmin(s.agent, s.ctx.authService);
    s.ctx.database
      .prepare("INSERT INTO device_connections (id, deviceType, label, host, port, metadata, features, createdAt) VALUES (?,?,?,?,?,?,?,?)")
      .run("mix1", "soundboard", "Mixer", "127.0.0.1", 10024, JSON.stringify({ model: "behringer-xair", channelCount: 8 }), "{}", new Date().toISOString());
  });

  it("preset CRUD lifecycle", async () => {
    const createRes = await s.agent
      .post("/api/admin/mixers/mix1/presets")
      .set("Cookie", adminCookie)
      .send({ name: "Singers", payload: { "/ch/01/mix/fader": 0.75, "/ch/01/mix/on": 1 } });
    expect(createRes.status).toBe(201);
    expect(createRes.body.name).toBe("Singers");
    expect(createRes.body.payload["/ch/01/mix/fader"]).toBe(0.75);
    const presetId = createRes.body.id;

    const listRes = await s.agent.get("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie);
    expect(listRes.body).toHaveLength(1);

    const updateRes = await s.agent
      .put(`/api/admin/mixers/mix1/presets/${presetId as string}`)
      .set("Cookie", adminCookie)
      .send({ name: "Choir" });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toBe("Choir");

    const delRes = await s.agent.delete(`/api/admin/mixers/mix1/presets/${presetId as string}`).set("Cookie", adminCookie);
    expect(delRes.status).toBe(204);

    const listRes2 = await s.agent.get("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie);
    expect(listRes2.body).toHaveLength(0);
  });

  it("reorder persists sortOrder", async () => {
    await s.agent.post("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie).send({ name: "A" });
    await s.agent.post("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie).send({ name: "B" });
    await s.agent.post("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie).send({ name: "C" });

    const list = await s.agent.get("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie);
    const ids = list.body.map((p: { id: string }) => p.id);
    const reversed = [...ids].reverse();
    await s.agent.put("/api/admin/mixers/mix1/presets/order").set("Cookie", adminCookie).send({ presetIds: reversed });

    const reordered = await s.agent.get("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie);
    expect(reordered.body[0].id).toBe(reversed[0]);
  });

  it("cascade delete removes presets when device deleted", async () => {
    await s.agent.post("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie).send({ name: "ToDelete" });
    await s.agent.delete("/api/admin/devices/mix1").set("Cookie", adminCookie);
    const count = s.ctx.database.prepare("SELECT COUNT(*) as c FROM mixer_presets WHERE mixerId = 'mix1'").get() as { c: number };
    expect(count.c).toBe(0);
  });

  it("rejects a non-object payload", async () => {
    const res = await s.agent
      .post("/api/admin/mixers/mix1/presets")
      .set("Cookie", adminCookie)
      .send({ name: "Bad", payload: [1, 2, 3] });
    expect(res.status).toBe(400);
  });

  it("POST returns 400 without a name", async () => {
    const res = await s.agent.post("/api/admin/mixers/mix1/presets").set("Cookie", adminCookie).send({});
    expect(res.status).toBe(400);
  });

  it("non-admin rejected on preset routes (403 sweep)", async () => {
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol2", "pass", "AvVolunteer");
    expect((await s.agent.get("/api/admin/mixers/mix1/presets").set("Cookie", volCookie)).status).toBe(403);
    expect((await s.agent.post("/api/admin/mixers/mix1/presets").set("Cookie", volCookie).send({ name: "x" })).status).toBe(403);
  });
});

describe("Mixer admin — connection probe", () => {
  let s: TestServer;

  beforeAll(async () => {
    s = await buildTestServer();
  });
  afterAll(() => destroyServer(s));
  beforeEach(() => resetServer(s));

  it("reports success with model/firmware when the mixer replies", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const fake = await startFakeXAir(false);
    try {
      const res = await s.agent.post("/api/admin/mixers/probe").set("Cookie", cookie).send({ host: "127.0.0.1", port: fake.port });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.model).toBe("XR18");
      expect(res.body.firmware).toBe("1.19");
    } finally {
      fake.close();
    }
  });

  it("reports failure with a reason on timeout (no reply)", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const fake = await startFakeXAir(true);
    try {
      const res = await s.agent.post("/api/admin/mixers/probe").set("Cookie", cookie).send({ host: "127.0.0.1", port: fake.port });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(false);
      expect(res.body.reason).toContain("no response");
    } finally {
      fake.close();
    }
  });

  it("returns 400 without host/port", async () => {
    const cookie = await loginAsAdmin(s.agent, s.ctx.authService);
    const res = await s.agent.post("/api/admin/mixers/probe").set("Cookie", cookie).send({ host: "127.0.0.1" });
    expect(res.status).toBe(400);
  });

  it("non-admin rejected on probe (403)", async () => {
    const volCookie = await loginAs(s.agent, s.ctx.authService, "vol3", "pass", "AvVolunteer");
    const res = await s.agent.post("/api/admin/mixers/probe").set("Cookie", volCookie).send({ host: "127.0.0.1", port: 10024 });
    expect(res.status).toBe(403);
  });
});
