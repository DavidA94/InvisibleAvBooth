import type { Socket } from "socket.io-client";
import { STC_CAMERA_STATE, STC_CAMERA_STATE_UPDATE } from "@invisible-av-booth/shared";
import type { CameraState } from "@invisible-av-booth/shared";
import { useStore } from "../../store";

export function registerCameraSocketHandlers(socket: Socket): void {
  socket.on(STC_CAMERA_STATE, (data: { cameras: CameraState[]; ndiAvailable: boolean }) => {
    useStore.getState().setAllCameraStates(data.cameras);
  });

  socket.on(STC_CAMERA_STATE_UPDATE, (state: CameraState) => {
    useStore.getState().setCameraState(state);
  });
}
