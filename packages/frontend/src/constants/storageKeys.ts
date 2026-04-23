// Centralized localStorage key constants.

export const STORAGE_KEY_LAST_USERNAME = "lastUsername";
export const STORAGE_KEY_DASHBOARD_NAME = "dashboardName";

/** Returns the localStorage key for a cached dashboard layout. */
export const storageDashboardLayoutKey = (dashboardId: string): string => `dashboardLayout:${dashboardId}`;
