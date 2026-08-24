import { describe, it, expect } from "vitest";
import {
  validateSlug,
  validateGridColumnBounds,
  validateWidgetConstraints,
  validateNoOverlaps,
  validateSameWidgets,
  isDashboardComplete,
  validateGrids,
} from "./dashboardValidation.js";
import type { WidgetPlacement } from "./dashboardValidation.js";

// ── validateSlug ──────────────────────────────────────────────────────────────

describe("validateSlug", () => {
  it.each`
    slug                | description
    ${"main"}           | ${"simple lowercase"}
    ${"main-dashboard"} | ${"with hyphens"}
    ${"a"}              | ${"single char"}
    ${"abc123"}         | ${"alphanumeric"}
    ${"test-1-2-3"}     | ${"multiple segments"}
  `("accepts valid slug: $description ($slug)", ({ slug }) => {
    expect(validateSlug(slug)).toBeNull();
  });

  it.each`
    slug                 | description
    ${""}                | ${"empty string"}
    ${"Main"}            | ${"uppercase letter"}
    ${"main dashboard"}  | ${"contains space"}
    ${"-main"}           | ${"leading hyphen"}
    ${"main-"}           | ${"trailing hyphen"}
    ${"main--dashboard"} | ${"consecutive hyphens"}
    ${"main_dashboard"}  | ${"underscore"}
    ${"main.dashboard"}  | ${"period"}
    ${"main/dashboard"}  | ${"slash"}
    ${"UPPERCASE"}       | ${"all uppercase"}
    ${"hello!"}          | ${"special char"}
  `("rejects invalid slug: $description ($slug)", ({ slug }) => {
    expect(validateSlug(slug)).not.toBeNull();
  });

  it("rejects slug exceeding 64 characters", () => {
    const longSlug = "a".repeat(65);
    const result = validateSlug(longSlug);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("64");
  });

  it("accepts slug at exactly 64 characters", () => {
    const slug = "a".repeat(64);
    expect(validateSlug(slug)).toBeNull();
  });
});

// ── validateGridColumnBounds ──────────────────────────────────────────────────

describe("validateGridColumnBounds", () => {
  const makeWidget = (col: number, colSpan: number): WidgetPlacement => ({
    widgetId: "obs",
    title: "OBS",
    col,
    row: 0,
    colSpan,
    rowSpan: 2,
    roleMinimum: "AvVolunteer",
  });

  it("allows widget at max column edge (col + colSpan === columns)", () => {
    // large-landscape has 11 columns
    expect(validateGridColumnBounds(makeWidget(9, 2), "large-landscape")).toBeNull();
  });

  it("rejects widget exceeding column bounds", () => {
    // large-landscape has 11 columns; 10 + 2 = 12 > 11
    const result = validateGridColumnBounds(makeWidget(10, 2), "large-landscape");
    expect(result).not.toBeNull();
    expect(result!.message).toContain("exceeds grid bounds");
    expect(result!.message).toContain("large-landscape");
  });

  it("allows any row placement (rows are dynamic)", () => {
    const widget: WidgetPlacement = { widgetId: "obs", title: "OBS", col: 0, row: 100, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" };
    expect(validateGridColumnBounds(widget, "large-landscape")).toBeNull();
  });

  it("validates against small-portrait 3 columns", () => {
    // small-portrait has 3 columns; 1 + 3 = 4 > 3
    const result = validateGridColumnBounds(makeWidget(1, 3), "small-portrait");
    expect(result).not.toBeNull();
  });

  it("passes at small-portrait boundary (0 + 3 === 3)", () => {
    expect(validateGridColumnBounds(makeWidget(0, 3), "small-portrait")).toBeNull();
  });
});

// ── validateWidgetConstraints ─────────────────────────────────────────────────

describe("validateWidgetConstraints", () => {
  it("passes when widget meets minimum constraints", () => {
    const widget: WidgetPlacement = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" };
    expect(validateWidgetConstraints(widget)).toBeNull();
  });

  it("rejects widget below minimum column span", () => {
    const widget: WidgetPlacement = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 1, rowSpan: 2, roleMinimum: "AvVolunteer" };
    const result = validateWidgetConstraints(widget);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("cannot be smaller than");
    expect(result!.message).toContain("OBS");
  });

  it("rejects widget below minimum row span", () => {
    const widget: WidgetPlacement = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 1, roleMinimum: "AvVolunteer" };
    const result = validateWidgetConstraints(widget);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("cannot be smaller than");
  });

  it("rejects widget exceeding maximum column span", () => {
    // OBS maxColSpan = 5
    const widget: WidgetPlacement = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 6, rowSpan: 2, roleMinimum: "AvVolunteer" };
    const result = validateWidgetConstraints(widget);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("cannot exceed 5 columns");
  });

  it("rejects widget exceeding maximum row span", () => {
    // OBS maxRowSpan = 4
    const widget: WidgetPlacement = { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 5, roleMinimum: "AvVolunteer" };
    const result = validateWidgetConstraints(widget);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("cannot exceed 4 rows");
  });

  it("allows unconstrained max (lower-thirds has no max)", () => {
    const widget: WidgetPlacement = { widgetId: "lower-thirds", title: "LT", col: 0, row: 0, colSpan: 10, rowSpan: 10, roleMinimum: "AvVolunteer" };
    expect(validateWidgetConstraints(widget)).toBeNull();
  });

  it("returns null for unknown widget type (forward compatibility)", () => {
    const widget: WidgetPlacement = { widgetId: "future-widget", title: "Future", col: 0, row: 0, colSpan: 1, rowSpan: 1, roleMinimum: "AvVolunteer" };
    expect(validateWidgetConstraints(widget)).toBeNull();
  });

  it("rejects camera below minimum 3 columns", () => {
    const widget: WidgetPlacement = { widgetId: "camera", title: "Camera", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" };
    const result = validateWidgetConstraints(widget);
    expect(result).not.toBeNull();
    expect(result!.message).toContain("Camera");
  });
});

