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
  SessionManifestFields,
  LowerThirdType,
  LowerThirdState,
  LowerThirdItem,
  LowerThirdCommand,
  AnimationPhase,
  PageBreakdown,
  AddLowerThirdInput,
  EditLowerThirdInput,
} from "@invisible-av-booth/shared";

import type { SessionManifestFields } from "@invisible-av-booth/shared";

export interface SessionManifest extends SessionManifestFields {
  titleTemplateId?: string;
  descriptionTemplateId?: string;
}

export interface ConnectionStatus {
  label: string;
  status: "healthy" | "degraded" | "unhealthy" | "inactive";
}
