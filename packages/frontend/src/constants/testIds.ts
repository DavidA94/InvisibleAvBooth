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
export const TEST_ID_DEVICE_FORM_NDI_OUTPUT_NAME = "device-form-ndi-output-name";
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
export const TEST_ID_LOWER_THIRD_ACTIVE_SECTION = "lower-third-active-section";
export const TEST_ID_LOWER_THIRD_LIBRARY_SECTION = "lower-third-library-section";
export const TEST_ID_LOWER_THIRD_DISMISS_BUTTON = "lower-third-dismiss-button";
export const TEST_ID_LOWER_THIRD_SHOW_BUTTON = "lower-third-show-button";
export const TEST_ID_LOWER_THIRD_FORCE_CLEAR_AREA = "lower-third-force-clear-area";
export const TEST_ID_LOWER_THIRD_GO_LIVE_AREA = "lower-third-go-live-area";
export const TEST_ID_LOWER_THIRD_DELETE_AREA = "lower-third-delete-area";
export const TEST_ID_LOWER_THIRD_PAGINATION = "lower-third-pagination";
export const TEST_ID_LOWER_THIRD_PAGE_INFO = "lower-third-page-info";
export const TEST_ID_LOWER_THIRD_COUNTDOWN = "lower-third-countdown";
export const TEST_ID_LOWER_THIRD_STATUS_OVERLAY = "lower-third-status-overlay";
export const TEST_ID_LOWER_THIRD_PREVIEW_DIALOG = "lower-third-preview-dialog";
export const TEST_ID_LOWER_THIRD_PREVIEW_GO_LIVE = "lower-third-preview-go-live";
export const TEST_ID_LOWER_THIRD_PREVIEW_CANCEL = "lower-third-preview-cancel";
export const TEST_ID_LOWER_THIRD_ADD_DIALOG = "lower-third-add-dialog";
export const TEST_ID_LOWER_THIRD_ADD_TITLE_INPUT = "lower-third-add-title-input";
export const TEST_ID_LOWER_THIRD_ADD_SUBTITLE_INPUT = "lower-third-add-subtitle-input";
export const TEST_ID_LOWER_THIRD_ADD_AUTODISMISS_TOGGLE = "lower-third-add-autodismiss-toggle";
export const TEST_ID_LOWER_THIRD_ADD_AUTODISMISS_DURATION = "lower-third-add-autodismiss-duration";
export const TEST_ID_LOWER_THIRD_ADD_CANCEL = "lower-third-add-cancel";
export const TEST_ID_LOWER_THIRD_ADD_SAVE = "lower-third-add-save";
export const TEST_ID_LOWER_THIRD_EDIT_DIALOG = "lower-third-edit-dialog";
export const TEST_ID_LOWER_THIRD_EDIT_TITLE_INPUT = "lower-third-edit-title-input";
export const TEST_ID_LOWER_THIRD_EDIT_SUBTITLE_INPUT = "lower-third-edit-subtitle-input";
export const TEST_ID_LOWER_THIRD_EDIT_AUTODISMISS_TOGGLE = "lower-third-edit-autodismiss-toggle";
export const TEST_ID_LOWER_THIRD_EDIT_AUTODISMISS_DURATION = "lower-third-edit-autodismiss-duration";
export const TEST_ID_LOWER_THIRD_EDIT_CANCEL = "lower-third-edit-cancel";
export const TEST_ID_LOWER_THIRD_EDIT_SAVE = "lower-third-edit-save";
export const TEST_ID_BLUE_RHOMBUS = "blue-rhombus";
export const TEST_ID_SWIPEABLE_ROW = "swipeable-row";