// ── validateNoOverlaps ────────────────────────────────────────────────────────

describe("validateNoOverlaps", () => {
  it("passes with no overlapping widgets", () => {
    const widgets: WidgetPlacement[] = [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 2, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ];
    expect(validateNoOverlaps(widgets, "large-landscape")).toHaveLength(0);
  });

  it("detects partial overlap", () => {
    const widgets: WidgetPlacement[] = [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 2, row: 1, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ];
    const errors = validateNoOverlaps(widgets, "large-landscape");
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toContain("obs");
    expect(errors[0]!.message).toContain("camera");
    expect(errors[0]!.message).toContain("large-landscape");
  });

  it("detects full overlap (same position)", () => {
    const widgets: WidgetPlacement[] = [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ];
    expect(validateNoOverlaps(widgets, "large-landscape").length).toBeGreaterThan(0);
  });

  it("does not flag adjacent but non-overlapping widgets", () => {
    const widgets: WidgetPlacement[] = [
      { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" },
      { widgetId: "camera", title: "Camera", col: 2, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
    ];
    expect(validateNoOverlaps(widgets, "large-landscape")).toHaveLength(0);
  });

  it("handles empty widget list", () => {
    expect(validateNoOverlaps([], "large-landscape")).toHaveLength(0);
  });

  it("handles single widget", () => {
    const widgets: WidgetPlacement[] = [{ widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 2, rowSpan: 2, roleMinimum: "AvVolunteer" }];
    expect(validateNoOverlaps(widgets, "large-landscape")).toHaveLength(0);
  });
});

// ── validateSameWidgets ───────────────────────────────────────────────────────

describe("validateSameWidgets", () => {
  it("passes when all grids have same widget set", () => {
    const grids = {
      "large-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "large-portrait": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "small-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "small-portrait": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
    };
    expect(validateSameWidgets(grids)).toHaveLength(0);
  });

  it("detects widget missing from one grid", () => {
    const grids = {
      "large-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "large-portrait": [makeSimpleWidget("obs")], // missing camera
      "small-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "small-portrait": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
    };
    const errors = validateSameWidgets(grids);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]!.message).toContain("Missing from 'large-portrait'");
    expect(errors[0]!.message).toContain("camera");
  });

  it("reports multiple grids missing widgets", () => {
    const grids = {
      "large-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "large-portrait": [makeSimpleWidget("obs")],
      "small-landscape": [makeSimpleWidget("obs")],
      "small-portrait": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
    };
    const errors = validateSameWidgets(grids);
    expect(errors.length).toBe(2); // both large-portrait and small-landscape
  });

  it("passes with empty grids (no widgets anywhere)", () => {
    const grids = {
      "large-landscape": [] as WidgetPlacement[],
      "large-portrait": [] as WidgetPlacement[],
      "small-landscape": [] as WidgetPlacement[],
      "small-portrait": [] as WidgetPlacement[],
    };
    expect(validateSameWidgets(grids)).toHaveLength(0);
  });
});

