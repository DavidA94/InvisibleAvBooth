import type { BUS_SESSION_MANIFEST_UPDATED } from "../../../eventBus/types.js";

export interface SessionManifest {
  speaker?: string;
  title?: string;
  scripture?: ScriptureReference;
  titleTemplateId?: string;
  descriptionTemplateId?: string;
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
    interpolatedStreamTitle: string;
    interpolatedDescription: string;
    manifestReady: boolean;
  };
}