// ── OBS Preview Widget ─────────────────────────────────────────────────────────
export const TEST_ID_OBS_PREVIEW_WIDGET = "obs-preview-widget";
export const TEST_ID_OBS_PREVIEW_VIDEO = "obs-preview-video";
export const TEST_ID_OBS_PREVIEW_MUTE_BUTTON = "obs-preview-mute-button";
export const TEST_ID_OBS_PREVIEW_INACTIVE = "obs-preview-inactive";
export const TEST_ID_OBS_PREVIEW_RECONNECTING = "obs-preview-reconnecting";

// ── Audio Level Meters ─────────────────────────────────────────────────────────
export const TEST_ID_AUDIO_METER_CONTAINER = "audio-meter-container";
export const TEST_ID_AUDIO_METER_LEFT = "audio-meter-left";
export const TEST_ID_AUDIO_METER_RIGHT = "audio-meter-right";

// ── Fullscreen Toggle ──────────────────────────────────────────────────────────
export const TEST_ID_FULLSCREEN_BUTTON = "fullscreen-button";

// ── Admin Dashboard Management ─────────────────────────────────────────────────
export const TEST_ID_ADMIN_DASHBOARDS_PAGE = "admin-dashboards-page";
export const TEST_ID_DASHBOARD_LIST = "dashboard-list";
export const TEST_ID_DASHBOARD_LIST_ITEM = "dashboard-list-item";
export const TEST_ID_ADD_DASHBOARD_BUTTON = "add-dashboard-button";
export const TEST_ID_DASHBOARD_FORM_NAME = "dashboard-form-name";
export const TEST_ID_DASHBOARD_FORM_SLUG = "dashboard-form-slug";
export const TEST_ID_DASHBOARD_FORM_DESCRIPTION = "dashboard-form-description";
export const TEST_ID_DASHBOARD_FORM_ROLES = "dashboard-form-roles";
export const TEST_ID_DASHBOARD_FORM_SAVE = "dashboard-form-save";
export const TEST_ID_DASHBOARD_FORM_DELETE = "dashboard-form-delete";
export const TEST_ID_DASHBOARD_FORM_ERROR = "dashboard-form-error";
export const TEST_ID_DASHBOARD_GRID_TAB = "dashboard-grid-tab";
export const TEST_ID_DASHBOARD_GRID_EDITOR = "dashboard-grid-editor";
export const TEST_ID_GRID_EDITOR_WIDGET = "grid-editor-widget";
export const TEST_ID_GRID_EDITOR_GHOST = "grid-editor-ghost";
export const TEST_ID_GRID_EDITOR_ADD_WIDGET = "grid-editor-add-widget";
export const TEST_ID_GRID_EDITOR_WIDGET_DELETE = "grid-editor-widget-delete";
export const TEST_ID_GRID_EDITOR_WIDGET_OPTIONS = "grid-editor-widget-options";
export const TEST_ID_GRID_EDITOR_ADD_ROW = "grid-editor-add-row";
export const TEST_ID_GRID_EDITOR_SCREEN_EDGE = "grid-editor-screen-edge";
export const TEST_ID_DASHBOARD_LIST_DELETE_BUTTON = "dashboard-list-delete-button";
export const TEST_ID_DASHBOARD_SLUG_ERROR = "dashboard-slug-error";
export const TEST_ID_DASHBOARD_DETAIL_PANEL = "dashboard-detail-panel";
export const TEST_ID_DASHBOARD_DETAIL_EMPTY = "dashboard-detail-empty";

// ── Camera Widget ──────────────────────────────────────────────────────────────
export const TEST_ID_CAMERA_WIDGET = "camera-widget";
export const TEST_ID_CAMERA_SELECT = "camera-select";
export const TEST_ID_CAMERA_CONTROLS = "camera-controls";
export const TEST_ID_CAMERA_PREVIEW = "camera-preview";
export const TEST_ID_CAMERA_OFFLINE_OVERLAY = "camera-offline-overlay";
export const TEST_ID_CAMERA_CONNECTING_OVERLAY = "camera-connecting-overlay";
export const TEST_ID_CAMERA_ZOOM_SLIDER = "camera-zoom-slider";
export const TEST_ID_CAMERA_FOCUS_SLIDER = "camera-focus-slider";
export const TEST_ID_CAMERA_TOGGLE_ROW = "camera-toggle-row";
export const TEST_ID_PTZ_JOYSTICK = "ptz-joystick";
export const TEST_ID_PTZ_JOYSTICK_DOT = "ptz-joystick-dot";

