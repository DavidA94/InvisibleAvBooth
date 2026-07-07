import type { Server } from "socket.io";
import type { SocketModule, AuthenticatedSocket } from "../gateway/modules/socketModule.js";
import type { CameraService } from "./CameraService.js";
import { eventBus } from "../eventBus/eventBus.js";
import { BUS_CAMERA_STATE_CHANGED } from "../eventBus/types.js";
import {
  STC_CAMERA_STATE,
  STC_CAMERA_STATE_UPDATE,
  CTS_CAMERA_PTZ_MOVE_START,
  CTS_CAMERA_PTZ_MOVE_KEEPALIVE,
  CTS_CAMERA_PTZ_MOVE_STOP,
  CTS_CAMERA_SET,
  CTS_CAMERA_PRESET_ACTIVATE,
  CTS_CAMERA_PTZ_TAP_TO_CENTER,
} from "@invisible-av-booth/shared";
import { logger } from "../logger.js";

export class CameraSocketModule implements SocketModule {
  private cameraService: CameraService;

  constructor(cameraService: CameraService) {
    this.cameraService = cameraService;
  }

  register(io: Server): void {
    eventBus.subscribe(BUS_CAMERA_STATE_CHANGED, ({ state }) => {
      io.emit(STC_CAMERA_STATE_UPDATE, state);
    });
  }

  registerSocket(auth: AuthenticatedSocket): void {
    const { socket, jwtPayload } = auth;
    const role = jwtPayload.role;

    socket.on(CTS_CAMERA_PTZ_MOVE_START, (payload: { cameraId: string; pan: number; tilt: number }) => {
      logger.info("Camera PTZ move:start", { userId: jwtPayload.sub, context: { cameraId: payload.cameraId, pan: payload.pan, tilt: payload.tilt } });
      this.cameraService.startMove(payload.cameraId, payload.pan, payload.tilt);
    });

    socket.on(CTS_CAMERA_PTZ_MOVE_KEEPALIVE, (payload: { cameraId: string; pan: number; tilt: number }) => {
      this.cameraService.keepAliveMove(payload.cameraId, payload.pan, payload.tilt);
    });

    socket.on(CTS_CAMERA_PTZ_MOVE_STOP, (payload: { cameraId: string }) => {
      logger.info("Camera PTZ move:stop", { userId: jwtPayload.sub, context: { cameraId: payload.cameraId } });
      this.cameraService.stopMove(payload.cameraId);
    });

    socket.on(
      CTS_CAMERA_SET,
      (payload: { cameraId: string; zoom?: number; focus?: number; autoFocus?: boolean; aiTracking?: boolean; aiTilt?: boolean; aiZoom?: boolean }) => {
        logger.debug("Camera set command", {
          userId: jwtPayload.sub,
          context: { cameraId: payload.cameraId, fields: Object.keys(payload).filter((k) => k !== "cameraId") },
        });
        // Role enforcement: AvVolunteer can only set zoom
        if (role === "AvVolunteer") {
          if (payload.zoom !== undefined) {
            this.cameraService.applySet(payload.cameraId, { zoom: payload.zoom });
          }
        } else {
          const { cameraId: _, ...fields } = payload;
          this.cameraService.applySet(payload.cameraId, fields);
        }
      },
    );

    socket.on(
      CTS_CAMERA_PRESET_ACTIVATE,
      async (payload: { cameraId: string; presetId: string }, ack?: (result: { success: boolean; error?: string }) => void) => {
        logger.info("Camera preset activate", { userId: jwtPayload.sub, context: { cameraId: payload.cameraId, presetId: payload.presetId } });
        const result = await this.cameraService.activatePreset(payload.cameraId, payload.presetId);
        ack?.(result);
      },
    );

    socket.on(CTS_CAMERA_PTZ_TAP_TO_CENTER, (payload: { cameraId: string; offsetX: number; offsetY: number }) => {
      logger.info("Tap-to-center received", { userId: jwtPayload.sub, context: { cameraId: payload.cameraId } });
      const meta = this.cameraService.getCameraMetadata(payload.cameraId);
      if (!meta) {
        logger.warn("Tap-to-center: camera metadata not found", { context: { cameraId: payload.cameraId } });
        return;
      }
      this.cameraService.tapToCenter(payload.cameraId, payload.offsetX, payload.offsetY, meta);
    });
  }

  emitInitialState(auth: AuthenticatedSocket): void {
    auth.socket.emit(STC_CAMERA_STATE, {
      cameras: this.cameraService.getAllCameraStates(),
      ndiAvailable: true,
    });
  }
}
