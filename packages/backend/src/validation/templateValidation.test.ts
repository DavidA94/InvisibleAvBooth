import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateTemplate } from "./templateValidation.js";
import type { ExistingTemplate, ValidationInput } from "./templateValidation.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const base: ValidationInput = {
  name: "Default Title",
  category: "title",
  formatString: "{Date} – {Speaker} – {Title}",
  roleMinimum: "AvPowerUser",
};

function input(overrides: Partial<ValidationInput> = {}): ValidationInput {
  return { ...base, ...overrides };
}

function existing(overrides: Partial<ExistingTemplate> & { id: string }): ExistingTemplate {
  return {
    name: "Existing Template",
    category: "title",
    formatString: "{Speaker} – {Title}",
    roleMinimum: "AvPowerUser",
    ...overrides,
  };
}

// ── (a) Unknown tokens ────────────────────────────────────────────────────────

describe("unknown tokens", () => {
  it("passes with all valid tokens", () => {
    const result = validateTemplate(input({ formatString: "{Date} {Speaker} {Title} {Scripture} {verseText}" }), []);
    expect(result.blockers).toHaveLength(0);
  });

  it("blocks a single unknown token", () => {
    const result = validateTemplate(input({ formatString: "{Date} {Foo}" }), []);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain("{Foo}");
  });

  it("blocks multiple unknown tokens", () => {
    const result = validateTemplate(input({ formatString: "{Foo} {Bar} {Date}" }), []);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain("{Foo}");
    expect(result.blockers[0]).toContain("{Bar}");
  });

  it("passes with no tokens at all", () => {
    const result = validateTemplate(input({ formatString: "Static text only" }), []);
    expect(result.blockers).toHaveLength(0);
  });

  it("is case-sensitive — {date} is unknown", () => {
    const result = validateTemplate(input({ formatString: "{date}" }), []);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain("{date}");
  });
});

// ── (b) Duplicate format string ───────────────────────────────────────────────

describe("duplicate format string", () => {
  it("blocks when same collapsed format exists in same category", () => {
    const result = validateTemplate(input({ formatString: "{Speaker} – {Title}" }), [existing({ id: "e1" })]);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain("Duplicate format string");
  });

  it("collapses whitespace before comparing", () => {
    const result = validateTemplate(input({ formatString: "{Speaker}  –  {Title}" }), [existing({ id: "e1", formatString: "{Speaker} – {Title}" })]);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0]).toContain("Duplicate format string");
  });

  it("collapses tabs and newlines", () => {
    const result = validateTemplate(input({ formatString: "{Speaker}\t–\n{Title}" }), [existing({ id: "e1", formatString: "{Speaker} – {Title}" })]);
    expect(result.blockers).toHaveLength(1);
  });

  it("trims leading/trailing whitespace before comparing", () => {
    const result = validateTemplate(input({ formatString: "  {Speaker} – {Title}  " }), [existing({ id: "e1", formatString: "{Speaker} – {Title}" })]);
    expect(result.blockers).toHaveLength(1);
  });

  it("allows same format in different category", () => {
    const result = validateTemplate(input({ formatString: "{Speaker} – {Title}", category: "description" }), [existing({ id: "e1" })]);
    // No format-string blocker (name blocker may exist but that's a different check)
    const formatBlockers = result.blockers.filter((b) => b.includes("Duplicate format string"));
    expect(formatBlockers).toHaveLength(0);
  });

  it("excludes self on edit", () => {
    const result = validateTemplate(input({ formatString: "{Speaker} – {Title}", excludeId: "e1" }), [existing({ id: "e1" })]);
    const formatBlockers = result.blockers.filter((b) => b.includes("Duplicate format string"));
    expect(formatBlockers).toHaveLength(0);
  });
});

// ── (c) Duplicate name ────────────────────────────────────────────────────────

