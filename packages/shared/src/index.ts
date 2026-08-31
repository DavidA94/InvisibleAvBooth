// Data
export { BIBLE_BOOKS } from "./bibleBooks.js";
export { BIBLE_REFERENCES } from "./bibleReferences.js";

// Constants
export * from "./constants/socketEvents.js";
export * from "./constants/urls.js";
export * from "./constants/preview.js";
export * from "./constants/mixer.js";

// Widget Type Registry
export { WIDGET_TYPE_REGISTRY, WIDGET_TYPE_IDS } from "./widgetTypeRegistry.js";
export type { WidgetTypeDefinition } from "./widgetTypeRegistry.js";

// Grid Types
export {
  GRID_TYPES,
  GRID_DIMENSIONS,
  GRID_CELL_SIZE_REM,
  GRID_GAP_SIZE_REM,
  computeGridHeightRem,
  BREAKPOINT_LARGE_LANDSCAPE,
  BREAKPOINT_LARGE_PORTRAIT,
  MIN_SCALE_FLOOR,
} from "./gridTypes.js";
export type { GridType, GridDimensions } from "./gridTypes.js";

// Types
export type {
  Role,
  AuthUser,
  ObsState,
  ObsCommandType,
  ObsCommand,
  CommandResult,
  NotificationLevel,
  NotificationSeverity,
  Notification,
  GridManifest,
  GridCell,
} from "./types.js";

// Camera Types
export type { CameraFeature, CameraModel, PositionInquiry, CameraPreset, CameraState, CameraMetadata, ObsMetadata, CameraSetPayload } from "./types/camera.js";

// Mixer (Sound Board) Types
export type {
  MixerModel,
  MixerFeature,
  MixerCapabilities,
  MixerChannelState,
  MixerState,
  MixerPresetSummary,
  MixerPresetPayload,
  MixerChannelLevel,
  EnvelopePair,
  MixerCommand,
} from "./types/mixer.js";

// Mixer fader taper
export { faderFloatToDb, faderDbToFloat, FADER_TICKS_DB, gainDbToFloat, gainFloatToDb } from "./mixerTaper.js";

// Envelope codec (gain-window binary frames)
export { encodeEnvelopeFrame, decodeEnvelopeFrame } from "./envelopeCodec.js";

// Lower-Third Types
export type {
  LowerThirdType,
  AnimationPhase,
  LowerThirdStyle,
  TitleContent,
  TitleSubtitleContent,
  VerseData,
  ScriptureContent,
  PageInfo,
  PageBreakdown,
  LowerThirdItem,
  LowerThirdState,
  AddLowerThirdInput,
  EditLowerThirdInput,
  LowerThirdCommand,
} from "./types/lowerThirds.js";

// Interpolation
export { interpolateTemplate, interpolateStreamTitle, formatScripture } from "./interpolation.js";
export type { ScriptureReference, SessionManifestFields } from "./interpolation.js";

// Scripture lookup
export { MAX_CHAPTERS, MAX_VERSES, getChaptersForBook, getVerseRange, isChapterValid, isVerseValidForBook, isVerseValidForChapter } from "./scriptureLookup.js";
