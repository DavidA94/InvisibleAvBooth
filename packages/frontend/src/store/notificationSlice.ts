import type { StateCreator } from "zustand";
import type { Notification } from "../types";

export interface NotificationSlice {
  notifications: Notification[];
  addNotification: (notification: Notification) => void;
  removeNotification: (id: string) => void;
}

export const createNotificationSlice: StateCreator<NotificationSlice> = (set) => ({
  notifications: [],
  addNotification: (notification) => set((state) => ({ notifications: [...state.notifications, notification] })),
  removeNotification: (id) => set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
});