// ── Camera Presets ─────────────────────────────────────────────────────────────
export const TEST_ID_PRESET_LIST = "preset-list";
export const TEST_ID_PRESET_ROW = "preset-row";
export const TEST_ID_PRESET_ACTIVATE_BUTTON = "preset-activate-button";
export const TEST_ID_PRESET_SAVE_BUTTON = "preset-save-button";
export const TEST_ID_PRESET_CANCEL_BUTTON = "preset-cancel-button";
export const TEST_ID_PRESET_NAME_INPUT = "preset-name-input";
export const TEST_ID_PRESET_STORE_ON_CAMERA_TOGGLE = "store-on-camera-toggle";
export const TEST_ID_PRESET_SLOT_INPUT = "preset-slot-input";
export const TEST_ID_PRESET_POSITION_SUMMARY = "position-summary";

// ── Camera Device Form ─────────────────────────────────────────────────────────
export const TEST_ID_CAMERA_NDI_SOURCE = "camera-ndi-source";
export const TEST_ID_DEVICE_FORM_NDI_EXTRA_IPS = "device-form-ndi-extra-ips";

// ── Sound Board Widget ─────────────────────────────────────────────────────────
export const TEST_ID_SOUNDBOARD_WIDGET = "soundboard-widget";
export const TEST_ID_SOUNDBOARD_MIXER_SELECT = "soundboard-mixer-select";
export const TEST_ID_SOUNDBOARD_STRIP_ROW = "soundboard-strip-row";
export const TEST_ID_SOUNDBOARD_CHANNEL_STRIP = "soundboard-channel-strip";
export const TEST_ID_SOUNDBOARD_CHANNEL_NAME = "soundboard-channel-name";
export const TEST_ID_SOUNDBOARD_EMPTY_PLACEHOLDER = "soundboard-empty-placeholder";
export const TEST_ID_MIXER_VERTICAL_FADER = "mixer-vertical-fader";
export const TEST_ID_MIXER_CHANNEL_METER = "mixer-channel-meter";
export const TEST_ID_MIXER_MUTE_BUTTON = "mixer-mute-button";
export const TEST_ID_MIXER_MUTE_STATUS = "mixer-mute-status";
export const TEST_ID_MIXER_ADJUST_GAIN_BUTTON = "mixer-adjust-gain-button";
export const TEST_ID_MIXER_GAIN_MODAL = "mixer-gain-modal";
export const TEST_ID_MIXER_GAIN_SLIDER = "mixer-gain-slider";
export const TEST_ID_MIXER_GAIN_SEMICIRCLE = "mixer-gain-semicircle";
export const TEST_ID_MIXER_ENVELOPE_CANVAS = "mixer-envelope-canvas";
export const TEST_ID_MIXER_GAIN_UNAVAILABLE_NOTE = "mixer-gain-unavailable-note";
export const TEST_ID_MIXER_PRESETS_AREA = "mixer-presets-area";
export const TEST_ID_MIXER_PRESET_BUTTON = "mixer-preset-button";
export const TEST_ID_MIXER_VIEW_ALL_PRESETS_BUTTON = "mixer-view-all-presets-button";
export const TEST_ID_MIXER_VIEW_ALL_PRESETS_MODAL = "mixer-view-all-presets-modal";
export const TEST_ID_MIXER_PAGINATION = "mixer-pagination";
export const TEST_ID_MIXER_PAGINATION_PREV = "mixer-pagination-prev";
export const TEST_ID_MIXER_PAGINATION_NEXT = "mixer-pagination-next";
