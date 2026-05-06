/**
 * Pure logic for the session manifest modal. Extracted for testability.
 */

import type { SessionManifest, ScriptureReference } from "../types";

export interface Template {
  id: string;
  name: string;
  category: "title" | "description";
  formatString: string;
}

/** Extract token names (e.g. "{Speaker}") from a format string. */
export function extractTokens(formatString: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of formatString.matchAll(/\{(\w+)\}/g)) {
    tokens.add(match[1]!);
  }
  return tokens;
}

/**
 * Compute the union of tokens required by the selected title and description templates.
 * Empty/missing format strings contribute no tokens.
 */
export function computeRequiredTokens(titleTemplate: Template | undefined, descTemplate: Template | undefined): Set<string> {
  const tokens = new Set<string>();
  if (titleTemplate) for (const t of extractTokens(titleTemplate.formatString)) tokens.add(t);
  if (descTemplate && descTemplate.formatString) for (const t of extractTokens(descTemplate.formatString)) tokens.add(t);
  return tokens;
}

export interface ManifestInputs {
  speaker: string;
  title: string;
  bookId: number | null;
  chapter: number | null;
  verse: number | null;
  verseEnd: number | null;
}

/**
 * Build a partial SessionManifest from the input fields.
 * Empty fields are omitted; scripture is only included when book/chapter/verse are all set.
 */
export function buildDraftManifest(inputs: ManifestInputs): Partial<SessionManifest> {
  const draft: Partial<SessionManifest> = {};
  if (inputs.speaker) draft.speaker = inputs.speaker;
  if (inputs.title) draft.title = inputs.title;
  if (inputs.bookId && inputs.chapter && inputs.verse) {
    const ref: ScriptureReference = { bookId: inputs.bookId, chapter: inputs.chapter, verse: inputs.verse };
    if (inputs.verseEnd) ref.verseEnd = inputs.verseEnd;
    draft.scripture = ref;
  }
  return draft;
}

/**
 * True when the description template has actual content to render
 * (not the "None" placeholder template).
 */
export function hasDescriptionContent(descTemplate: Template | undefined): boolean {
  return !!(descTemplate && descTemplate.name !== "None" && descTemplate.formatString);
}
