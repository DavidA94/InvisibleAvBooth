import { describe, it, expect } from "vitest";
import {
  GRID_DIMENSIONS,
  computeGridHeightRem,
  computeDashboardFitHeightRem,
  DASHBOARD_TITLE_BAR_HEIGHT_REM,
  DASHBOARD_GRID_VERTICAL_MARGIN_REM,
} from "./gridTypes";

describe("computeGridHeightRem", () => {
  it("is rows of cells plus the gaps between them", () => {
    expect(computeGridHeightRem(7)).toBe(55.25);
    expect(computeGridHeightRem(1)).toBe(7.25);
  });
});

describe("computeDashboardFitHeightRem (Req 2.5)", () => {
  it("adds the title bar and the grid's top and bottom margin to the grid height", () => {
    expect(computeDashboardFitHeightRem(7)).toBe(55.25 + DASHBOARD_TITLE_BAR_HEIGHT_REM + 2 * DASHBOARD_GRID_VERTICAL_MARGIN_REM);
    expect(computeDashboardFitHeightRem(7)).toBe(59.75);
  });

  it.each(Object.entries(GRID_DIMENSIONS))("for %s is 4.5rem taller than the grid alone", (_type, dimensions) => {
    expect(computeDashboardFitHeightRem(dimensions.defaultRows) - computeGridHeightRem(dimensions.defaultRows)).toBe(4.5);
  });
});
