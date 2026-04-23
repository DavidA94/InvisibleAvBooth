// Re-export shared types — single source of truth is @invisible-av-booth/shared.
export type {
  Role,
  AuthUser,
  ObsState,
  ObsCommandType,
  ObsCommand,
  CommandResult,
  NotificationLevel,
  NotificationSeverity,
  Notification,
  GridManifest,
  GridCell,
  ScriptureReference,
  SessionManifestFields as SessionManifest,
} from "@invisible-av-booth/shared";