// ── isDashboardComplete ───────────────────────────────────────────────────────

describe("isDashboardComplete", () => {
  it("returns true for complete dashboard", () => {
    const dashboard = { name: "Main", slug: "main", allowedRoles: ["AvVolunteer"] };
    const grids = {
      "large-landscape": [makeSimpleWidget("obs")],
      "large-portrait": [makeSimpleWidget("obs")],
      "small-landscape": [makeSimpleWidget("obs")],
      "small-portrait": [makeSimpleWidget("obs")],
    };
    expect(isDashboardComplete(dashboard, grids)).toBe(true);
  });

  it("returns false when name is empty", () => {
    const dashboard = { name: "", slug: "main", allowedRoles: ["AvVolunteer"] };
    const grids = {
      "large-landscape": [makeSimpleWidget("obs")],
      "large-portrait": [makeSimpleWidget("obs")],
      "small-landscape": [makeSimpleWidget("obs")],
      "small-portrait": [makeSimpleWidget("obs")],
    };
    expect(isDashboardComplete(dashboard, grids)).toBe(false);
  });

  it("returns false when slug is empty", () => {
    const dashboard = { name: "Main", slug: "", allowedRoles: ["AvVolunteer"] };
    expect(
      isDashboardComplete(dashboard, {
        "large-landscape": [makeSimpleWidget("obs")],
        "large-portrait": [makeSimpleWidget("obs")],
        "small-landscape": [makeSimpleWidget("obs")],
        "small-portrait": [makeSimpleWidget("obs")],
      }),
    ).toBe(false);
  });

  it("returns false when allowedRoles is empty", () => {
    const dashboard = { name: "Main", slug: "main", allowedRoles: [] as string[] };
    const grids = {
      "large-landscape": [makeSimpleWidget("obs")],
      "large-portrait": [makeSimpleWidget("obs")],
      "small-landscape": [makeSimpleWidget("obs")],
      "small-portrait": [makeSimpleWidget("obs")],
    };
    expect(isDashboardComplete(dashboard, grids)).toBe(false);
  });

  it("returns false when a grid type has no widgets", () => {
    const dashboard = { name: "Main", slug: "main", allowedRoles: ["AvVolunteer"] };
    const grids = {
      "large-landscape": [makeSimpleWidget("obs")],
      "large-portrait": [makeSimpleWidget("obs")],
      "small-landscape": [] as WidgetPlacement[],
      "small-portrait": [makeSimpleWidget("obs")],
    };
    expect(isDashboardComplete(dashboard, grids)).toBe(false);
  });

  it("returns false when grids have mismatched widget sets", () => {
    const dashboard = { name: "Main", slug: "main", allowedRoles: ["AvVolunteer"] };
    const grids = {
      "large-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "large-portrait": [makeSimpleWidget("obs")], // missing camera
      "small-landscape": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
      "small-portrait": [makeSimpleWidget("obs"), makeSimpleWidget("camera")],
    };
    expect(isDashboardComplete(dashboard, grids)).toBe(false);
  });
});

// ── validateGrids (integration) ───────────────────────────────────────────────

describe("validateGrids", () => {
  it("returns empty array for valid grids", () => {
    const grids = {
      "large-landscape": [
        { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
        { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      ],
      "large-portrait": [
        { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
        { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      ],
      "small-landscape": [
        { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
        { widgetId: "camera", title: "Camera", col: 3, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      ],
      "small-portrait": [
        { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
        { widgetId: "camera", title: "Camera", col: 0, row: 2, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" },
      ],
    };
    expect(validateGrids(grids)).toHaveLength(0);
  });

  it("aggregates multiple error types", () => {
    const grids = {
      "large-landscape": [
        { widgetId: "obs", title: "OBS", col: 0, row: 0, colSpan: 1, rowSpan: 2, roleMinimum: "AvVolunteer" }, // below min cols
      ],
      "large-portrait": [] as WidgetPlacement[], // missing obs
      "small-landscape": [] as WidgetPlacement[],
      "small-portrait": [] as WidgetPlacement[],
    };
    const errors = validateGrids(grids);
    expect(errors.length).toBeGreaterThan(1);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSimpleWidget(widgetId: string): WidgetPlacement {
  return { widgetId, title: widgetId, col: 0, row: 0, colSpan: 3, rowSpan: 2, roleMinimum: "AvVolunteer" };
}
