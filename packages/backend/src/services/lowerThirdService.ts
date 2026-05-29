import type { Database } from "better-sqlite3";
import type {
  LowerThirdItem,
  LowerThirdState,
  LowerThirdType,
  LowerThirdStyle,
  AnimationPhase,
  AddLowerThirdInput,
  EditLowerThirdInput,
  TitleContent,
  TitleSubtitleContent,
  ScriptureContent,
  VerseData,
  PageBreakdown,
} from "@invisible-av-booth/shared";
import type { ScriptureReference, SessionManifestFields } from "@invisible-av-booth/shared";
import { formatScripture } from "@invisible-av-booth/shared";
import { createId } from "@paralleldrive/cuid2";

type Result<T, E> = { success: true; value: T } | { success: false; error: E };
import { MetadataTemplateDao } from "../dao/metadataTemplateDao.js";
import type { MetadataTemplateRow } from "../dao/metadataTemplateDao.js";
import type { SessionManifestService } from "./sessionManifestService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_LOWER_THIRD_STATE_CHANGED, BUS_SESSION_MANIFEST_UPDATED } from "../eventBus/types.js";
import { logger } from "../logger.js";

const TOKEN_PATTERN = /\{(\w+)\}/g;
const DEFAULT_STYLE: LowerThirdStyle = "blue_rhombus";
const FALLBACK_TIMEOUT_MS = 5000;
const MEASUREMENT_TIMEOUT_MS = 10000;
const DISCONNECT_TIMEOUT_MS = 15000;

export class LowerThirdService {
  private active: LowerThirdItem | null = null;
  private library: LowerThirdItem[] = [];
  private phase: AnimationPhase = "hidden";
  private autoDismissAt: string | null = null;
  private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private measurementTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private overlayConnected = false;
  private overlayResolutionCorrect = false;
  private overlayStale = false;
  private staleTimer: ReturnType<typeof setTimeout> | null = null;

  // Callbacks set by the socket gateway to send commands to the overlay
  private sendToOverlay: ((event: string, data?: unknown) => void) | null = null;

  constructor(
    private readonly dao: MetadataTemplateDao,
    private readonly database: Database,
    private readonly manifestService: SessionManifestService,
  ) {
    eventBus.subscribe(BUS_SESSION_MANIFEST_UPDATED, () => this.recomputeTemplateItems());
  }

  // ── Overlay Communication ─────────────────────────────────────────────────

  setSendToOverlay(emitter: (event: string, data?: unknown) => void): void {
    this.sendToOverlay = emitter;
  }

  setOverlayConnected(connected: boolean): void {
    this.overlayConnected = connected;
    if (connected) {
      this.overlayStale = false;
      if (this.staleTimer) { clearTimeout(this.staleTimer); this.staleTimer = null; }
    } else if (this.active) {
      // Req 8.8: Mark active item as stale after 15s of overlay disconnect
      this.staleTimer = setTimeout(() => {
        this.staleTimer = null;
        if (this.active && !this.overlayConnected) {
          this.overlayStale = true;
          this.emitState();
        }
      }, DISCONNECT_TIMEOUT_MS);
    }
    this.emitState();
  }

  getOverlayConnected(): boolean {
    return this.overlayConnected;
  }

  handleResolutionReport(data: { width: number; height: number; isCorrect: boolean }): void {
    this.overlayResolutionCorrect = data.isCorrect;
    this.emitState();
  }

  // ── Library Management ────────────────────────────────────────────────────

  getLibrary(): LowerThirdItem[] {
    return this.library;
  }

  addToLibrary(input: AddLowerThirdInput): Result<LowerThirdItem, string> {
    const item = this.buildItem(input, "volunteer");
    if (!item.success) return item;
    this.library.push(item.value);
    if (item.value.type === "Scripture" && this.overlayConnected) {
      this.requestMeasurement(item.value);
    }
    this.emitState();
    return item;
  }

  removeFromLibrary(itemId: string): Result<void, string> {
    const index = this.library.findIndex((item) => item.id === itemId);
    if (index === -1) return { success: false, error: "Item not found" };
    const item = this.library[index]!;
    if (item.source === "template") return { success: false, error: "Cannot delete template-derived items" };
    if (this.active?.id === itemId) return { success: false, error: "Cannot delete the active item" };
    this.library.splice(index, 1);
    this.emitState();
    return { success: true, value: undefined };
  }

