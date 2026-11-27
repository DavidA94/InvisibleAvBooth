/**
 * Current root font size in px. On a dashboard this is the scaled value (`--dashboard-scale-font-size`),
 * so it changes with the viewport. Falls back to 16 outside a browser.
 */
export function rootFontSizePx(): number {
  if (typeof document === "undefined") return 16;
  const size = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(size) && size > 0 ? size : 16;
}

/**
 * Convert rem to px at the CURRENT root font size (dashboard-management Req 2.10).
 *
 * Use this whenever a measured width (ResizeObserver, getBoundingClientRect) is compared against a
 * threshold. Comparing against a fixed px number, or dividing by a hard-coded 16, makes a widget switch
 * layout at different sizes on different devices because the dashboard scales the root font size.
 * Call it at comparison time, not at module load: the root size changes when the viewport does.
 */
export function remToPx(rem: number): number {
  return rem * rootFontSizePx();
}
