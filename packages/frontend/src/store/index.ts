import { create } from "zustand";
import { createAuthSlice } from "./authSlice";
import { createObsSlice } from "./obsSlice";
import { createSessionManifestSlice } from "./sessionManifestSlice";
import { createNotificationSlice } from "./notificationSlice";
import { createPlatformSlice } from "./platformSlice";
import { createLowerThirdSlice } from "./lowerThirdSlice";
import { createObsPreviewSlice } from "./obsPreviewSlice";
import { createCameraSlice } from "./cameraSlice";
import type { AuthSlice } from "./authSlice";
import type { ObsSlice } from "./obsSlice";
import type { SessionManifestSlice } from "./sessionManifestSlice";
import type { NotificationSlice } from "./notificationSlice";
import type { PlatformSlice } from "./platformSlice";
import type { LowerThirdSlice } from "./lowerThirdSlice";
import type { ObsPreviewSlice } from "./obsPreviewSlice";
import type { CameraSlice } from "./cameraSlice";

export type AppStore = AuthSlice & ObsSlice & SessionManifestSlice & NotificationSlice & PlatformSlice & LowerThirdSlice & ObsPreviewSlice & CameraSlice;

export const useStore = create<AppStore>()((...args) => ({
  ...createAuthSlice(...args),
  ...createObsSlice(...args),
  ...createSessionManifestSlice(...args),
  ...createNotificationSlice(...args),
  ...createPlatformSlice(...args),
  ...createLowerThirdSlice(...args),
  ...createObsPreviewSlice(...args),
  ...createCameraSlice(...args),
}));
