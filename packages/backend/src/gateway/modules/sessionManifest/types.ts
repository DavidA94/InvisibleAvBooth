import type { BUS_SESSION_MANIFEST_UPDATED } from "../../../eventBus/types.js";

export interface SessionManifest {
  speaker?: string;
  title?: string;
  scripture?: ScriptureReference;
}

export interface ScriptureReference {
  bookId: number;
  chapter: number;
  verse: number;
  verseEnd?: number;
}

// EventMap slice — merged into the root EventMap in eventBus.ts
export interface SessionManifestEventMap {
  [BUS_SESSION_MANIFEST_UPDATED]: {
    manifest: SessionManifest;
    // interpolatedStreamTitle is pre-computed once so all subscribers
    // (ObsService, SocketGateway) read the same value without re-interpolating.
    interpolatedStreamTitle: string;
  };
}
