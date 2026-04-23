// Shared types used by both frontend and backend.
// These are the canonical definitions — frontend and backend import from here.

export type Role = "ADMIN" | "AvPowerUser" | "AvVolunteer";

export interface AuthUser {
  id: string;
  username: string;
  role: Role;
  requiresPasswordChange?: boolean;
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

export type CommandResult = { success: true } | { success: false; error: string };

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

export interface GridManifest {
  version: 1;
  cells: GridCell[];
}

export interface GridCell {
  widgetId: string;
  title: string;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  roleMinimum: Role;
}
