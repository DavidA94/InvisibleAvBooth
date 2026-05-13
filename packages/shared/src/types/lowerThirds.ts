import type { ScriptureReference } from "../interpolation.js";

// ── Lower-Third Types ─────────────────────────────────────────────────────────

export type LowerThirdType = "Title" | "TitleSubtitle" | "Scripture";
export type AnimationPhase = "hidden" | "showing" | "visible" | "dismissing";
export type LowerThirdStyle = "blue_rhombus";

// ── Content Types ─────────────────────────────────────────────────────────────

export interface TitleContent {
  title: string;
}

export interface TitleSubtitleContent {
  title: string;
  subtitle: string;
}

export interface VerseData {
  verseNumber: number;
  text: string;
}

export interface ScriptureContent {
  reference: ScriptureReference;
  formattedReference: string;
  verses: VerseData[];
}

// ── Pagination ────────────────────────────────────────────────────────────────

export interface PageInfo {
  pageNumber: number;
  startVerse: number;
  endVerse: number;
}

export interface PageBreakdown {
  totalPages: number;
  currentPage: number;
  pages: PageInfo[];
}

// ── Library Item ──────────────────────────────────────────────────────────────

export interface LowerThirdItem {
  id: string;
  type: LowerThirdType;
  style: LowerThirdStyle;
  content: TitleContent | TitleSubtitleContent | ScriptureContent;
  autoDismissMs: number | null;
  source: "template" | "volunteer";
  templateId: string | null;
  templateName: string | null;
  used: boolean;
  createdAt: string;
  pages: PageBreakdown | null;
}

// ── State ─────────────────────────────────────────────────────────────────────

export interface LowerThirdState {
  active: LowerThirdItem | null;
  library: LowerThirdItem[];
  phase: AnimationPhase;
  autoDismissAt: string | null;
  overlayConnected: boolean;
  overlayResolutionCorrect: boolean;
  transitionLocked: boolean;
}

// ── Commands (dashboard → backend) ────────────────────────────────────────────

export interface AddLowerThirdInput {
  type: LowerThirdType;
  content: TitleContent | TitleSubtitleContent | { reference: ScriptureReference };
  autoDismissMs?: number;
}

export interface EditLowerThirdInput {
  content?: TitleContent | TitleSubtitleContent | { reference: ScriptureReference };
  autoDismissMs?: number;
}

export type LowerThirdCommand =
  | { type: "activate"; itemId: string }
  | { type: "dismiss-active" }
  | { type: "force-clear" }
  | { type: "add-to-library"; input: AddLowerThirdInput }
  | { type: "remove-from-library"; itemId: string }
  | { type: "edit-library-item"; itemId: string; patch: EditLowerThirdInput }
  | { type: "page-next" }
  | { type: "page-previous" };
