// Centralized test ID constants for use in components, unit tests, and E2E tests.
// All constants use the TEST_ID_ prefix for easy discovery via intellisense.

// ── Login ──────────────────────────────────────────────────────────────────────
export const TEST_ID_LOGIN_PAGE = "login-page";
export const TEST_ID_LOGIN_FORM = "login-form";
export const TEST_ID_LOGIN_USERNAME = "login-username";
export const TEST_ID_LOGIN_PASSWORD = "login-password";
export const TEST_ID_LOGIN_REMEMBER = "login-remember";
export const TEST_ID_LOGIN_SUBMIT = "login-submit";
export const TEST_ID_LOGIN_ERROR = "login-error";

// ── Change Password ────────────────────────────────────────────────────────────
export const TEST_ID_CHANGE_PASSWORD_PAGE = "change-password-page";
export const TEST_ID_CHANGE_PASSWORD_FORM = "change-password-form";
export const TEST_ID_NEW_PASSWORD_INPUT = "new-password-input";
export const TEST_ID_CONFIRM_PASSWORD_INPUT = "confirm-password-input";
export const TEST_ID_CHANGE_PASSWORD_SUBMIT = "change-password-submit";
export const TEST_ID_CHANGE_PASSWORD_ERROR = "change-password-error";

// ── Global Title Bar ───────────────────────────────────────────────────────────
export const TEST_ID_GLOBAL_TITLE_BAR = "global-title-bar";
export const TEST_ID_TITLE_BAR_DASHBOARD_NAV = "title-bar-dashboard-nav";
export const TEST_ID_TITLE_BAR_USERNAME = "title-bar-username";
export const TEST_ID_TITLE_BAR_ROLE = "title-bar-role";
export const TEST_ID_TITLE_BAR_LOGOUT_BUTTON = "title-bar-logout-btn";

// ── Dashboard ──────────────────────────────────────────────────────────────────
export const TEST_ID_DASHBOARD_GRID = "dashboard-grid";
export const TEST_ID_DASHBOARD_LOADING = "dashboard-loading";
export const TEST_ID_DASHBOARD_REFRESHING = "dashboard-refreshing";
export const TEST_ID_DASHBOARD_SELECTION_SCREEN = "dashboard-selection-screen";
export const TEST_ID_DASHBOARD_OPTION = "dashboard-option";
export const TEST_ID_NO_DASHBOARDS_SCREEN = "no-dashboards-screen";

// ── Modal ──────────────────────────────────────────────────────────────────────
export const TEST_ID_MODAL_BACKDROP = "modal-backdrop";
export const TEST_ID_MODAL_CONTAINER = "modal-container";
export const TEST_ID_MODAL_HEADER = "modal-header";
export const TEST_ID_MODAL_BODY = "modal-body";
export const TEST_ID_MODAL_FOOTER = "modal-footer";

// ── Confirmation Modal ─────────────────────────────────────────────────────────
export const TEST_ID_CONFIRMATION_BODY = "confirmation-body";
export const TEST_ID_CONFIRMATION_CANCEL_BUTTON = "confirmation-cancel-btn";
export const TEST_ID_CONFIRMATION_CONFIRM_BUTTON = "confirmation-confirm-btn";

// ── Notifications ──────────────────────────────────────────────────────────────
export const TEST_ID_NOTIFICATION_BANNER = "notification-banner";
export const TEST_ID_BANNER_COUNTER = "banner-counter";
export const TEST_ID_BANNER_DISMISS = "banner-dismiss";
export const TEST_ID_NOTIFICATION_MODAL = "notification-modal";

// ── Widget Container ───────────────────────────────────────────────────────────
export const TEST_ID_WIDGET_CONTAINER = "widget-container";
export const TEST_ID_WIDGET_TITLE_BAR = "widget-title-bar";
export const TEST_ID_CONNECTION_INDICATORS = "connection-indicators";
export const TEST_ID_CONNECTION_POPOVER = "connection-popover";

// ── Widget Error Overlay ───────────────────────────────────────────────────────
export const TEST_ID_WIDGET_ERROR_OVERLAY = "widget-error-overlay";
export const TEST_ID_ERROR_OVERLAY_MESSAGE = "error-overlay-message";
export const TEST_ID_ERROR_OVERLAY_ACTION = "error-overlay-action";

