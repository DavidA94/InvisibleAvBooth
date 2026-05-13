import type { Role } from "@invisible-av-booth/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  blockers: string[];
  warnings: string[];
}

export type TemplateCategory = "title" | "description" | "lower_third";

export interface ValidationInput {
  name: string;
  category: TemplateCategory;
  formatString: string;
  roleMinimum: Role;
  excludeId?: string; // for edit — exclude self from duplicate checks
}

export interface ExistingTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  formatString: string;
  roleMinimum: Role;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * The set of tokens that interpolateTemplate knows how to resolve.
 * Any {Foo} not in this set is an unknown token and blocks save.
 */
const VALID_TOKENS = new Set(["Date", "Speaker", "Title", "Scripture", "verseText"]);

/** Regex that matches any `{Word}` token in a format string. */
const TOKEN_PATTERN = /\{(\w+)\}/g;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Collapse all runs of whitespace to a single space and trim. */
function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates a template before create or update.
 *
 * Checks (in order):
 *  (a) Unknown tokens — any {Foo} not in VALID_TOKENS → BLOCKER
 *  (b) Duplicate format string (whitespace-collapsed, same category) → BLOCKER
 *      For lower_third: uses canonical JSON comparison
 *  (c) Duplicate name (within same category) → BLOCKER
 *  (d) AvVolunteer roleMinimum when category already has other templates → WARNING
 *      (skipped for lower_third — multiple templates per role are expected)
 *
 * On edit, pass `excludeId` so the template being edited is not compared against itself.
 */
export function validateTemplate(input: ValidationInput, existing: ExistingTemplate[]): ValidationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const candidates = input.excludeId ? existing.filter((template) => template.id !== input.excludeId) : existing;

  // (a) Unknown tokens — for lower_third, parse JSON and check tokens in all values
  const tokensToCheck = input.category === "lower_third" ? extractTokensFromJson(input.formatString) : extractTokensFromString(input.formatString);
  const unknownTokens = tokensToCheck.filter((t) => !VALID_TOKENS.has(t));
  if (unknownTokens.length > 0) {
    blockers.push(`Unknown token(s): ${unknownTokens.map((t) => `{${t}}`).join(", ")}`);
  }

  // (b) Duplicate format string (same category)
  if (input.category === "lower_third") {
    const canonical = canonicalizeForComparison(input.formatString);
    const duplicate = candidates.find((t) => t.category === "lower_third" && canonicalizeForComparison(t.formatString) === canonical);
    if (duplicate) {
      blockers.push(`Duplicate format string in lower_third category (matches "${duplicate.name}")`);
    }
  } else {
    const collapsed = collapseWhitespace(input.formatString);
    const duplicate = candidates.find((t) => t.category === input.category && collapseWhitespace(t.formatString) === collapsed);
    if (duplicate) {
      blockers.push(`Duplicate format string in ${input.category} category (matches "${duplicate.name}")`);
    }
  }

  // (c) Duplicate name (within same category)
  const duplicateName = candidates.find((template) => template.category === input.category && template.name === input.name);
  if (duplicateName) {
    blockers.push(`Duplicate template name "${input.name}"`);
  }

  // (d) AvVolunteer with multiple templates in same category (skip for lower_third)
  if (input.category !== "lower_third" && input.roleMinimum === "AvVolunteer") {
    const sameCategoryCount = candidates.filter((template) => template.category === input.category && template.name !== "None").length;
    if (sameCategoryCount > 0) {
      warnings.push("AvVolunteer role with multiple templates in the same category — volunteers may find this confusing");
    }
  }

  return { blockers, warnings };
}

function extractTokensFromString(formatString: string): string[] {
  const tokens: string[] = [];
  TOKEN_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_PATTERN.exec(formatString)) !== null) {
    if (match[1] !== undefined) tokens.push(match[1]);
  }
  return tokens;
}

function extractTokensFromJson(formatString: string): string[] {
  try {
    const obj = JSON.parse(formatString) as Record<string, string>;
    const tokens: string[] = [];
    for (const value of Object.values(obj)) {
      tokens.push(...extractTokensFromString(value));
    }
    return tokens;
  } catch {
    return []; // invalid JSON will be caught elsewhere
  }
}

function canonicalizeForComparison(json: string): string {
  try {
    const obj = JSON.parse(json) as Record<string, unknown>;
    const sorted = Object.keys(obj).sort();
    const canonical: Record<string, unknown> = {};
    for (const key of sorted) {
      canonical[key] = obj[key];
    }
    return JSON.stringify(canonical);
  } catch {
    return json;
  }
}