  editLibraryItem(itemId: string, patch: EditLowerThirdInput): Result<LowerThirdItem, string> {
    const index = this.library.findIndex((item) => item.id === itemId);
    if (index === -1) return { success: false, error: "Item not found" };
    const item = this.library[index]!;
    if (item.source === "template") return { success: false, error: "Cannot edit template-derived items" };
    if (this.active?.id === itemId) return { success: false, error: "Cannot edit the active item" };

    if (patch.content) {
      const content = this.resolveContent(item.type, patch.content);
      if (!content.success) return content;
      item.content = content.value;
    }
    if (patch.autoDismissMs !== undefined) {
      item.autoDismissMs = patch.autoDismissMs ?? null;
    }
    this.library[index] = item;
    this.emitState();
    return { success: true, value: item };
  }

  // ── Activation & Dismiss ──────────────────────────────────────────────────

  activate(itemId: string): Result<void, string> {
    if (this.isTransitionLocked()) return { success: false, error: "Transition in progress" };

    const item = this.library.find((item) => item.id === itemId);
    if (!item) return { success: false, error: "Item not found in library" };

    if (this.active) {
      // Push-up transition
      this.cancelAutoDismiss();
      const previous = this.active;
      this.active = { ...item, used: true };
      this.markUsed(itemId);
      this.phase = "showing";
      this.startFallbackTimer();
      this.startAutoDismissIfNeeded();
      this.sendToOverlay?.("sto:lower-third:push-up", { item: this.active });
      this.returnToLibrary(previous);
    } else {
      // Fresh show
      this.active = { ...item, used: true };
      this.markUsed(itemId);
      this.phase = "showing";
      this.startFallbackTimer();
      this.startAutoDismissIfNeeded();
      this.sendToOverlay?.("sto:lower-third:show", { item: this.active });
    }

    this.emitState();
    return { success: true, value: undefined };
  }

  dismissActive(): Result<void, string> {
    if (this.isTransitionLocked()) return { success: false, error: "Transition in progress" };
    if (!this.active) return { success: false, error: "Nothing active" };

    this.cancelAutoDismiss();
    this.phase = "dismissing";
    this.startFallbackTimer();
    this.sendToOverlay?.("sto:lower-third:dismiss", {});
    this.emitState();
    return { success: true, value: undefined };
  }

  forceClear(): void {
    this.cancelAutoDismiss();
    this.cancelFallbackTimer();
    const previous = this.active;
    this.active = null;
    this.phase = "hidden";
    this.autoDismissAt = null;
    this.sendToOverlay?.("sto:lower-third:force-clear", {});
    if (previous) this.returnToLibrary(previous);
    this.emitState();
  }

  // ── Phase Tracking ────────────────────────────────────────────────────────

  reportPhase(phase: AnimationPhase): void {
    this.cancelFallbackTimer();
    this.phase = phase;

    if (phase === "hidden") {
      const previous = this.active;
      this.active = null;
      this.autoDismissAt = null;
      if (previous) this.returnToLibrary(previous);
    }

    this.emitState();
  }

  // ── Page Navigation ───────────────────────────────────────────────────────

  pageNext(): Result<void, string> {
    if (this.isTransitionLocked()) return { success: false, error: "Transition in progress" };
    if (!this.active?.pages) return { success: false, error: "No paginated content" };
    if (this.active.pages.currentPage >= this.active.pages.totalPages) return { success: false, error: "Already on last page" };

    this.active.pages.currentPage++;
    this.phase = "showing";
    this.startFallbackTimer();
    this.sendToOverlay?.("sto:lower-third:page", { page: this.active.pages.currentPage });
    this.emitState();
    return { success: true, value: undefined };
  }

  pagePrevious(): Result<void, string> {
    if (this.isTransitionLocked()) return { success: false, error: "Transition in progress" };
    if (!this.active?.pages) return { success: false, error: "No paginated content" };
    if (this.active.pages.currentPage <= 1) return { success: false, error: "Already on first page" };

    this.active.pages.currentPage--;
    this.phase = "showing";
    this.startFallbackTimer();
    this.sendToOverlay?.("sto:lower-third:page", { page: this.active.pages.currentPage });
    this.emitState();
    return { success: true, value: undefined };
  }

  // ── Measurement ───────────────────────────────────────────────────────────

  reportPages(itemId: string, pages: PageBreakdown): void {
    this.clearMeasurementTimeout(itemId);
    const item = this.library.find((item) => item.id === itemId);
    if (item) {
      item.pages = pages;
      this.emitState();
    }
    if (this.active?.id === itemId) {
      this.active.pages = pages;
      this.emitState();
    }
  }

  getPendingMeasurements(): LowerThirdItem[] {
    return this.library.filter((item) => item.type === "Scripture" && item.pages === null);
  }

