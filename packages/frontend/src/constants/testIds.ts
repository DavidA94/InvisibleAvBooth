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
export const TEST_ID_TITLE_BAR_LOGOUT_BUTTON = "title-bar-logout-button";

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
export const TEST_ID_CONFIRMATION_CANCEL_BUTTON = "confirmation-cancel-button";
export const TEST_ID_CONFIRMATION_CONFIRM_BUTTON = "confirmation-confirm-button";

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
export const TEST_ID_OBS_STREAM_BUTTON = "obs-stream-button";
export const TEST_ID_OBS_RECORD_BUTTON = "obs-record-button";
export const TEST_ID_STREAM_STATUS = "stream-status";
export const TEST_ID_STREAM_TIMECODE = "stream-timecode";
export const TEST_ID_RECORDING_INDICATOR = "recording-indicator";
export const TEST_ID_STREAM_DISABLED_REASON = "stream-disabled-reason";
export const TEST_ID_EDIT_DETAILS_BUTTON = "edit-details-button";
export const TEST_ID_MANAGE_STREAMS_BUTTON = "manage-streams-button";
export const TEST_ID_MANAGE_STREAMS_MODAL = "manage-streams-modal";
export const TEST_ID_PLATFORM_START_ALL = "platform-start-all";
export const TEST_ID_PLATFORM_STOP_ALL = "platform-stop-all";
export const TEST_ID_PLATFORM_ROW = "platform-row";
export const TEST_ID_PLATFORM_START_SINGLE = "platform-start-single";
export const TEST_ID_PLATFORM_STOP_SINGLE = "platform-stop-single";

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

// ── Admin Index ────────────────────────────────────────────────────────────────
export const TEST_ID_ADMIN_INDEX_PAGE = "admin-index-page";
export const TEST_ID_TITLE_BAR_ADMIN_LINK = "title-bar-admin-link";

// ── Admin User Management ──────────────────────────────────────────────────────
export const TEST_ID_ADMIN_USERS_PAGE = "admin-users-page";
export const TEST_ID_USER_LIST = "user-list";
export const TEST_ID_USER_LIST_ITEM = "user-list-item";
export const TEST_ID_ADD_USER_BUTTON = "add-user-button";
export const TEST_ID_USER_DETAIL_PANEL = "user-detail-panel";
export const TEST_ID_USER_DETAIL_EMPTY = "user-detail-empty";
export const TEST_ID_USER_LIST_DELETE_BUTTON = "user-list-delete-button";
export const TEST_ID_USER_FORM_USERNAME = "user-form-username";
export const TEST_ID_USER_FORM_PASSWORD = "user-form-password";
export const TEST_ID_USER_FORM_ROLE_SELECT = "user-form-role-select";
export const TEST_ID_USER_FORM_SAVE = "user-form-save";
export const TEST_ID_USER_FORM_DELETE = "user-form-delete";
export const TEST_ID_USER_FORM_ERROR = "user-form-error";

// Legacy aliases — kept for backward compatibility
export const TEST_ID_CREATE_USER_FORM = "create-user-form";
export const TEST_ID_CREATE_USERNAME = "create-username";
export const TEST_ID_CREATE_PASSWORD = "create-password";
export const TEST_ID_CREATE_ROLE_SELECT = "create-role-select";
export const TEST_ID_CREATE_USER_SUBMIT = "create-user-submit";
export const TEST_ID_CREATE_USER_ERROR = "create-user-error";
export const TEST_ID_EDIT_USERNAME = "edit-username";
export const TEST_ID_EDIT_PASSWORD = "edit-password";
export const TEST_ID_EDIT_ROLE_SELECT = "edit-role-select";
export const TEST_ID_EDIT_SAVE = "edit-save";
export const TEST_ID_EDIT_CANCEL = "edit-cancel";
export const TEST_ID_EDIT_USER_ERROR = "edit-user-error";

// ── Admin Device Management ────────────────────────────────────────────────────
export const TEST_ID_ADMIN_DEVICES_PAGE = "admin-devices-page";
export const TEST_ID_DEVICE_LIST = "device-list";
export const TEST_ID_DEVICE_LIST_ITEM = "device-list-item";
export const TEST_ID_ADD_DEVICE_BUTTON = "add-device-button";
export const TEST_ID_ADD_DEVICE_POPOVER = "add-device-popover";
export const TEST_ID_ADD_DEVICE_TYPE_OPTION = "add-device-type-option";
export const TEST_ID_DEVICE_DETAIL_PANEL = "device-detail-panel";
export const TEST_ID_DEVICE_DETAIL_EMPTY = "device-detail-empty";
export const TEST_ID_DEVICE_LIST_DELETE_BUTTON = "device-list-delete-button";

