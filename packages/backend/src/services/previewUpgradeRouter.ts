/**
 * PreviewUpgradeRouter — owns the single `server.on("upgrade")` registration for
 * all `/preview/*` WebSocket endpoints (Req 24a).
 *
 * WHY extracted from PreviewStreamManager: the old class did two jobs — upgrade
 * registration + cookie-JWT auth AND video stream management — and its name was
 * video-specific. The mixer envelope needs the upgrade entry point but none of
 * the video machinery. Rather than have the video class forward to an audio peer
 * (coupling video↔audio), the upgrade entry point lives here and the two media
 * handlers are peers that know nothing about each other. Adding a future preview
 * transport is a new dispatch line here + a new handler — no existing manager
 * changes (steering §2/§8).
 *
 * Responsibilities: verify the cookie JWT ONCE; dispatch by path to a media
 * handler; 401 on bad/absent token, 404 on an unmatched path. Media-agnostic.
 */

import type { Server as HttpServer, IncomingMessage } from "http";
import type { Duplex } from "stream";
import type { AuthUser } from "@invisible-av-booth/shared";
import type { AuthService } from "./authService.js";
import { logger } from "../logger.js";

/** The subset of a media manager the router dispatches to. */
export interface PreviewMediaHandler {
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, user: AuthUser): void;
}

export class PreviewUpgradeRouter {
  private cleanupRegistered = false;

  constructor(
    private readonly authService: AuthService,
    private readonly videoPreviewManager: PreviewMediaHandler,
    private readonly audioPreviewManager: PreviewMediaHandler,
  ) {}

  /** Register the `server.on("upgrade")` handler for `/preview/*`. */
  registerUpgrade(server: HttpServer): void {
    server.on("upgrade", (request, socket, head) => {
      const url = request.url ?? "";
      if (!url.startsWith("/preview/")) return; // not ours — leave for other upgrade handlers (Socket.io)

      // Verify the cookie JWT ONCE for every preview endpoint.
      const cookies = parseCookieHeader(request.headers.cookie ?? "");
      const token = cookies["token"];
      if (!token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const result = this.authService.verifyToken(token);
      if (!result.success) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const user: AuthUser = { id: result.value.sub, username: result.value.username, role: result.value.role };

      // Dispatch by path. Audio (mixer) first, then video (obs/camera), else 404.
      if (url.startsWith("/preview/mixer/")) {
        this.audioPreviewManager.handleUpgrade(request, socket, head, user);
        return;
      }
      if (url.startsWith("/preview/obs") || url.startsWith("/preview/camera/")) {
        this.videoPreviewManager.handleUpgrade(request, socket, head, user);
        return;
      }
      socket.write("HTTP/1.1 404 Not Found\r\n\r\n");
      socket.destroy();
    });
  }

  /**
   * Register process signal handlers ONCE at the app level. destroy() should be
   * called router-first (stop accepting upgrades) then on each manager.
   */
  registerSignalHandlers(onShutdown: () => void): void {
    if (this.cleanupRegistered) return;
    this.cleanupRegistered = true;
    const cleanup = (): void => {
      logger.info("PreviewUpgradeRouter: shutting down preview transport");
      onShutdown();
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  }
}

// ── Cookie parsing ────────────────────────────────────────────────────────────

export function parseCookieHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index < 0) continue;
    result[pair.substring(0, index).trim()] = pair.substring(index + 1).trim();
  }
  return result;
}