  requestMeasurement(item: LowerThirdItem): void {
    if (item.type !== "Scripture") return;
    const content = item.content as ScriptureContent;
    if (!content.verses || content.verses.length === 0) return;

    this.sendToOverlay?.("sto:lower-third:measure", { itemId: item.id, verses: content.verses, reference: content.formattedReference });

    // Start measurement timeout
    const timer = setTimeout(() => {
      this.measurementTimers.delete(item.id);
      if (!this.library.find((item) => item.id === item.id)?.pages) {
        logger.warn("Scripture measurement timed out, assuming single page", { context: { itemId: item.id } });
        const fallbackPages: PageBreakdown = {
          totalPages: 1,
          currentPage: 1,
          pages: [{ pageNumber: 1, startVerse: content.verses![0]!.verseNumber, endVerse: content.verses![content.verses!.length - 1]!.verseNumber }],
          useWideWidth: false,
        };
        this.reportPages(item.id, fallbackPages);
      }
    }, MEASUREMENT_TIMEOUT_MS);
    this.measurementTimers.set(item.id, timer);
  }

  // ── State ─────────────────────────────────────────────────────────────────

  getFullState(): LowerThirdState {
    return {
      active: this.active,
      library: this.library,
      phase: this.phase,
      autoDismissAt: this.autoDismissAt,
      overlayConnected: this.overlayConnected,
      overlayResolutionCorrect: this.overlayResolutionCorrect,
      transitionLocked: this.isTransitionLocked(),
      overlayStale: this.overlayStale,
    };
  }

  getActive(): LowerThirdItem | null {
    return this.active;
  }

  getAnimationPhase(): AnimationPhase {
    return this.phase;
  }

  isTransitionLocked(): boolean {
    return this.phase === "showing" || this.phase === "dismissing";
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy(): void {
    this.cancelAutoDismiss();
    this.cancelFallbackTimer();
    if (this.staleTimer) { clearTimeout(this.staleTimer); this.staleTimer = null; }
    for (const timer of this.measurementTimers.values()) clearTimeout(timer);
    this.measurementTimers.clear();
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private emitState(): void {
    eventBus.emit(BUS_LOWER_THIRD_STATE_CHANGED, this.getFullState());
  }

  private recomputeTemplateItems(): void {
    const manifest = this.manifestService.get();
    const templates = this.dao.getLowerThirdTemplates();

    // Remove template items that are no longer resolvable (unless active)
    this.library = this.library.filter((item) => {
      if (item.source !== "template") return true;
      if (this.active?.id === item.id) return true;
      const template = templates.find((template) => template.id === item.templateId);
      if (!template) return false;
      return this.isTemplateResolvable(template, manifest);
    });

    // Add newly resolvable templates
    for (const template of templates) {
      if (!this.isTemplateResolvable(template, manifest)) continue;
      if (this.library.some((item) => item.templateId === template.id)) continue;

      const item = this.buildTemplateItem(template, manifest);
      if (item) {
        this.library.push(item);
        if (item.type === "Scripture" && this.overlayConnected) {
          this.requestMeasurement(item);
        }
      }
    }

    this.emitState();
  }

  private isTemplateResolvable(template: MetadataTemplateRow, manifest: SessionManifestFields): boolean {
    const json = JSON.parse(template.formatString) as Record<string, string>;
    for (const value of Object.values(json)) {
      TOKEN_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = TOKEN_PATTERN.exec(value)) !== null) {
        const token = match[1];
        if (token === "Date") continue;
        if (token === "Speaker" && !manifest.speaker) return false;
        if (token === "Title" && !manifest.title) return false;
        if (token === "Scripture" && !manifest.scripture) return false;
      }
    }
    return true;
  }

  private buildTemplateItem(template: MetadataTemplateRow, manifest: SessionManifestFields): LowerThirdItem | null {
    const json = JSON.parse(template.formatString) as Record<string, string>;
    const interpolate = (text: string): string =>
      text
        .replace("{Speaker}", manifest.speaker ?? "")
        .replace("{Title}", manifest.title ?? "")
        .replace("{Date}", new Date().toISOString().slice(0, 10))
        .replace("{Scripture}", manifest.scripture ? formatScripture(manifest.scripture) : "");

    let content: TitleContent | TitleSubtitleContent | ScriptureContent;
    const type = template.lowerThirdType as LowerThirdType;

    if (type === "Scripture") {
      if (!manifest.scripture) return null;
      const verses = this.lookupVerses(manifest.scripture);
      content = { reference: manifest.scripture, formattedReference: formatScripture(manifest.scripture), verses };
    } else if (type === "TitleSubtitle") {
      content = { title: interpolate(json["title"] ?? ""), subtitle: interpolate(json["subtitle"] ?? "") };
    } else {
      content = { title: interpolate(json["title"] ?? "") };
    }

    return {
      id: createId(),
      type,
      style: DEFAULT_STYLE,
      content,
      autoDismissMs: template.autoDismissMs ?? null,
      source: "template",
      templateId: template.id,
      templateName: template.name,
      used: false,
      createdAt: new Date().toISOString(),
      pages: null,
    };
  }

