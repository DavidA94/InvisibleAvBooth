export interface WidgetTypeDefinition {
  /** Display name shown in grid editor and WidgetContainer title bar */
  displayName: string;
  /** Minimum number of columns this widget can occupy */
  minColSpan: number;
  /** Maximum columns (null = unconstrained up to grid bounds) */
  maxColSpan: number | null;
  /** Minimum number of rows this widget can occupy */
  minRowSpan: number;
  /** Maximum rows (null = unconstrained) */
  maxRowSpan: number | null;
}

/**
 * Authoritative widget size constraints.
 *
 * These values define minimum and maximum col/row spans for each widget type.
 * Because grids have dynamic row counts (they grow vertically as needed),
 * fitting all widgets is only constrained by column count — not row count.
 *
 * - OBS: Status bar + 2 buttons need ~2 cols minimum; 2 rows for status+controls.
 *   Max 5×4 prevents an absurdly stretched layout with wasted space.
 * - Lower Thirds: Library list + active section need 2×2 minimum for usable
 *   inline interaction (active item + dismiss button + at least one library row).
 *   Unconstrained max — benefits from extra space (more list items visible).
 * - OBS Preview: Video frame needs at least 2×2 to be recognizable.
 *   Unconstrained max — video scales cleanly.
 * - Camera: Video + joystick + presets. Needs 3×2 minimum (compact layout
 *   with video-only view; tapping opens full control modal).
 *   Unconstrained max — uses extra space for larger preview and expanded controls.
 *
 * On 3-column grids (small-portrait), all widgets stack at full width (3 cols).
 * On 7-column grids (small-landscape, large-portrait), widgets can sit side-by-side.
 * The grid simply grows taller as needed — no fixed-row ceiling.
 */
export const WIDGET_TYPE_REGISTRY: Record<string, WidgetTypeDefinition> = {
  obs: {
    displayName: "OBS",
    minColSpan: 2,
    maxColSpan: 5,
    minRowSpan: 2,
    maxRowSpan: 4,
  },
  "lower-thirds": {
    displayName: "Lower Thirds",
    minColSpan: 2,
    maxColSpan: null,
    minRowSpan: 2,
    maxRowSpan: null,
  },
  "obs-preview": {
    displayName: "OBS Preview",
    minColSpan: 2,
    maxColSpan: null,
    minRowSpan: 2,
    maxRowSpan: null,
  },
  camera: {
    displayName: "Camera",
    minColSpan: 3,
    maxColSpan: null,
    minRowSpan: 2,
    maxRowSpan: null,
  },
  soundboard: {
    displayName: "Sound Board",
    // 3×3 minimum: fits the 3-channel minimum on small-portrait (3 cols); rows
    // cover name + gain button + fader/meter + mute + preset row. Unconstrained
    // max — uses extra space for more channels/presets (Req 5.1).
    minColSpan: 3,
    maxColSpan: null,
    minRowSpan: 3,
    maxRowSpan: null,
  },
};

/** Ordered list of widget type IDs for the "add widget" UI */
export const WIDGET_TYPE_IDS: string[] = Object.keys(WIDGET_TYPE_REGISTRY);
