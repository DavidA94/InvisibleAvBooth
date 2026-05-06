import { describe, it, expect } from "vitest";
import { storageDashboardLayoutKey } from "./storageKeys";

describe("storageDashboardLayoutKey", () => {
  it.each`
    dashboardId   | expected
    ${"abc"}      | ${"dashboardLayout:abc"}
    ${"d1"}       | ${"dashboardLayout:d1"}
    ${"uuid-123"} | ${"dashboardLayout:uuid-123"}
  `("returns $expected for id $dashboardId", ({ dashboardId, expected }) => {
    expect(storageDashboardLayoutKey(dashboardId)).toBe(expected);
  });
});