// ── Device Form (shared across device types) ──────────────────────────────────
export const TEST_ID_DEVICE_FORM_LABEL = "device-form-label";
export const TEST_ID_DEVICE_FORM_HOST = "device-form-host";
export const TEST_ID_DEVICE_FORM_PORT = "device-form-port";
export const TEST_ID_DEVICE_FORM_PASSWORD = "device-form-password";
export const TEST_ID_DEVICE_FORM_TEMPLATE = "device-form-template";
export const TEST_ID_DEVICE_FORM_TEMPLATE_PREVIEW = "device-form-template-preview";
export const TEST_ID_DEVICE_FORM_ENABLED = "device-form-enabled";
export const TEST_ID_DEVICE_FORM_SAVE = "device-form-save";
export const TEST_ID_DEVICE_FORM_DELETE = "device-form-delete";
export const TEST_ID_DEVICE_FORM_ERROR = "device-form-error";

// Legacy aliases — kept for backward compatibility with existing tests
export const TEST_ID_CREATE_DEVICE_FORM = "create-device-form";
export const TEST_ID_CREATE_DEVICE_LABEL = "create-device-label";
export const TEST_ID_CREATE_DEVICE_HOST = "create-device-host";
export const TEST_ID_CREATE_DEVICE_PORT = "create-device-port";
export const TEST_ID_CREATE_DEVICE_PASSWORD = "create-device-password";
export const TEST_ID_CREATE_DEVICE_TEMPLATE = "create-device-template";
export const TEST_ID_CREATE_TEMPLATE_PREVIEW = "create-template-preview";
export const TEST_ID_CREATE_DEVICE_SUBMIT = "create-device-submit";
export const TEST_ID_CREATE_DEVICE_ERROR = "create-device-error";
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

// ── Session Manifest Modal — Template Dropdowns ────────────────────────────────
export const TEST_ID_MANIFEST_TITLE_TEMPLATE = "manifest-title-template";
export const TEST_ID_MANIFEST_DESCRIPTION_TEMPLATE = "manifest-description-template";
export const TEST_ID_MANIFEST_DESCRIPTION_PREVIEW = "manifest-description-preview";

// ── Admin Templates Page ───────────────────────────────────────────────────────
export const TEST_ID_ADMIN_TEMPLATES_PAGE = "admin-templates-page";
export const TEST_ID_TITLE_TEMPLATE_LIST = "title-template-list";
export const TEST_ID_DESCRIPTION_TEMPLATE_LIST = "description-template-list";
export const TEST_ID_TEMPLATE_ITEM = "template-item";
export const TEST_ID_TEMPLATE_EDIT_BUTTON = "template-edit-button";
export const TEST_ID_TEMPLATE_DELETE_BUTTON = "template-delete-button";
export const TEST_ID_ADD_TITLE_TEMPLATE_BUTTON = "add-title-template-button";
export const TEST_ID_ADD_DESCRIPTION_TEMPLATE_BUTTON = "add-description-template-button";
export const TEST_ID_TEMPLATE_FORM_NAME = "template-form-name";
export const TEST_ID_TEMPLATE_FORM_FORMAT = "template-form-format";
export const TEST_ID_TEMPLATE_FORM_ROLE = "template-form-role";
export const TEST_ID_TEMPLATE_FORM_VALIDATE = "template-form-validate";
export const TEST_ID_TEMPLATE_FORM_SAVE = "template-form-save";
export const TEST_ID_TEMPLATE_FORM_CANCEL = "template-form-cancel";
export const TEST_ID_TEMPLATE_FORM_ERROR = "template-form-error";
export const TEST_ID_TEMPLATE_VALIDATION_BLOCKERS = "template-validation-blockers";
export const TEST_ID_TEMPLATE_VALIDATION_WARNINGS = "template-validation-warnings";
export const TEST_ID_TEMPLATE_FORM_AUTO_DISMISS = "template-form-auto-dismiss";
export const TEST_ID_TEMPLATE_FORM_DELETE = "template-form-delete";

