// Frontend data models — mirrors the backend types used in Socket.io payloads.

export type Role = "ADMIN" | "AvPowerUser" | "AvVolunteer";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  requiresPasswordChange?: boolean;
}

export interface ScriptureReference {
  bookId: number;
  chapter: number;
  verse: number;
  verseEnd?: number;
}

export interface SessionManifest {
  speaker?: string;
  title?: string;
  scripture?: ScriptureReference;
}

export interface ObsState {
  connected: boolean;
  streaming: boolean;
  recording: boolean;
  streamTimecode?: string;
  recordingTimecode?: string;
  commandedState: {
    streaming: boolean;
    recording: boolean;
  };
}

export type ObsCommandType = "startStream" | "stopStream" | "startRecording" | "stopRecording";

export interface ObsCommand {
  type: ObsCommandType;
}

export type CommandResult = { success: true } | { success: false; errorCode: string; message: string };

export type NotificationLevel = "toast" | "banner" | "modal";
export type NotificationSeverity = "info" | "warning" | "error";

export interface Notification {
  id: string;
  level: NotificationLevel;
  severity: NotificationSeverity;
  message: string;
  errorCode?: string;
  autoResolve?: boolean;
}
