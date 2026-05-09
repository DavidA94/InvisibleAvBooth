import type { Database } from "better-sqlite3";
import { BUS_OBS_STATE_CHANGED, BUS_SESSION_MANIFEST_UPDATED } from "../eventBus/types.js";
import { interpolateTemplate, formatScripture } from "@invisible-av-booth/shared";
import type { ScriptureReference } from "@invisible-av-booth/shared";
import { eventBus } from "../eventBus/eventBus.js";
import type { SessionManifest } from "../gateway/modules/sessionManifest/types.js";
import type { ObsState } from "../gateway/modules/obs/types.js";
import type { JwtPayload } from "../services/authService.js";
import { MetadataTemplateDao } from "../dao/metadataTemplateDao.js";
import { logger } from "../logger.js";

export type { SessionManifest };
export type ValidationError = { code: "CLEAR_BLOCKED_WHILE_LIVE"; message: string };
export type Result<T, E> = { success: true; value: T } | { success: false; error: E };
export const DEFAULT_STREAM_TITLE_TEMPLATE = "{Date} – {Speaker} – {Title}";

export interface InterpolatedState {
  interpolatedStreamTitle: string;
  interpolatedDescription: string;
  manifestReady: boolean;
}

export class SessionManifestService {
  private manifest: SessionManifest = {};
  private obsStreaming = false;
  private obsRecording = false;
  private readonly dao: MetadataTemplateDao;
  private readonly database: Database;
  private cachedInterpolatedTitle = "";
  private cachedInterpolatedDescription = "";
  private cachedManifestReady = false;
  private readonly obsStateHandler: (payload: { state: ObsState }) => void;

  constructor(database: Database) {
    this.database = database;
    this.dao = new MetadataTemplateDao(database);

    this.obsStateHandler = ({ state }: { state: ObsState }) => {
      this.obsStreaming = state.streaming;
      this.obsRecording = state.recording;
    };
    eventBus.subscribe(BUS_OBS_STATE_CHANGED, this.obsStateHandler);
  }

  destroy(): void {
    eventBus.unsubscribe(BUS_OBS_STATE_CHANGED, this.obsStateHandler);
  }

  get(): SessionManifest {
    return { ...this.manifest };
  }

  getInterpolated(): InterpolatedState {
    return {
      interpolatedStreamTitle: this.cachedInterpolatedTitle,
      interpolatedDescription: this.cachedInterpolatedDescription,
      manifestReady: this.cachedManifestReady,
    };
  }

  update(patch: Partial<SessionManifest>, actor: JwtPayload): Result<SessionManifest, never> {
    this.manifest = { ...this.manifest, ...patch };
    this.recompute();

    eventBus.emit(BUS_SESSION_MANIFEST_UPDATED, {
      manifest: { ...this.manifest },
      interpolatedStreamTitle: this.cachedInterpolatedTitle,
      interpolatedDescription: this.cachedInterpolatedDescription,
      manifestReady: this.cachedManifestReady,
    });

    logger.info("Session manifest updated", { userId: actor.sub });
    return { success: true, value: { ...this.manifest } };
  }

  clear(actor: JwtPayload): Result<void, ValidationError> {
    if (this.obsStreaming || this.obsRecording) {
      return {
        success: false,
        error: { code: "CLEAR_BLOCKED_WHILE_LIVE", message: "Cannot clear manifest while streaming or recording" },
      };
    }

    // Preserve template selections across clear — the operator chose these templates
    // for the session and likely wants to keep them for the next service.
    const preserved: SessionManifest = {};
    if (this.manifest.titleTemplateId) preserved.titleTemplateId = this.manifest.titleTemplateId;
    if (this.manifest.descriptionTemplateId) preserved.descriptionTemplateId = this.manifest.descriptionTemplateId;
    this.manifest = preserved;
    this.recompute();

    eventBus.emit(BUS_SESSION_MANIFEST_UPDATED, {
      manifest: { ...this.manifest },
      interpolatedStreamTitle: this.cachedInterpolatedTitle,
      interpolatedDescription: this.cachedInterpolatedDescription,
      manifestReady: this.cachedManifestReady,
    });

    logger.info("Session manifest cleared", { userId: actor.sub });
    return { success: true, value: undefined };
  }