  private buildItem(input: AddLowerThirdInput, source: "volunteer"): Result<LowerThirdItem, string> {
    const content = this.resolveContent(input.type, input.content);
    if (!content.success) return content;

    const item: LowerThirdItem = {
      id: createId(),
      type: input.type,
      style: DEFAULT_STYLE,
      content: content.value,
      autoDismissMs: input.autoDismissMs ?? null,
      source,
      templateId: null,
      templateName: null,
      used: false,
      createdAt: new Date().toISOString(),
      pages: null,
    };

    // For scripture, look up verses
    if (input.type === "Scripture") {
      const reference = (input.content as { reference: ScriptureReference }).reference;
      const verses = this.lookupVerses(reference);
      if (verses.length === 0) {
        return { success: false, error: `Scripture not found: ${formatScripture(reference)}` };
      }
      (item.content as ScriptureContent).verses = verses;
    }

    return { success: true, value: item };
  }

  private resolveContent(
    type: LowerThirdType,
    content: TitleContent | TitleSubtitleContent | { reference: ScriptureReference },
  ): Result<TitleContent | TitleSubtitleContent | ScriptureContent, string> {
    if (type === "Scripture") {
      const reference = (content as { reference: ScriptureReference }).reference;
      const verses = this.lookupVerses(reference);
      if (verses.length === 0) return { success: false, error: `Scripture not found: ${formatScripture(reference)}` };
      return { success: true, value: { reference: reference, formattedReference: formatScripture(reference), verses } };
    }
    return { success: true, value: content as TitleContent | TitleSubtitleContent };
  }

  private lookupVerses(ref: ScriptureReference): VerseData[] {
    const endVerse = ref.verseEnd ?? ref.verse;
    const rows = this.database
      .prepare("SELECT VERSENO, VERSETEXT FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? AND VERSENO >= ? AND VERSENO <= ? ORDER BY VERSENO")
      .all(ref.bookId, ref.chapter, ref.verse, endVerse) as Array<{ VERSENO: number; VERSETEXT: string }>;
    return rows.map((row) => ({ verseNumber: row.VERSENO, text: row.VERSETEXT }));
  }

  private markUsed(itemId: string): void {
    const item = this.library.find((item) => item.id === itemId);
    if (item) item.used = true;
  }

  private returnToLibrary(item: LowerThirdItem): void {
    // Template items just deactivate (they're already in the library by templateId)
    // Volunteer items return to the library if they were removed
    // In our model, items stay in the library while active (with badge), so nothing to do
  }

  private startAutoDismissIfNeeded(): void {
    if (!this.active?.autoDismissMs) return;
    const dismissAt = new Date(Date.now() + this.active.autoDismissMs).toISOString();
    this.autoDismissAt = dismissAt;
    this.autoDismissTimer = setTimeout(() => {
      this.autoDismissTimer = null;
      this.autoDismissAt = null;
      this.phase = "dismissing";
      this.startFallbackTimer();
      this.sendToOverlay?.("sto:lower-third:dismiss", {});
      this.emitState();
    }, this.active.autoDismissMs);
  }

  private cancelAutoDismiss(): void {
    if (this.autoDismissTimer) {
      clearTimeout(this.autoDismissTimer);
      this.autoDismissTimer = null;
    }
    this.autoDismissAt = null;
  }

  private startFallbackTimer(): void {
    this.cancelFallbackTimer();
    this.fallbackTimer = setTimeout(() => {
      this.fallbackTimer = null;
      logger.warn("Overlay unresponsive — advancing phase via fallback", { context: { currentPhase: this.phase } });
      if (this.phase === "showing") {
        this.phase = "visible";
      } else if (this.phase === "dismissing") {
        this.phase = "hidden";
        const previous = this.active;
        this.active = null;
        this.autoDismissAt = null;
        if (previous) this.returnToLibrary(previous);
      }
      this.emitState();
    }, FALLBACK_TIMEOUT_MS);
  }

  private cancelFallbackTimer(): void {
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
  }

  private clearMeasurementTimeout(itemId: string): void {
    const timer = this.measurementTimers.get(itemId);
    if (timer) {
      clearTimeout(timer);
      this.measurementTimers.delete(itemId);
    }
  }
}
