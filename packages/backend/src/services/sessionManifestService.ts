import { BUS_OBS_STATE_CHANGED, BUS_SESSION_MANIFEST_UPDATED } from "../eventBus/types.js";
import { interpolateStreamTitle } from "@invisible-av-booth/shared";
import { eventBus } from "../eventBus/eventBus.js";
import type { SessionManifest } from "../gateway/modules/sessionManifest/types.js";
import type { ObsState } from "../gateway/modules/obs/types.js";
import type { JwtPayload } from "../services/authService.js";
import { logger } from "../logger.js";

export type { SessionManifest };

export type ValidationError = { code: "CLEAR_BLOCKED_WHILE_LIVE"; message: string };
export type Result<T, E> = { success: true; value: T } | { success: false; error: E };

export const DEFAULT_STREAM_TITLE_TEMPLATE = "{Date} – {Speaker} – {Title}";

export class SessionManifestService {
  private manifest: SessionManifest = {};
  private obsStreaming = false;
  private obsRecording = false;
  private template: string;
  private readonly obsStateHandler: (payload: { state: ObsState }) => void;

  constructor(template = DEFAULT_STREAM_TITLE_TEMPLATE) {
    this.template = template;

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

  getTemplate(): string {
    return this.template;
  }

  update(patch: Partial<SessionManifest>, actor: JwtPayload): Result<SessionManifest, never> {
    this.manifest = { ...this.manifest, ...patch };
    const interpolatedStreamTitle = interpolateStreamTitle(this.manifest, this.template);

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
    const interpolatedStreamTitle = interpolateStreamTitle({}, this.template);

    eventBus.emit(BUS_SESSION_MANIFEST_UPDATED, {
      manifest: {},
      interpolatedStreamTitle,
    });

    logger.info("Session manifest cleared", { userId: actor.sub });
    return { success: true, value: undefined };
  }

  preview(draft: Partial<SessionManifest>): string {
    return interpolateStreamTitle(draft, this.template);
  }
}
