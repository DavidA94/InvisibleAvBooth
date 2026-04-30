import type { PlatformConfig } from "../gateway/modules/platform/types.js";

export type { PlatformConfig };

export interface BroadcastInfo {
  broadcastId: string;
  streamUrl: string;
  streamKey: string;
}

export interface PlatformHealth {
  healthy: boolean;
  streamHealth?: string;
  viewerCount?: number;
}

// Alias for backward compatibility with existing client implementations
export type PlatformHealthDetails = PlatformHealth;

export interface TokenInfo {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export type PlatformErrorCode =
  | "TOKEN_EXPIRED"
  | "TOKEN_REFRESH_FAILED"
  | "BROADCAST_CREATE_FAILED"
  | "BROADCAST_END_FAILED"
  | "HEALTH_POLL_FAILED"
  | "PAGE_INACCESSIBLE"
  | "QUOTA_EXCEEDED"
  | "NETWORK_ERROR";

export class PlatformError extends Error {
  constructor(
    public readonly code: PlatformErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlatformError";
  }
}

// Interface matching the existing YouTube/Facebook client implementations.
// Methods throw PlatformError on failure rather than returning Result types.
export interface StreamingPlatformClient {
  createBroadcast(title: string, description: string, privacy?: string): Promise<BroadcastInfo>;
  endBroadcast(broadcastId: string): Promise<void>;
  getBroadcastStatus(broadcastId: string): Promise<string>;
  pollHealth(): Promise<PlatformHealth>;
  refreshToken(): Promise<TokenInfo>;
  validateToken(): Promise<boolean>;
}
