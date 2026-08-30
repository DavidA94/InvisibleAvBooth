// Pure pagination logic for the Sound Board channel strip row (Req 13).
//
// Separated from the component so the boundary math and range labels can be
// unit-tested without a DOM/ResizeObserver.

/** Minimum width (rem) a channel strip needs to remain usable. */
export const STRIP_MIN_WIDTH_REM = 6;
/** Root font size (px) used to convert the observed pixel width to rem. */
export const BASE_FONT_SIZE = 16;

export interface PaginationLayout {
  /** True when pagination is required (channels exceed the strips that fit). */
  paginated: boolean;
  /** Channels shown per page (strips that fit, minus one for the pager when paginated). */
  perPage: number;
  /** Total number of pages. */
  pageCount: number;
}

/**
 * Compute the pagination layout for a given available width and channel count.
 *
 * stripsThatFit = floor(availableRem / STRIP_MIN_WIDTH_REM). If channelCount
 * exceeds that, the last slot becomes the pager and perPage = stripsThatFit − 1.
 * Boundary (Req 5.6/13.2): at exactly-3-fit-with-overflow we show 2 + the pager
 * (this falls out of perPage = fit − 1 naturally).
 */
export function computePaginationLayout(availableWidthPx: number, channelCount: number): PaginationLayout {
  const availableRem = availableWidthPx / BASE_FONT_SIZE;
  const stripsThatFit = Math.max(1, Math.floor(availableRem / STRIP_MIN_WIDTH_REM));

  if (channelCount <= stripsThatFit) {
    return { paginated: false, perPage: channelCount, pageCount: channelCount === 0 ? 0 : 1 };
  }

  const perPage = Math.max(1, stripsThatFit - 1); // last slot is the pager
  const pageCount = Math.ceil(channelCount / perPage);
  return { paginated: true, perPage, pageCount };
}

/** The 1-based channel indices visible on a given page (page is 0-based). */
export function channelsForPage(page: number, perPage: number, channelCount: number): number[] {
  const start = page * perPage; // 0-based offset
  const channels: number[] = [];
  for (let index = start; index < Math.min(start + perPage, channelCount); index++) {
    channels.push(index + 1); // channels are 1-based
  }
  return channels;
}

/**
 * Label for a range button, e.g. "See channels 4–6 of 9". `page` is the target
 * page the button navigates to (0-based).
 */
export function rangeLabel(page: number, perPage: number, channelCount: number): string {
  const start = page * perPage + 1;
  const end = Math.min((page + 1) * perPage, channelCount);
  return `See channels ${start}–${end} of ${channelCount}`;
}