  /**
   * Recomputes cached interpolated values from current manifest and DAO templates.
   * Called after every manifest mutation.
   */
  private recompute(): void {
    const resolver = this.createVerseTextResolver();

    const titleTemplate = this.manifest.titleTemplateId ? this.dao.getById(this.manifest.titleTemplateId) : null;
    const descriptionTemplate = this.manifest.descriptionTemplateId ? this.dao.getById(this.manifest.descriptionTemplateId) : null;

    const titleFormat = titleTemplate?.formatString ?? DEFAULT_STREAM_TITLE_TEMPLATE;
    const descriptionFormat = descriptionTemplate?.formatString ?? "";

    this.cachedInterpolatedTitle = interpolateTemplate(this.manifest, titleFormat, resolver);
    this.cachedInterpolatedDescription = descriptionFormat ? interpolateTemplate(this.manifest, descriptionFormat, resolver) : "";
    this.cachedManifestReady = this.computeManifestReady(titleFormat, descriptionFormat);
  }

  /**
   * manifestReady is true when a title template is selected AND every token
   * referenced in both templates has a non-empty value in the manifest.
   * {Date} is always satisfied (auto-filled). {verseText} is satisfied when scripture is set.
   */
  private computeManifestReady(titleFormat: string, descriptionFormat: string): boolean {
    if (!this.manifest.titleTemplateId) return false;

    const combined = titleFormat + descriptionFormat;
    const tokenPattern = /\{(\w+)\}/g;
    let match: RegExpExecArray | null;

    while ((match = tokenPattern.exec(combined)) !== null) {
      const token = match[1]!;
      if (token === "Date") continue;
      if (token === "Speaker" && !this.manifest.speaker?.trim()) return false;
      if (token === "Title" && !this.manifest.title?.trim()) return false;
      if (token === "Scripture" && !this.manifest.scripture) return false;
      if (token === "verseText" && !this.manifest.scripture) return false;
    }

    return true;
  }

  /**
   * Returns a resolver function that queries the KJV table for verse text.
   * Used by interpolateTemplate to expand {verseText} tokens.
   */
  private createVerseTextResolver(): (ref: ScriptureReference) => string {
    return (ref: ScriptureReference): string => {
      if (ref.verseEnd) {
        const rows = this.database
          .prepare("SELECT VERSENO, VERSETEXT FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? AND VERSENO BETWEEN ? AND ? ORDER BY VERSENO")
          .all(ref.bookId, ref.chapter, ref.verse || 1, ref.verseEnd) as { VERSENO: number; VERSETEXT: string }[];
        if (rows.length === 0) return "[No Verse Text]";
        const refLine = formatScripture(ref);
        const lines = [refLine];
        for (const row of rows) {
          if (row.VERSENO === 0) {
            lines.push(row.VERSETEXT);
          } else {
            lines.push(`${row.VERSENO}. ${row.VERSETEXT}`);
          }
        }
        return lines.join("\n");
      }
      if (ref.verse === 0) {
        const rows = this.database
          .prepare("SELECT VERSENO, VERSETEXT FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? ORDER BY VERSENO")
          .all(ref.bookId, ref.chapter) as {
          VERSENO: number;
          VERSETEXT: string;
        }[];
        if (rows.length === 0) return "[No Verse Text]";
        const refLine = formatScripture(ref);
        const lines = [refLine];
        for (const row of rows) {
          if (row.VERSENO === 0) {
            lines.push(row.VERSETEXT);
          } else {
            lines.push(`${row.VERSENO}. ${row.VERSETEXT}`);
          }
        }
        return lines.join("\n");
      }
      const row = this.database
        .prepare("SELECT VERSETEXT FROM kjv WHERE BOOKID = ? AND CHAPTERNO = ? AND VERSENO = ?")
        .get(ref.bookId, ref.chapter, ref.verse) as { VERSETEXT: string } | undefined;
      if (!row) return "[Verse not found]";
      // Single verse: reference – text (inline format)
      return `${formatScripture(ref)} – ${row.VERSETEXT}`;
    };
  }
}