// ── Platform Config Pages ──────────────────────────────────────────────────────
export const TEST_ID_YOUTUBE_CONFIG_PAGE = "youtube-config-page";
export const TEST_ID_FACEBOOK_CONFIG_PAGE = "facebook-config-page";
export const TEST_ID_PLATFORM_CONNECT_BUTTON = "platform-connect-button";
export const TEST_ID_PLATFORM_DISCONNECT_BUTTON = "platform-disconnect-button";
export const TEST_ID_PLATFORM_ACCOUNT_DISPLAY = "platform-account-display";

// ── Lower Thirds ──────────────────────────────────────────────────────────────
export const TEST_ID_LOWER_THIRD_WIDGET = "lower-third-widget";
export const TEST_ID_LT_ACTIVE_SECTION = "lt-active-section";
export const TEST_ID_LT_LIBRARY_SECTION = "lt-library-section";
export const TEST_ID_LT_DISMISS_BUTTON = "lt-dismiss-button";
export const TEST_ID_LT_SHOW_BUTTON = "lt-show-button";
export const TEST_ID_LT_FORCE_CLEAR_AREA = "lt-force-clear-area";
export const TEST_ID_LT_GO_LIVE_AREA = "lt-go-live-area";
export const TEST_ID_LT_DELETE_AREA = "lt-delete-area";
export const TEST_ID_LT_PAGINATION = "lt-pagination";
export const TEST_ID_LT_PAGE_INFO = "lt-page-info";
export const TEST_ID_LT_COUNTDOWN = "lt-countdown";
export const TEST_ID_LT_STATUS_OVERLAY = "lt-status-overlay";
export const TEST_ID_LT_PREVIEW_DIALOG = "lt-preview-dialog";
export const TEST_ID_LT_PREVIEW_GO_LIVE = "lt-preview-go-live";
export const TEST_ID_LT_PREVIEW_CANCEL = "lt-preview-cancel";
export const TEST_ID_LT_ADD_DIALOG = "lt-add-dialog";
export const TEST_ID_LT_ADD_TITLE_INPUT = "lt-add-title-input";
export const TEST_ID_LT_ADD_SUBTITLE_INPUT = "lt-add-subtitle-input";
export const TEST_ID_LT_ADD_AUTODISMISS_TOGGLE = "lt-add-autodismiss-toggle";
export const TEST_ID_LT_ADD_AUTODISMISS_DURATION = "lt-add-autodismiss-duration";
export const TEST_ID_LT_ADD_CANCEL = "lt-add-cancel";
export const TEST_ID_LT_ADD_SAVE = "lt-add-save";
export const TEST_ID_LT_EDIT_DIALOG = "lt-edit-dialog";
export const TEST_ID_LT_EDIT_TITLE_INPUT = "lt-edit-title-input";
export const TEST_ID_LT_EDIT_SUBTITLE_INPUT = "lt-edit-subtitle-input";
export const TEST_ID_LT_EDIT_AUTODISMISS_TOGGLE = "lt-edit-autodismiss-toggle";
export const TEST_ID_LT_EDIT_AUTODISMISS_DURATION = "lt-edit-autodismiss-duration";
export const TEST_ID_LT_EDIT_CANCEL = "lt-edit-cancel";
export const TEST_ID_LT_EDIT_SAVE = "lt-edit-save";
export const TEST_ID_BLUE_RHOMBUS = "blue-rhombus";
export const TEST_ID_SWIPEABLE_ROW = "swipeable-row";

// ── OBS Preview Widget ─────────────────────────────────────────────────────────
export const TEST_ID_OBS_PREVIEW_WIDGET = "obs-preview-widget";
export const TEST_ID_OBS_PREVIEW_VIDEO = "obs-preview-video";
export const TEST_ID_OBS_PREVIEW_MUTE_BTN = "obs-preview-mute-btn";
export const TEST_ID_OBS_PREVIEW_INACTIVE = "obs-preview-inactive";
export const TEST_ID_OBS_PREVIEW_RECONNECTING = "obs-preview-reconnecting";
export const TEST_ID_STREAM_PREVIEW_MODAL = "stream-preview-modal";
export const TEST_ID_STREAM_PREVIEW_DISMISS = "stream-preview-dismiss";
