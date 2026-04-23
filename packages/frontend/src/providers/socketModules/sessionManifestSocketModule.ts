import type { Socket } from "socket.io-client";
import { STC_SESSION_MANIFEST_UPDATED } from "@invisible-av-booth/shared";
import type { SessionManifest } from "../../types";
import { useStore } from "../../store";

export function registerSessionManifestSocketHandlers(socket: Socket): void {
  socket.on(STC_SESSION_MANIFEST_UPDATED, (payload: { manifest: SessionManifest; interpolatedStreamTitle: string }) => {
    useStore.getState().setManifest(payload.manifest, payload.interpolatedStreamTitle);
  });
}
