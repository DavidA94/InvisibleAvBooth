import { describe, it, expect } from "vitest";
import {
  CTS_OBS_COMMAND,
  CTS_OBS_RECONNECT,
  CTS_SESSION_MANIFEST_UPDATE,
  CTS_REQUEST_INITIAL_STATE,
  STC_OBS_STATE,
  STC_OBS_ERROR,
  STC_OBS_ERROR_RESOLVED,
  STC_SESSION_MANIFEST_UPDATED,
  STC_DEVICE_CAPABILITIES,
} from "./socketEvents";

describe("socketEvents", () => {
  it("client-to-server events use cts: prefix", () => {
    expect(CTS_OBS_COMMAND).toMatch(/^cts:/);
    expect(CTS_OBS_RECONNECT).toMatch(/^cts:/);
    expect(CTS_SESSION_MANIFEST_UPDATE).toMatch(/^cts:/);
    expect(CTS_REQUEST_INITIAL_STATE).toMatch(/^cts:/);
  });

  it("server-to-client events use stc: prefix", () => {
    expect(STC_OBS_STATE).toMatch(/^stc:/);
    expect(STC_OBS_ERROR).toMatch(/^stc:/);
    expect(STC_OBS_ERROR_RESOLVED).toMatch(/^stc:/);
    expect(STC_SESSION_MANIFEST_UPDATED).toMatch(/^stc:/);
    expect(STC_DEVICE_CAPABILITIES).toMatch(/^stc:/);
  });

  it("all event names are unique", () => {
    const allEvents = [
      CTS_OBS_COMMAND,
      CTS_OBS_RECONNECT,
      CTS_SESSION_MANIFEST_UPDATE,
      CTS_REQUEST_INITIAL_STATE,
      STC_OBS_STATE,
      STC_OBS_ERROR,
      STC_OBS_ERROR_RESOLVED,
      STC_SESSION_MANIFEST_UPDATED,
      STC_DEVICE_CAPABILITIES,
    ];
    expect(new Set(allEvents).size).toBe(allEvents.length);
  });
});