// ── OBS Widget ─────────────────────────────────────────────────────────────────
export const TEST_ID_OBS_WIDGET = "obs-widget";
export const TEST_ID_OBS_STATUS_BAR = "obs-status-bar";
export const TEST_ID_OBS_METADATA_PREVIEW = "obs-metadata-preview";
export const TEST_ID_OBS_CONTROLS = "obs-controls";
export const TEST_ID_OBS_STREAM_BUTTON = "obs-stream-btn";
export const TEST_ID_OBS_RECORD_BUTTON = "obs-record-btn";
export const TEST_ID_STREAM_STATUS = "stream-status";
export const TEST_ID_STREAM_TIMECODE = "stream-timecode";
export const TEST_ID_RECORDING_INDICATOR = "recording-indicator";
export const TEST_ID_STREAM_DISABLED_REASON = "stream-disabled-reason";
export const TEST_ID_EDIT_DETAILS_BUTTON = "edit-details-btn";

// ── Session Manifest Modal ─────────────────────────────────────────────────────
export const TEST_ID_SESSION_MANIFEST_MODAL = "session-manifest-modal";
export const TEST_ID_MANIFEST_SPEAKER = "manifest-speaker";
export const TEST_ID_MANIFEST_TITLE = "manifest-title";
export const TEST_ID_MANIFEST_PREVIEW = "manifest-preview";
export const TEST_ID_MANIFEST_SAVE = "manifest-save";
export const TEST_ID_MANIFEST_CANCEL = "manifest-cancel";
export const TEST_ID_MANIFEST_CLEAR = "manifest-clear";
export const TEST_ID_MANIFEST_SAVE_ERROR = "manifest-save-error";

// ── Scripture Reference ────────────────────────────────────────────────────────
export const TEST_ID_SCRIPTURE_BOOK_SELECT = "scripture-book-select";
export const TEST_ID_SCRIPTURE_CHAPTER_SELECT = "scripture-chapter-select";
export const TEST_ID_SCRIPTURE_VERSE_SELECT = "scripture-verse-select";
export const TEST_ID_SCRIPTURE_VERSE_END_SELECT = "scripture-verse-end-select";

// ── Admin User Management ──────────────────────────────────────────────────────
export const TEST_ID_ADMIN_USERS_PAGE = "admin-users-page";
export const TEST_ID_CREATE_USER_FORM = "create-user-form";
export const TEST_ID_CREATE_USERNAME = "create-username";
export const TEST_ID_CREATE_PASSWORD = "create-password";
export const TEST_ID_CREATE_ROLE_SELECT = "create-role-select";
export const TEST_ID_CREATE_USER_SUBMIT = "create-user-submit";
export const TEST_ID_CREATE_USER_ERROR = "create-user-error";
export const TEST_ID_USER_LIST = "user-list";
export const TEST_ID_EDIT_USERNAME = "edit-username";
export const TEST_ID_EDIT_PASSWORD = "edit-password";
export const TEST_ID_EDIT_ROLE_SELECT = "edit-role-select";
export const TEST_ID_EDIT_SAVE = "edit-save";
export const TEST_ID_EDIT_CANCEL = "edit-cancel";
export const TEST_ID_EDIT_USER_ERROR = "edit-user-error";

// ── Admin Device Management ────────────────────────────────────────────────────
export const TEST_ID_ADMIN_DEVICES_PAGE = "admin-devices-page";
export const TEST_ID_CREATE_DEVICE_FORM = "create-device-form";
export const TEST_ID_CREATE_DEVICE_LABEL = "create-device-label";
export const TEST_ID_CREATE_DEVICE_HOST = "create-device-host";
export const TEST_ID_CREATE_DEVICE_PORT = "create-device-port";
export const TEST_ID_CREATE_DEVICE_PASSWORD = "create-device-password";
export const TEST_ID_CREATE_DEVICE_TEMPLATE = "create-device-template";
export const TEST_ID_CREATE_TEMPLATE_PREVIEW = "create-template-preview";
export const TEST_ID_CREATE_DEVICE_SUBMIT = "create-device-submit";
export const TEST_ID_CREATE_DEVICE_ERROR = "create-device-error";
export const TEST_ID_DEVICE_LIST = "device-list";
export const TEST_ID_EDIT_DEVICE_LABEL = "edit-device-label";
export const TEST_ID_EDIT_DEVICE_HOST = "edit-device-host";
export const TEST_ID_EDIT_DEVICE_PORT = "edit-device-port";
export const TEST_ID_EDIT_DEVICE_PASSWORD = "edit-device-password";
export const TEST_ID_EDIT_DEVICE_TEMPLATE = "edit-device-template";
export const TEST_ID_EDIT_TEMPLATE_PREVIEW = "edit-template-preview";
export const TEST_ID_EDIT_DEVICE_ENABLED = "edit-device-enabled";
export const TEST_ID_EDIT_DEVICE_SAVE = "edit-device-save";
export const TEST_ID_EDIT_DEVICE_CANCEL = "edit-device-cancel";
export const TEST_ID_EDIT_DEVICE_ERROR = "edit-device-error";
