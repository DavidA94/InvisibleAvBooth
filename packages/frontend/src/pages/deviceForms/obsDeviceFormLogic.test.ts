import { describe, it, expect } from "vitest";
import { buildInitialState, isFormDirty, DEFAULT_PORT, type ObsFormState } from "./obsDeviceFormLogic";
import type { DeviceRecord } from "./deviceTypeRegistry";

const DEVICE: DeviceRecord = {
  id: "d1",
  deviceType: "obs",
  label: "Main OBS",
  host: "10.0.0.1",
  port: 4455,
  metadata: {},
  features: {},
  enabled: true,
  createdAt: "2026-01-01",
};

describe("buildInitialState", () => {
  it("returns blank defaults when device is null", () => {
    expect(buildInitialState(null)).toEqual({ label: "", host: "", port: DEFAULT_PORT, password: "", enabled: true, ndiOutputName: "", ndiExtraIPs: "" });
  });

  it("copies fields from device and clears password when editing", () => {
    expect(buildInitialState(DEVICE)).toEqual({
      label: "Main OBS",
      host: "10.0.0.1",
      port: "4455",
      password: "",
      enabled: true,
      ndiOutputName: "",
      ndiExtraIPs: "",
    });
  });

  it("reads ndiOutputName from metadata", () => {
    const d = { ...DEVICE, metadata: { ndiOutputName: "OBS-PC (OBS)" } };
    expect(buildInitialState(d).ndiOutputName).toBe("OBS-PC (OBS)");
  });

  it("converts numeric port to string", () => {
    expect(buildInitialState({ ...DEVICE, port: 9999 }).port).toBe("9999");
  });
});

const BASE: ObsFormState = { label: "L", host: "H", port: "4455", password: "", enabled: true, ndiOutputName: "", ndiExtraIPs: "" };

describe("isFormDirty", () => {
  it.each`
    scenario                                        | current                                    | initial | isEdit   | expected
    ${"no changes"}                                 | ${BASE}                                    | ${BASE} | ${false} | ${false}
    ${"label changed"}                              | ${{ ...BASE, label: "X" }}                 | ${BASE} | ${false} | ${true}
    ${"host changed"}                               | ${{ ...BASE, host: "new" }}                | ${BASE} | ${false} | ${true}
    ${"port changed"}                               | ${{ ...BASE, port: "9999" }}               | ${BASE} | ${false} | ${true}
    ${"enabled changed"}                            | ${{ ...BASE, enabled: false }}             | ${BASE} | ${true}  | ${true}
    ${"ndiOutputName changed"}                      | ${{ ...BASE, ndiOutputName: "OBS (OBS)" }} | ${BASE} | ${false} | ${true}
    ${"password changed in create (not edit)"}      | ${{ ...BASE, password: "secret" }}         | ${BASE} | ${false} | ${true}
    ${"password empty in create unchanged"}         | ${BASE}                                    | ${BASE} | ${false} | ${false}
    ${"password any non-empty in edit mode"}        | ${{ ...BASE, password: "something" }}      | ${BASE} | ${true}  | ${true}
    ${"password empty in edit mode (blank = keep)"} | ${BASE}                                    | ${BASE} | ${true}  | ${false}
  `("$scenario → $expected", ({ current, initial, isEdit, expected }) => {
    expect(isFormDirty(current, initial, isEdit)).toBe(expected);
  });
});