describe("duplicate name", () => {
  it("blocks when same name exists", () => {
    const result = validateTemplate(input({ name: "Existing Template" }), [existing({ id: "e1" })]);
    expect(result.blockers.some((b) => b.includes("Duplicate template name"))).toBe(true);
  });

  it("allows different name", () => {
    const result = validateTemplate(input({ name: "Unique Name" }), [existing({ id: "e1" })]);
    const nameBlockers = result.blockers.filter((b) => b.includes("Duplicate template name"));
    expect(nameBlockers).toHaveLength(0);
  });

  it("excludes self on edit", () => {
    const result = validateTemplate(input({ name: "Existing Template", excludeId: "e1" }), [existing({ id: "e1" })]);
    const nameBlockers = result.blockers.filter((b) => b.includes("Duplicate template name"));
    expect(nameBlockers).toHaveLength(0);
  });

  it("allows same name across different categories", () => {
    const result = validateTemplate(input({ name: "Existing Template", category: "description" }), [existing({ id: "e1" })]);
    expect(result.blockers.some((b) => b.includes("Duplicate template name"))).toBe(false);
  });
});

// ── (d) AvVolunteer warning ───────────────────────────────────────────────────

describe("AvVolunteer warning", () => {
  it("warns when AvVolunteer and category already has templates", () => {
    const result = validateTemplate(input({ roleMinimum: "AvVolunteer" }), [existing({ id: "e1" })]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("AvVolunteer");
  });

  it("no warning when AvVolunteer and category is empty", () => {
    const result = validateTemplate(input({ roleMinimum: "AvVolunteer" }), []);
    expect(result.warnings).toHaveLength(0);
  });

  it("no warning for AvPowerUser even with existing templates", () => {
    const result = validateTemplate(input({ roleMinimum: "AvPowerUser" }), [existing({ id: "e1" })]);
    expect(result.warnings).toHaveLength(0);
  });

  it("no warning for ADMIN even with existing templates", () => {
    const result = validateTemplate(input({ roleMinimum: "ADMIN" }), [existing({ id: "e1" })]);
    expect(result.warnings).toHaveLength(0);
  });

  it("excludes self on edit for warning count", () => {
    const result = validateTemplate(input({ roleMinimum: "AvVolunteer", excludeId: "e1" }), [existing({ id: "e1" })]);
    expect(result.warnings).toHaveLength(0);
  });
});

// ── Lower-Third Validation ────────────────────────────────────────────────────

describe("lower-third validation", () => {
  it("extracts and validates tokens from JSON formatString", () => {
    const result = validateTemplate(
      { name: "Test", category: "lower_third", formatString: '{"title":"{Speaker}","subtitle":"{BadToken}"}', roleMinimum: "AvVolunteer" },
      [],
    );
    expect(result.blockers.some((b) => b.includes("{BadToken}"))).toBe(true);
  });

  it("accepts valid tokens in JSON formatString", () => {
    const result = validateTemplate(
      { name: "Test", category: "lower_third", formatString: '{"title":"{Speaker}","subtitle":"{Title}"}', roleMinimum: "AvVolunteer" },
      [],
    );
    expect(result.blockers).toHaveLength(0);
  });

  it("detects duplicate formatString using canonical JSON comparison", () => {
    const existingTemplates = [
      { id: "e1", name: "Existing", category: "lower_third" as const, formatString: '{"subtitle":"{Title}","title":"{Speaker}"}', roleMinimum: "AvVolunteer" as const },
    ];
    // Same content, different key order
    const result = validateTemplate(
      { name: "New", category: "lower_third", formatString: '{"title":"{Speaker}","subtitle":"{Title}"}', roleMinimum: "AvVolunteer" },
      existingTemplates,
    );
    expect(result.blockers.some((b) => b.includes("Duplicate format string"))).toBe(true);
  });

  it("does not trigger AvVolunteer warning for lower_third category", () => {
    const existingTemplates = [
      { id: "e1", name: "Existing", category: "lower_third" as const, formatString: '{"title":"{Speaker}"}', roleMinimum: "AvVolunteer" as const },
    ];
    const result = validateTemplate(
      { name: "New", category: "lower_third", formatString: '{"title":"{Title}"}', roleMinimum: "AvVolunteer" },
      existingTemplates,
    );
    expect(result.warnings).toHaveLength(0);
  });

  it("name uniqueness is within lower_third category only", () => {
    const existingTemplates = [
      { id: "e1", name: "Speaker", category: "title" as const, formatString: "{Speaker}", roleMinimum: "AvVolunteer" as const },
    ];
    // Same name but different category — should be allowed
    const result = validateTemplate(
      { name: "Speaker", category: "lower_third", formatString: '{"title":"{Speaker}"}', roleMinimum: "AvVolunteer" },
      existingTemplates,
    );
    expect(result.blockers.filter((b) => b.includes("Duplicate template name"))).toHaveLength(0);
  });
});

// ── Combined blockers + warnings ──────────────────────────────────────────────

describe("combined blockers and warnings", () => {
  it("returns both blockers and warnings simultaneously", () => {
    const result = validateTemplate(input({ name: "Existing Template", formatString: "{Foo}", roleMinimum: "AvVolunteer" }), [existing({ id: "e1" })]);
    expect(result.blockers.length).toBeGreaterThanOrEqual(2); // unknown token + duplicate name
    expect(result.warnings).toHaveLength(1); // AvVolunteer warning
  });

  it("returns empty arrays when everything is valid", () => {
    const result = validateTemplate(input(), []);
    expect(result.blockers).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

// ── P27: validate-then-save gate (property-based) ─────────────────────────────

describe("Property P27: validate-then-save gate", () => {
  const VALID_TOKENS_SET = new Set(["Date", "Speaker", "Title", "Scripture", "verseText"]);
  const roleArb = fc.constantFrom("ADMIN" as const, "AvPowerUser" as const, "AvVolunteer" as const);
  const categoryArb = fc.constantFrom("title" as const, "description" as const);

  it("if blockers is empty, the template has no unknown tokens and no duplicates", () => {
    fc.assert(
      fc.property(
        fc.record({
          name: fc.string({ minLength: 1, maxLength: 50 }),
          category: categoryArb,
          formatString: fc.string({ minLength: 0, maxLength: 100 }),
          roleMinimum: roleArb,
        }),
        fc.array(
          fc.record({
            id: fc.uuid(),
            name: fc.string({ minLength: 1, maxLength: 50 }),
            category: categoryArb,
            formatString: fc.string({ minLength: 0, maxLength: 100 }),
            roleMinimum: roleArb,
          }),
          { minLength: 0, maxLength: 5 },
        ),
        (inputRaw, existingRaw) => {
          const validationInput: ValidationInput = inputRaw;
          const existingTemplates: ExistingTemplate[] = existingRaw;
          const result = validateTemplate(validationInput, existingTemplates);

          if (result.blockers.length === 0) {
            // No unknown tokens: every {Word} in formatString must be in VALID_TOKENS_SET
            const tokenPattern = /\{(\w+)\}/g;
            let tokenMatch: RegExpExecArray | null;
            while ((tokenMatch = tokenPattern.exec(validationInput.formatString)) !== null) {
              const token = tokenMatch[1];
              expect(VALID_TOKENS_SET.has(token!)).toBe(true);
            }

            // No duplicate name among existing
            const collapseWs = (s: string): string => s.replace(/\s+/g, " ").trim();
            const nameConflict = existingTemplates.some((t) => t.name === validationInput.name);
            expect(nameConflict).toBe(false);

            // No duplicate format string in same category
            const collapsedInput = collapseWs(validationInput.formatString);
            const formatConflict = existingTemplates.some((t) => t.category === validationInput.category && collapseWs(t.formatString) === collapsedInput);
            expect(formatConflict).toBe(false);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
