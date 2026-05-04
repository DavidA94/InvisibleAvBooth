import type { Role } from "@invisible-av-booth/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  blockers: string[];
  warnings: string[];
}

export type TemplateCategory = "title" | "description";

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
 *  (c) Duplicate name (across all categories) → BLOCKER
 *  (d) AvVolunteer roleMinimum when category already has other templates → WARNING
 *
 * On edit, pass `excludeId` so the template being edited is not compared against itself.
 */
export function validateTemplate(input: ValidationInput, existing: ExistingTemplate[]): ValidationResult {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const candidates = input.excludeId ? existing.filter((template) => template.id !== input.excludeId) : existing;

  // (a) Unknown tokens
  const unknownTokens: string[] = [];
  let match: RegExpExecArray | null;
  // Reset lastIndex before iterating since TOKEN_PATTERN has the global flag
  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(input.formatString)) !== null) {
    const token = match[1];
    if (token !== undefined && !VALID_TOKENS.has(token)) {
      unknownTokens.push(token);
    }
  }
  if (unknownTokens.length > 0) {
    blockers.push(`Unknown token(s): ${unknownTokens.map((t) => `{${t}}`).join(", ")}`);
  }

  // (b) Duplicate format string (whitespace-collapsed, same category)
  const collapsed = collapseWhitespace(input.formatString);
  const duplicateFormat = candidates.find((template) => template.category === input.category && collapseWhitespace(template.formatString) === collapsed);
  if (duplicateFormat) {
    blockers.push(`Duplicate format string in ${input.category} category (matches "${duplicateFormat.name}")`);
  }

  // (c) Duplicate name
  const duplicateName = candidates.find((template) => template.name === input.name);
  if (duplicateName) {
    blockers.push(`Duplicate template name "${input.name}"`);
  }

  // (d) AvVolunteer with multiple templates in same category
  if (input.roleMinimum === "AvVolunteer") {
    const sameCategoryCount = candidates.filter((template) => template.category === input.category).length;
    if (sameCategoryCount > 0) {
      warnings.push("AvVolunteer role with multiple templates in the same category — volunteers may find this confusing");
    }
  }

  return { blockers, warnings };
}
