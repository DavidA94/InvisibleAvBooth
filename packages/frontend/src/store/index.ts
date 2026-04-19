import { create } from "zustand";
import { createAuthSlice } from "./authSlice";
import { createObsSlice } from "./obsSlice";
import { createSessionManifestSlice } from "./sessionManifestSlice";
import { createNotificationSlice } from "./notificationSlice";
import type { AuthSlice } from "./authSlice";
import type { ObsSlice } from "./obsSlice";
import type { SessionManifestSlice } from "./sessionManifestSlice";
import type { NotificationSlice } from "./notificationSlice";

export type AppStore = AuthSlice & ObsSlice & SessionManifestSlice & NotificationSlice;

export const useStore = create<AppStore>()((...args) => ({
  ...createAuthSlice(...args),
  ...createObsSlice(...args),
  ...createSessionManifestSlice(...args),
  ...createNotificationSlice(...args),
}));
