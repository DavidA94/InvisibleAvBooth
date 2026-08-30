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
  STC_MIXER_STATE,
  STC_MIXER_STATE_UPDATE,
  STC_MIXER_LEVELS,
  STC_MIXER_ERROR,
  STC_MIXER_ERROR_RESOLVED,
  CTS_MIXER_SET,
  CTS_MIXER_PRESET_ACTIVATE,
  CTS_MIXER_MONITOR_START,
  CTS_MIXER_MONITOR_STOP,
  CTS_MIXER_WIDGET_PRESENT,
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

  it("mixer client-to-server events use cts: prefix", () => {
    expect(CTS_MIXER_SET).toMatch(/^cts:/);
    expect(CTS_MIXER_PRESET_ACTIVATE).toMatch(/^cts:/);
    expect(CTS_MIXER_MONITOR_START).toMatch(/^cts:/);
    expect(CTS_MIXER_MONITOR_STOP).toMatch(/^cts:/);
    expect(CTS_MIXER_WIDGET_PRESENT).toMatch(/^cts:/);
  });

  it("mixer server-to-client events use stc: prefix", () => {
    expect(STC_MIXER_STATE).toMatch(/^stc:/);
    expect(STC_MIXER_STATE_UPDATE).toMatch(/^stc:/);
    expect(STC_MIXER_LEVELS).toMatch(/^stc:/);
    expect(STC_MIXER_ERROR).toMatch(/^stc:/);
    expect(STC_MIXER_ERROR_RESOLVED).toMatch(/^stc:/);
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
      STC_MIXER_STATE,
      STC_MIXER_STATE_UPDATE,
      STC_MIXER_LEVELS,
      STC_MIXER_ERROR,
      STC_MIXER_ERROR_RESOLVED,
      CTS_MIXER_SET,
      CTS_MIXER_PRESET_ACTIVATE,
      CTS_MIXER_MONITOR_START,
      CTS_MIXER_MONITOR_STOP,
      CTS_MIXER_WIDGET_PRESENT,
    ];
    expect(new Set(allEvents).size).toBe(allEvents.length);
  });
});
