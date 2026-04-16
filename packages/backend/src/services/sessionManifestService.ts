import { BUS_OBS_STATE_CHANGED, BUS_SESSION_MANIFEST_UPDATED } from "../socketEvents.js";
import { BIBLE_BOOKS } from "@invisible-av-booth/shared";
import { eventBus } from "../eventBus.js";
import type { SessionManifest, ScriptureReference, ObsState } from "../eventBus.js";
import type { JwtPayload } from "../services/authService.js";
import { logger } from "../logger.js";

export type { SessionManifest, ScriptureReference };

export type ValidationError = { code: "CLEAR_BLOCKED_WHILE_LIVE"; message: string };
export type Result<T, E> = { success: true; value: T } | { success: false; error: E };

// Default template used when no streamTitleTemplate is configured on the device connection.
export const DEFAULT_STREAM_TITLE_TEMPLATE = "{Date} – {Speaker} – {Title}";

export class SessionManifestService {
  private manifest: SessionManifest = {};
  private obsStreaming = false;
  private obsRecording = false;
  private template: string;
  private readonly obsStateHandler: (payload: { state: ObsState }) => void;

  constructor(template = DEFAULT_STREAM_TITLE_TEMPLATE) {
    this.template = template;

    // Subscribe to OBS state changes to track live/recording status.
    this.obsStateHandler = ({ state }: { state: ObsState }) => {
      this.obsStreaming = state.streaming;
      this.obsRecording = state.recording;
    };
    eventBus.subscribe(BUS_OBS_STATE_CHANGED, this.obsStateHandler);
  }

  // Call on service shutdown to remove the EventBus subscription.
  destroy(): void {
    eventBus.unsubscribe(BUS_OBS_STATE_CHANGED, this.obsStateHandler);
  }

  get(): SessionManifest {
    return { ...this.manifest };
  }

  update(patch: Partial<SessionManifest>, actor: JwtPayload): Result<SessionManifest, never> {
    this.manifest = { ...this.manifest, ...patch };
    const interpolatedStreamTitle = this.interpolate(this.manifest, this.template);

    eventBus.emit(BUS_SESSION_MANIFEST_UPDATED, {
      manifest: { ...this.manifest },
      interpolatedStreamTitle,
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

    this.manifest = {};
    const interpolatedStreamTitle = this.interpolate({}, this.template);

    eventBus.emit(BUS_SESSION_MANIFEST_UPDATED, {
      manifest: {},
      interpolatedStreamTitle,
    });

    logger.info("Session manifest cleared", { userId: actor.sub });
    return { success: true, value: undefined };
  }

  // Interpolate a template string with the current manifest values.
  // {Date} is always today's ISO 8601 date — never a user-supplied value.
  // Missing fields produce visible placeholders so the volunteer can see what's absent.
  interpolate(manifest: SessionManifest, template: string): string {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const speaker = manifest.speaker?.trim() || "[No Speaker]";
    const title = manifest.title?.trim() || "[No Title]";
    const scripture = manifest.scripture ? formatScripture(manifest.scripture) : "[No Scripture]";

    return template
      .replace(/\{Date\}/g, today)
      .replace(/\{Speaker\}/g, speaker)
      .replace(/\{Title\}/g, title)
      .replace(/\{Scripture\}/g, scripture);
  }
}

function formatScripture(ref: ScriptureReference): string {
  const bookName = BIBLE_BOOKS[ref.bookId] ?? `Book ${ref.bookId}`;
  const base = `${bookName} ${ref.chapter}:${ref.verse}`;
  return ref.verseEnd ? `${base}-${ref.verseEnd}` : base;
}
